/**
 * Session Persistence Service (mem0-style)
 *
 * Maintains a "hot context" snapshot — a structured summary of recent
 * conversation state that is saved to disk on every turn and loaded
 * instantly at startup. This means Milla has full context on the very
 * first message after a server restart with zero DB scan latency.
 *
 * Persistence path: memory/session_hot_context.json
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { ToolEvent } from './toolEventBag';
import { formatToolEvents } from './toolEventBag';

const SNAPSHOT_PATH = path.join(
  process.cwd(),
  'memory',
  'session_hot_context.json'
);
const MAX_TOPIC_QUEUE = 10;
const MAX_RECENT_TURNS = 20;
const SAVE_DEBOUNCE_MS = 2000;

export interface HotContextTurn {
  role: 'user' | 'assistant';
  content: string;
  channel: string;
  ts: number;
  toolEvents?: ToolEvent[];
}

export interface HotContext {
  version: 2;
  updatedAt: number;
  userId: string;
  /** Rolling window of recent turns for zero-reload context */
  recentTurns: HotContextTurn[];
  /** Active topics extracted from recent turns */
  activeTopics: string[];
  /** Running emotional tone summary (overwritten each update) */
  emotionalTone: string;
  /** Last known channel */
  lastChannel: string;
  /** Total turn count since last full restart */
  totalTurns: number;
}

let _snapshot: HotContext | null = null;
let _saveTimer: ReturnType<typeof setTimeout> | null = null;

const DEFAULT_SNAPSHOT = (): HotContext => ({
  version: 2,
  updatedAt: Date.now(),
  userId: 'default-user',
  recentTurns: [],
  activeTopics: [],
  emotionalTone: 'neutral',
  lastChannel: 'web',
  totalTurns: 0,
});

// ── Load ──────────────────────────────────────────────────────────────────────

export async function loadHotContext(): Promise<HotContext> {
  if (_snapshot) return _snapshot;

  if (!existsSync(SNAPSHOT_PATH)) {
    _snapshot = DEFAULT_SNAPSHOT();
    return _snapshot;
  }

  try {
    const raw = await readFile(SNAPSHOT_PATH, 'utf8');
    const parsed = JSON.parse(raw) as HotContext;
    // Migrate v1 snapshots
    if (!parsed.version || parsed.version < 2) {
      _snapshot = { ...DEFAULT_SNAPSHOT(), ...parsed, version: 2 };
    } else {
      _snapshot = parsed;
    }
    console.log(
      `[SessionPersistence] Hot context loaded: ${_snapshot.recentTurns.length} turns, ` +
        `topics: [${_snapshot.activeTopics.join(', ')}]`
    );
    return _snapshot;
  } catch (err) {
    console.warn(
      '[SessionPersistence] Failed to load snapshot, starting fresh:',
      err
    );
    _snapshot = DEFAULT_SNAPSHOT();
    return _snapshot;
  }
}

// ── Save (debounced) ──────────────────────────────────────────────────────────

function scheduleSave(): void {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    if (!_snapshot) return;
    try {
      await mkdir(path.dirname(SNAPSHOT_PATH), { recursive: true });
      await writeFile(
        SNAPSHOT_PATH,
        JSON.stringify(_snapshot, null, 2),
        'utf8'
      );
    } catch (err) {
      console.warn('[SessionPersistence] Save error:', err);
    }
  }, SAVE_DEBOUNCE_MS);
}

// ── Update ────────────────────────────────────────────────────────────────────

/**
 * Record a conversation turn in the hot context.
 * Call this after each user+assistant turn pair.
 */
export async function recordTurn(
  userMessage: string,
  assistantReply: string,
  channel: string = 'web',
  userId: string = 'default-user',
  toolEvents?: ToolEvent[]
): Promise<void> {
  const ctx = await loadHotContext();
  const now = Date.now();

  ctx.userId = userId;
  ctx.lastChannel = channel;
  ctx.totalTurns += 1;
  ctx.updatedAt = now;

  ctx.recentTurns.push(
    { role: 'user', content: userMessage.slice(0, 500), channel, ts: now },
    {
      role: 'assistant',
      content: assistantReply.slice(0, 500),
      channel,
      ts: now,
      toolEvents: toolEvents && toolEvents.length > 0 ? toolEvents : undefined,
    }
  );

  // Keep rolling window
  if (ctx.recentTurns.length > MAX_RECENT_TURNS * 2) {
    ctx.recentTurns = ctx.recentTurns.slice(-MAX_RECENT_TURNS * 2);
  }

  // Simple topic extraction: noun phrases / capitalized words from user message
  const newTopics = extractTopics(userMessage);
  for (const t of newTopics) {
    if (!ctx.activeTopics.includes(t)) ctx.activeTopics.unshift(t);
  }
  ctx.activeTopics = ctx.activeTopics.slice(0, MAX_TOPIC_QUEUE);

  scheduleSave();
}

/**
 * Update emotional tone (called by sentiment analysis if available)
 */
export async function updateEmotionalTone(tone: string): Promise<void> {
  const ctx = await loadHotContext();
  ctx.emotionalTone = tone;
  scheduleSave();
}

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * Get a formatted context string for injection into the system prompt.
 * Zero-latency — uses the in-memory snapshot.
 */
export function getHotContextString(): string {
  if (!_snapshot || _snapshot.recentTurns.length === 0) return '';

  const turns = _snapshot.recentTurns
    .slice(-10) // last 5 turns
    .map((t) => {
      const base = `[${t.role.toUpperCase()}]: ${t.content}`;
      if (t.role === 'assistant' && t.toolEvents && t.toolEvents.length > 0) {
        return `${base}\n[TOOL CALLS]: ${formatToolEvents(t.toolEvents)}`;
      }
      return base;
    })
    .join('\n');

  const topics =
    _snapshot.activeTopics.length > 0
      ? `Active topics: ${_snapshot.activeTopics.slice(0, 5).join(', ')}`
      : '';

  const tone = `Emotional tone: ${_snapshot.emotionalTone}`;

  return [topics, tone, `Recent turns:\n${turns}`].filter(Boolean).join('\n');
}

export function getHotContextSnapshot(): HotContext | null {
  return _snapshot;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractTopics(text: string): string[] {
  // Extract meaningful words: capitalized multi-char words + quoted phrases
  const topics: string[] = [];

  // Quoted phrases
  const quoted = text.match(/"([^"]{3,40})"/g);
  if (quoted) topics.push(...quoted.map((q) => q.replace(/"/g, '')));

  // Capitalized words (likely proper nouns / names)
  const caps = text.match(/\b[A-Z][a-zA-Z]{3,}\b/g);
  if (caps) topics.push(...caps.filter((w) => !STOP_WORDS.has(w)));

  return [...new Set(topics)].slice(0, 3);
}

const STOP_WORDS = new Set([
  'The',
  'This',
  'That',
  'When',
  'What',
  'Where',
  'Which',
  'With',
  'From',
  'About',
  'After',
  'Before',
  'They',
  'Their',
  'There',
  'Have',
  'Been',
  'Does',
  'Will',
  'Should',
  'Could',
  'Would',
]);

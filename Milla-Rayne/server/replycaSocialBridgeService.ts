import { mkdir, readFile, stat, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { storage } from './storage';
import { getConsciousnessSchedulerStatus } from './consciousnessScheduler';
import type { InsertMessage } from '../shared/schema';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_STATE_PATH = path.resolve(MODULE_DIR, '..', 'memory', 'replyca_social_bridge.json');

interface ReplycaBridgeState {
  importedLineCount: number;
  importedMessages: number;
  lastSyncedAt: number | null;
}

export interface ReplycaSocialStatus {
  replycaRoot: string | null;
  sharedChatPath: string | null;
  statePath: string;
  sharedChatExists: boolean;
  totalLines: number;
  importedLineCount: number;
  pendingLines: number;
  importedMessages: number;
  lastSyncedAt: number | null;
}

export interface ReplycaSocialSyncResult extends ReplycaSocialStatus {
  synced: boolean;
  importedThisRun: number;
}

function resolveReplycaRoot(): string | null {
  const envRoot = process.env.REPLYCA_ROOT?.trim();
  if (envRoot) {
    return envRoot;
  }

  const schedulerRoot = getConsciousnessSchedulerStatus().replycaRoot;
  if (schedulerRoot) {
    return schedulerRoot;
  }

  const fallbackRoot = path.resolve(MODULE_DIR, '..', '..', 'ReplycA');
  return fallbackRoot;
}

function resolveSharedChatPath(root: string | null): string | null {
  if (!root) {
    return null;
  }

  return path.join(root, 'core_os', 'memory', 'shared_chat.jsonl');
}

function resolveStatePath(): string {
  return process.env.REPLYCA_SOCIAL_STATE_PATH?.trim() || DEFAULT_STATE_PATH;
}

async function readState(): Promise<ReplycaBridgeState> {
  try {
    const raw = await readFile(resolveStatePath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<ReplycaBridgeState>;
    return {
      importedLineCount: Number.isFinite(parsed.importedLineCount)
        ? Number(parsed.importedLineCount)
        : 0,
      importedMessages: Number.isFinite(parsed.importedMessages)
        ? Number(parsed.importedMessages)
        : 0,
      lastSyncedAt: Number.isFinite(parsed.lastSyncedAt)
        ? Number(parsed.lastSyncedAt)
        : null,
    };
  } catch {
    return {
      importedLineCount: 0,
      importedMessages: 0,
      lastSyncedAt: null,
    };
  }
}

async function writeState(state: ReplycaBridgeState): Promise<void> {
  const statePath = resolveStatePath();
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');
}

function mapReplycaSource(source: string | undefined): {
  channel: InsertMessage['channel'];
  displayRoleForUser: string;
} {
  const normalized = (source || '').toLowerCase();

  if (normalized.includes('telegram')) {
    return {
      channel: 'telegram',
      displayRoleForUser: 'Telegram Contact',
    };
  }

  if (normalized.includes('email')) {
    return {
      channel: 'gmail',
      displayRoleForUser: 'Gmail Contact',
    };
  }

  return {
    channel: 'api',
    displayRoleForUser: 'ReplycA Contact',
  };
}

function parseSharedHistoryLines(raw: string): Array<Record<string, unknown>> {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
}

async function getSharedHistorySnapshot(): Promise<{
  replycaRoot: string | null;
  sharedChatPath: string | null;
  sharedChatExists: boolean;
  totalLines: number;
  parsedLines: Array<Record<string, unknown>>;
}> {
  const replycaRoot = resolveReplycaRoot();
  const sharedChatPath = resolveSharedChatPath(replycaRoot);
  if (!sharedChatPath) {
    return {
      replycaRoot,
      sharedChatPath,
      sharedChatExists: false,
      totalLines: 0,
      parsedLines: [],
    };
  }

  try {
    await stat(sharedChatPath);
    const raw = await readFile(sharedChatPath, 'utf8');
    const parsedLines = parseSharedHistoryLines(raw);
    return {
      replycaRoot,
      sharedChatPath,
      sharedChatExists: true,
      totalLines: parsedLines.length,
      parsedLines,
    };
  } catch {
    return {
      replycaRoot,
      sharedChatPath,
      sharedChatExists: false,
      totalLines: 0,
      parsedLines: [],
    };
  }
}

export async function getReplycaSocialStatus(): Promise<ReplycaSocialStatus> {
  const snapshot = await getSharedHistorySnapshot();
  const state = await readState();

  return {
    replycaRoot: snapshot.replycaRoot,
    sharedChatPath: snapshot.sharedChatPath,
    statePath: resolveStatePath(),
    sharedChatExists: snapshot.sharedChatExists,
    totalLines: snapshot.totalLines,
    importedLineCount: state.importedLineCount,
    pendingLines: Math.max(snapshot.totalLines - state.importedLineCount, 0),
    importedMessages: state.importedMessages,
    lastSyncedAt: state.lastSyncedAt,
  };
}

let lastSyncAt = 0;
let lastSyncResult: ReplycaSocialSyncResult | null = null;
const SYNC_COOLDOWN_MS = 30_000;

export async function syncReplycaSharedHistory(): Promise<ReplycaSocialSyncResult> {
  const now = Date.now();
  if (lastSyncResult && now - lastSyncAt < SYNC_COOLDOWN_MS) {
    return lastSyncResult;
  }

  const snapshot = await getSharedHistorySnapshot();
  const state = await readState();

  if (!snapshot.sharedChatExists) {
    const result = { ...(await getReplycaSocialStatus()), synced: false, importedThisRun: 0 };
    lastSyncResult = result;
    lastSyncAt = now;
    return result;
  }

  let startIndex = state.importedLineCount;
  if (snapshot.totalLines < startIndex) {
    startIndex = 0;
  }

  const pendingEntries = snapshot.parsedLines.slice(startIndex);
  let importedThisRun = 0;
  const userId = process.env.REPLYCA_SOCIAL_USER_ID?.trim() || 'default-user';

  for (let index = 0; index < pendingEntries.length; index += 1) {
    const entry = pendingEntries[index];
    const role = entry.role === 'assistant' ? 'assistant' : 'user';
    const content =
      typeof entry.content === 'string' ? entry.content.trim() : '';

    if (!content) {
      continue;
    }

    const source = typeof entry.source === 'string' ? entry.source : '';
    const mapping = mapReplycaSource(source);
    const absoluteLineNumber = startIndex + index + 1;

    await storage.createMessage({
      userId,
      role,
      content,
      displayRole:
        role === 'assistant' ? 'ReplycA' : mapping.displayRoleForUser,
      channel: mapping.channel,
      sourcePlatform: 'replyca',
      externalMessageId: `replyca-shared-line:${absoluteLineNumber}`,
      metadata: {
        origin: 'replyca',
        source: source || null,
        lineNumber: absoluteLineNumber,
      },
    });
    importedThisRun += 1;
  }

  const nextState: ReplycaBridgeState = {
    importedLineCount: snapshot.totalLines,
    importedMessages: state.importedMessages + importedThisRun,
    lastSyncedAt: Date.now(),
  };
  await writeState(nextState);

  const result: ReplycaSocialSyncResult = {
    replycaRoot: snapshot.replycaRoot,
    sharedChatPath: snapshot.sharedChatPath,
    statePath: resolveStatePath(),
    sharedChatExists: snapshot.sharedChatExists,
    totalLines: snapshot.totalLines,
    importedLineCount: nextState.importedLineCount,
    pendingLines: 0,
    importedMessages: nextState.importedMessages,
    lastSyncedAt: nextState.lastSyncedAt,
    synced: importedThisRun > 0,
    importedThisRun,
  };
  lastSyncResult = result;
  lastSyncAt = Date.now();
  return result;
}

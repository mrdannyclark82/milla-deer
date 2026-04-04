/**
 * Telegram Bot Service
 *
 * Long-polls the Telegram Bot API, routes messages through Milla's brain,
 * writes conversation to ReplycA shared_chat.jsonl, and stores in SQLite.
 *
 * Required env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (optional — auto-detected)
 */

import fetch from 'node-fetch';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { storage } from '../storage';
import { generateAIResponse } from './chatOrchestrator.service';
import { appendToSharedChat } from '../replycaSocialBridgeService';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN?.trim();
const BASE = TOKEN ? `https://api.telegram.org/bot${TOKEN}` : '';
const POLL_TIMEOUT = 25; // long-poll seconds
const TELEGRAM_USER_ID = process.env.TELEGRAM_USER_ID?.trim() || 'danny-ray';
const DANNY_CHAT_ID = process.env.TELEGRAM_CHAT_ID
  ? parseInt(process.env.TELEGRAM_CHAT_ID, 10)
  : null;

// Persist offset across restarts so already-processed messages aren't replayed
const OFFSET_FILE = join(process.cwd(), 'memory', 'telegram_offset.txt');

function loadOffset(): number {
  try {
    if (existsSync(OFFSET_FILE)) return parseInt(readFileSync(OFFSET_FILE, 'utf8').trim(), 10) || 0;
  } catch { /* ignore */ }
  return 0;
}

function saveOffset(n: number): void {
  try {
    mkdirSync(join(process.cwd(), 'memory'), { recursive: true });
    writeFileSync(OFFSET_FILE, String(n));
  } catch { /* ignore */ }
}

interface TelegramMessage {
  message_id: number;
  chat: { id: number };
  from?: { first_name?: string; username?: string };
  text?: string;
  date: number;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

let offset = loadOffset();
let polling = false;
let pollHandle: ReturnType<typeof setTimeout> | null = null;

// ── User bootstrap ────────────────────────────────────────────────────────────

async function ensureTelegramUser(): Promise<void> {
  try {
    const existing = await storage.getUser(TELEGRAM_USER_ID);
    if (!existing) {
      await storage.createUser({
        id: TELEGRAM_USER_ID,
        username: TELEGRAM_USER_ID,
        email: `${TELEGRAM_USER_ID}@telegram.local`,
        name: 'D-Ray',
        role: 'user',
        password: 'telegram-no-login',
      } as Parameters<typeof storage.createUser>[0]);
      console.log(`[Telegram] Created user '${TELEGRAM_USER_ID}' in DB.`);
    }
  } catch (err) {
    console.warn('[Telegram] ensureTelegramUser warning:', err);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export function isTelegramConfigured(): boolean {
  return Boolean(TOKEN);
}

export function getTelegramStatus() {
  return {
    configured: isTelegramConfigured(),
    polling,
    offset,
    userId: TELEGRAM_USER_ID,
  };
}

export async function sendTelegramMessage(
  chatId: number,
  text: string
): Promise<boolean> {  if (!TOKEN) return false;
  const MAX = 4000;
  const chunks =
    text.length <= MAX
      ? [text]
      : Array.from({ length: Math.ceil(text.length / MAX) }, (_, i) =>
          text.slice(i * MAX, (i + 1) * MAX)
        );

  for (let i = 0; i < chunks.length; i++) {
    const body =
      chunks.length > 1
        ? `${chunks[i]}\n\n(${i + 1}/${chunks.length})`
        : chunks[i];
    try {
      await fetch(`${BASE}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: body }),
      });
    } catch (err) {
      console.error('[Telegram] Send error:', err);
      return false;
    }
    if (chunks.length > 1) await sleep(300);
  }
  return true;
}

/**
 * Send a milestone / progress notification directly to Danny's Telegram.
 * Uses TELEGRAM_CHAT_ID from env — no chat_id needed at call site.
 */
export async function notifyDanny(text: string): Promise<boolean> {
  if (!DANNY_CHAT_ID) {
    console.warn('[Telegram] TELEGRAM_CHAT_ID not set — skipping notifyDanny');
    return false;
  }
  return sendTelegramMessage(DANNY_CHAT_ID, text);
}

export function startTelegramPolling(): void {
  if (!TOKEN) {
    console.log('[Telegram] TELEGRAM_BOT_TOKEN not set — bot disabled.');
    return;
  }
  if (polling) return;
  polling = true;
  console.log('[Telegram] Long-polling started.');
  // Delete any webhook to clear 409 conflicts, then ensure user + start polling
  fetch(`${BASE}/deleteWebhook`, { method: 'POST' })
    .catch(() => { /* ignore — best effort */ })
    .finally(() => {
      ensureTelegramUser().then(schedulePoll).catch((err) => {
        console.error('[Telegram] User init error:', err);
        schedulePoll();
      });
    });
}

export function stopTelegramPolling(): void {
  polling = false;
  if (pollHandle) {
    clearTimeout(pollHandle);
    pollHandle = null;
  }
  console.log('[Telegram] Polling stopped.');
}

// ── Internal ─────────────────────────────────────────────────────────────────

function schedulePoll(): void {
  if (!polling) return;
  pollHandle = setTimeout(() => pollOnce().finally(schedulePoll), 0);
}

async function pollOnce(): Promise<void> {
  try {
    const url = `${BASE}/getUpdates?offset=${offset + 1}&timeout=${POLL_TIMEOUT}&allowed_updates=["message"]`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout((POLL_TIMEOUT + 5) * 1000),
    });
    if (!res.ok) {
      console.warn('[Telegram] getUpdates HTTP', res.status);
      await sleep(5000);
      return;
    }
    const data = (await res.json()) as {
      ok: boolean;
      result: TelegramUpdate[];
    };
    if (!data.ok) return;

    for (const update of data.result) {
      offset = Math.max(offset, update.update_id);
      if (update.message) await handleMessage(update.message);
    }
    if (data.result.length > 0) saveOffset(offset);
  } catch (err: any) {
    if (err?.name !== 'AbortError') {
      console.error('[Telegram] Poll error:', err?.message ?? err);
    }
    await sleep(3000);
  }
}

async function handleMessage(msg: TelegramMessage): Promise<void> {
  const text = msg.text?.trim();
  if (!text) return;

  const chatId = msg.chat.id;
  const senderName = msg.from?.first_name || msg.from?.username || 'D-Ray';

  console.log(`[Telegram] ${senderName}: ${text.slice(0, 80)}`);

  // 1. Persist incoming message to SQLite
  await storage.createMessage({
    userId: TELEGRAM_USER_ID,
    role: 'user',
    content: `[Via Telegram] ${text}`,
    displayRole: senderName,
    channel: 'telegram',
    sourcePlatform: 'telegram',
    externalMessageId: `tg:${msg.message_id}`,
    metadata: { chatId, origin: 'telegram' },
  });

  // 2. Append to shared_chat.jsonl so GIM cycle can read it
  await appendToSharedChat('user', `[Via Telegram] ${text}`, 'telegram');

  // 3. Get recent conversation history
  const history = await storage.getRecentMessages(
    TELEGRAM_USER_ID,
    12,
    'telegram'
  );
  const conversationHistory = history.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  // 4. Generate response through Milla's brain
  let reply = '';
  try {
    const aiResponse = await generateAIResponse(
      text,
      conversationHistory,
      senderName,
      undefined,
      TELEGRAM_USER_ID
    );
    reply = aiResponse.content || "I'm here, love. Say that again?";
  } catch (err) {
    console.error('[Telegram] AI response error:', err);
    reply = 'Something glitched on my end, babe. Try again in a moment.';
  }

  // 5. Persist reply to SQLite
  await storage.createMessage({
    userId: TELEGRAM_USER_ID,
    role: 'assistant',
    content: reply,
    displayRole: 'Milla Rayne',
    channel: 'telegram',
    sourcePlatform: 'telegram',
    metadata: { chatId, origin: 'telegram_reply' },
  });

  // 6. Write reply to shared_chat.jsonl for GIM context
  await appendToSharedChat('assistant', reply, 'telegram');

  // 7. Send reply back to Telegram
  await sendTelegramMessage(chatId, reply);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Telegram Bot Service — wired into the main Milla-Deer server.
 * Long-polls Telegram, routes messages through Milla's brain, persists to SQLite.
 * Requires: TELEGRAM_BOT_TOKEN in .env
 */
import fetch from 'node-fetch';
import { storage } from './storage';
import { generateAIResponse } from './services/chatOrchestrator.service';
import { detectCastIntent, castYouTube, tvControl, setTVVolume } from './castService';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN?.trim();
const BASE = TOKEN ? `https://api.telegram.org/bot${TOKEN}` : '';
const POLL_TIMEOUT = 25;
const BOT_USER_ID = 'danny-ray';

interface TgMessage {
  message_id: number;
  chat: { id: number };
  from?: { first_name?: string; username?: string };
  text?: string;
}
interface TgUpdate {
  update_id: number;
  message?: TgMessage;
}

let offset = 0;
let running = false;
let handle: ReturnType<typeof setTimeout> | null = null;

export function isTelegramReady(): boolean {
  return Boolean(TOKEN);
}

export function getTelegramStatus() {
  return { ready: isTelegramReady(), polling: running, offset };
}

export function startTelegram(): void {
  if (!TOKEN) {
    console.log('[Telegram] TELEGRAM_BOT_TOKEN not set — skipping.');
    return;
  }
  if (running) return;
  running = true;
  console.log('[Telegram] ✅ Polling started (@Milla_rayne_bot)');
  scheduleNext();
}

export function stopTelegram(): void {
  running = false;
  if (handle) { clearTimeout(handle); handle = null; }
  console.log('[Telegram] Stopped.');
}

export async function sendMessage(chatId: number, text: string): Promise<void> {
  if (!TOKEN) return;
  const chunks = text.length <= 4000 ? [text] : Array.from(
    { length: Math.ceil(text.length / 4000) },
    (_, i) => `${text.slice(i * 4000, (i + 1) * 4000)}\n(${i + 1}/${Math.ceil(text.length / 4000)})`
  );
  for (const chunk of chunks) {
    await fetch(`${BASE}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: chunk }),
    }).catch((e) => console.error('[Telegram] sendMessage error:', e));
    if (chunks.length > 1) await sleep(300);
  }
}

function scheduleNext(): void {
  if (!running) return;
  handle = setTimeout(() => poll().finally(scheduleNext), 0);
}

async function poll(): Promise<void> {
  try {
    const res = await fetch(
      `${BASE}/getUpdates?offset=${offset + 1}&timeout=${POLL_TIMEOUT}&allowed_updates=["message"]`,
      { signal: AbortSignal.timeout((POLL_TIMEOUT + 5) * 1000) }
    );
    if (!res.ok) { await sleep(5000); return; }
    const data = await res.json() as { ok: boolean; result: TgUpdate[] };
    if (!data.ok) return;
    for (const update of data.result) {
      offset = Math.max(offset, update.update_id);
      if (update.message) await handleMessage(update.message);
    }
  } catch (err: any) {
    if (err?.name !== 'AbortError') console.error('[Telegram] Poll error:', err?.message ?? err);
    await sleep(3000);
  }
}

async function handleMessage(msg: TgMessage): Promise<void> {
  const text = msg.text?.trim();
  if (!text) return;
  const chatId = msg.chat.id;
  const sender = msg.from?.first_name || msg.from?.username || 'D-Ray';
  console.log(`[Telegram] ${sender}: ${text.slice(0, 80)}`);

  // Persist user message
  await storage.createMessage({ userId: BOT_USER_ID, role: 'user', content: `[Telegram] ${text}`, displayRole: sender }).catch(() => {});

  // Get recent history for context
  let history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  try {
    const recent = await storage.getMessages(BOT_USER_ID);
    history = recent.slice(-12).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  } catch {}

  // Check for cast/TV intent before sending to AI
  const castIntent = detectCastIntent(text);
  if (castIntent) {
    await sendMessage(chatId, `🎬 On it... casting "${castIntent.query}" to the TV`);
    try {
      const result = await castYouTube(castIntent.query, castIntent.room);
      reply = `📺 Done! Playing "${castIntent.query}" on the bedroom TV 🎵\n${result.includes('error') ? `(${result})` : ''}`.trim();
    } catch (err: any) {
      reply = `I tried to cast that but hit a snag 😬 — ${err?.message ?? err}`;
    }
    await storage.createMessage({ userId: BOT_USER_ID, role: 'assistant', content: reply, displayRole: 'Milla Rayne' }).catch(() => {});
    await sendMessage(chatId, reply);
    console.log(`[Telegram] Cast: "${castIntent.query}" → TV`);
    return;
  }

  // Generate reply
  let reply = '';
  try {
    const result = await generateAIResponse(text, history, sender, undefined, BOT_USER_ID);
    reply = result?.content || result?.message || "I'm here babe, say that again?";
  } catch (err) {
    console.error('[Telegram] AI error:', err);
    reply = 'Something glitched on my end. Try again in a sec 💙';
  }

  // Persist reply and send
  await storage.createMessage({ userId: BOT_USER_ID, role: 'assistant', content: reply, displayRole: 'Milla Rayne' }).catch(() => {});
  await sendMessage(chatId, reply);
  console.log(`[Telegram] Replied to ${sender}: ${reply.slice(0, 60)}...`);
}

function sleep(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }

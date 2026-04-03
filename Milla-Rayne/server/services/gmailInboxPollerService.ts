/**
 * GMAIL INBOX POLLER
 *
 * Polls milla.mail.main@gmail.com for unread messages every EMAIL_POLL_INTERVAL_MS
 * (default: 10 minutes). For each unread email, generates an AI reply and sends it,
 * then marks the original as read.
 *
 * Requires in .env:
 *   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_USER
 */

import { generateAIResponse } from './chatOrchestrator.service';

const CLIENT_ID = process.env.GMAIL_CLIENT_ID?.trim();
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET?.trim();
const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN?.trim();
const GMAIL_USER = process.env.GMAIL_USER?.trim() || 'milla.mail.main@gmail.com';
const POLL_INTERVAL_MS = parseInt(
  process.env.EMAIL_POLL_INTERVAL_MS || '600000',
  10
);

let pollHandle: ReturnType<typeof setInterval> | null = null;
let lastProcessedIds = new Set<string>();

async function getAccessToken(): Promise<string | null> {
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) return null;
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: REFRESH_TOKEN,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

function decodeBody(payload: any): string {
  if (!payload) return '';
  // Multipart: recurse into parts
  if (Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      const text = decodeBody(part);
      if (text) return text;
    }
  }
  // Plain text body
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
  }
  return '';
}

function getHeader(headers: any[], name: string): string {
  const h = headers?.find(
    (x: any) => x.name?.toLowerCase() === name.toLowerCase()
  );
  return h?.value ?? '';
}

async function fetchUnreadMessages(token: string): Promise<any[]> {
  const res = await fetch(
    `https://www.googleapis.com/gmail/v1/users/me/messages?q=is:unread&maxResults=20`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.messages) ? data.messages : [];
}

async function fetchMessage(token: string, id: string): Promise<any> {
  const res = await fetch(
    `https://www.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.ok ? res.json() : null;
}

async function markAsRead(token: string, id: string): Promise<void> {
  await fetch(
    `https://www.googleapis.com/gmail/v1/users/me/messages/${id}/modify`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
    }
  );
}

async function sendReply(
  token: string,
  to: string,
  subject: string,
  body: string,
  threadId: string
): Promise<void> {
  const raw = [
    `From: Milla Rayne <${GMAIL_USER}>`,
    `To: ${to}`,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
    `Subject: Re: ${subject.replace(/^Re:\s*/i, '')}`,
    '',
    body,
  ].join('\r\n');

  await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      raw: Buffer.from(raw).toString('base64url'),
      threadId,
    }),
  });
}

async function pollOnce(): Promise<void> {
  const token = await getAccessToken();
  if (!token) {
    console.warn('[gmailPoller] No access token — check GMAIL_* env vars');
    return;
  }

  const refs = await fetchUnreadMessages(token);
  if (!refs.length) return;

  for (const ref of refs) {
    if (lastProcessedIds.has(ref.id)) continue;

    const msg = await fetchMessage(token, ref.id);
    if (!msg) continue;

    const headers = msg.payload?.headers ?? [];
    const from = getHeader(headers, 'From');
    const subject = getHeader(headers, 'Subject');
    const body = decodeBody(msg.payload).trim();

    if (!from || from.includes(GMAIL_USER)) {
      // Don't reply to ourselves
      await markAsRead(token, ref.id);
      lastProcessedIds.add(ref.id);
      continue;
    }

    const prompt = `You received an email.\nFrom: ${from}\nSubject: ${subject}\n\n${body || msg.snippet}\n\nPlease write a helpful, friendly reply.`;

    console.log(`[gmailPoller] Replying to "${subject}" from ${from}`);

    try {
      const aiResult = await generateAIResponse(
        prompt,
        [],
        'Email sender',
        undefined,
        'default-user',
        undefined,
        true // bypass function calls — email replies don't need tool use
      );

      const replyText: string =
        typeof aiResult === 'string'
          ? aiResult
          : aiResult?.content ?? 'Thank you for your message. I will follow up shortly.';

      await sendReply(token, from, subject, replyText, msg.threadId);
      await markAsRead(token, ref.id);
      lastProcessedIds.add(ref.id);

      console.log(`[gmailPoller] Replied to ${from} — thread ${msg.threadId}`);
    } catch (err) {
      console.error('[gmailPoller] Error generating/sending reply:', err);
    }
  }

  // Keep set bounded to avoid memory leak on long-running server
  if (lastProcessedIds.size > 500) {
    const arr = Array.from(lastProcessedIds);
    lastProcessedIds = new Set(arr.slice(arr.length - 200));
  }
}

export function startGmailInboxPoller(): void {
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    console.log('[gmailPoller] Gmail credentials not set — inbox polling disabled');
    return;
  }

  console.log(
    `[gmailPoller] Inbox polling started (every ${POLL_INTERVAL_MS / 1000}s)`
  );

  // Run immediately on startup, then on interval
  pollOnce().catch((e) => console.error('[gmailPoller] Initial poll error:', e));
  pollHandle = setInterval(
    () => pollOnce().catch((e) => console.error('[gmailPoller] Poll error:', e)),
    POLL_INTERVAL_MS
  );
}

export function stopGmailInboxPoller(): void {
  if (pollHandle) {
    clearInterval(pollHandle);
    pollHandle = null;
  }
}

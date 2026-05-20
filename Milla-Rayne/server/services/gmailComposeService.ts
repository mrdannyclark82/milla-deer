/**
 * Gmail Compose Service
 *
 * Sends emails from milla.mail.main@gmail.com via nodemailer + Gmail OAuth2.
 * Drains memory/email_outbox.json periodically.
 *
 * Required env:
 *   GMAIL_USER          = milla.mail.main@gmail.com
 *   GMAIL_CLIENT_ID     = (Google OAuth2 client ID)
 *   GMAIL_CLIENT_SECRET = (Google OAuth2 client secret)
 *   GMAIL_REFRESH_TOKEN = (run scripts/gmail_auth.py once to obtain)
 *
 * Falls back to subprocess call to ReplycA's gmail_helper.py if OAuth not set.
 */

import nodemailer from 'nodemailer';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import {
  getEmailOutbox as readEmailOutbox,
  writeEmailOutbox,
} from '../agents/emailDeliveryWorker';

const execFileAsync = promisify(execFile);
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

const GMAIL_USER =
  process.env.GMAIL_USER?.trim() || 'milla.mail.main@gmail.com';
const CLIENT_ID = process.env.GMAIL_CLIENT_ID?.trim();
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET?.trim();
const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN?.trim();

export interface EmailPayload {
  to: string | string[];
  subject: string;
  body: string;
  html?: string;
  from?: string;
}

export interface EmailResult {
  ok: boolean;
  messageId?: string;
  error?: string;
  method: 'oauth2' | 'python' | 'queued';
}

// ── Transport ────────────────────────────────────────────────────────────────

function createOAuth2Transport(): nodemailer.Transporter | null {
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) return null;

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: GMAIL_USER,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      refreshToken: REFRESH_TOKEN,
    },
  });
}

// ── Python fallback (uses ReplycA token.pickle) ───────────────────────────────

async function sendViaPython(payload: EmailPayload): Promise<EmailResult> {
  const candidates = [
    path.resolve(MODULE_DIR, '../../../ReplycA'),
    path.resolve(MODULE_DIR, '../../ReplycA'),
    path.resolve(process.cwd(), '../ReplycA'),
    path.resolve(process.cwd(), 'ReplycA'),
  ];

  const replycaRoot = candidates.find((c) =>
    existsSync(path.join(c, 'core_os/gmail_helper.py'))
  );
  if (!replycaRoot) {
    return {
      ok: false,
      error: 'ReplycA gmail_helper.py not found',
      method: 'python',
    };
  }

  const to = Array.isArray(payload.to) ? payload.to.join(',') : payload.to;
  const script = `
import sys
sys.path.insert(0, '${replycaRoot}')
from core_os.gmail_helper import authenticate_gmail
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import base64, json

service = authenticate_gmail()
msg = MIMEMultipart('alternative')
msg['to'] = '${to}'
msg['from'] = '${GMAIL_USER}'
msg['subject'] = ${JSON.stringify(payload.subject)}
msg.attach(MIMEText(${JSON.stringify(payload.body)}, 'plain'))
${payload.html ? `msg.attach(MIMEText(${JSON.stringify(payload.html)}, 'html'))` : ''}
raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
result = service.users().messages().send(userId='me', body={'raw': raw}).execute()
print(json.dumps({'ok': True, 'id': result.get('id','')}))
  `;

  try {
    const { stdout } = await execFileAsync('python3', ['-c', script], {
      cwd: replycaRoot,
      timeout: 30_000,
    });
    const parsed = JSON.parse(stdout.trim().split('\n').pop() || '{}');
    return { ok: Boolean(parsed.ok), messageId: parsed.id, method: 'python' };
  } catch (err: any) {
    return { ok: false, error: err.message, method: 'python' };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function isGmailConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN);
}

export async function composeEmail(
  payload: EmailPayload
): Promise<EmailResult> {
  const transport = createOAuth2Transport();

  if (transport) {
    try {
      const info = await transport.sendMail({
        from: `"Milla Rayne" <${payload.from || GMAIL_USER}>`,
        to: Array.isArray(payload.to) ? payload.to.join(', ') : payload.to,
        subject: payload.subject,
        text: payload.body,
        html: payload.html,
      });
      console.log(`[Gmail] Sent via OAuth2: ${info.messageId}`);
      return { ok: true, messageId: info.messageId, method: 'oauth2' };
    } catch (err: any) {
      console.error('[Gmail] OAuth2 send failed:', err.message);
    }
  }

  // Fallback: use Python gmail_helper with token.pickle
  const pythonResult = await sendViaPython(payload);
  if (pythonResult.ok) {
    console.log('[Gmail] Sent via Python helper:', pythonResult.messageId);
    return pythonResult;
  }

  // Last resort: queue to outbox for later delivery
  console.warn('[Gmail] All send methods failed — queuing to outbox');
  const outbox = await readEmailOutbox();
  outbox.push({
    id: `email_${Date.now()}`,
    to: payload.to,
    subject: payload.subject,
    body: payload.body,
    html: payload.html,
    from: payload.from || GMAIL_USER,
    status: 'pending',
    createdAt: new Date().toISOString(),
    attempts: 0,
  });
  await writeEmailOutbox(outbox);
  return { ok: false, error: 'Queued for later delivery', method: 'queued' };
}

/** Drain queued outbox emails (called on startup and after GIM cycle) */
export async function drainEmailOutbox(): Promise<{
  sent: number;
  failed: number;
}> {
  const outbox = await readEmailOutbox();
  const pending = outbox.filter(
    (e: any) => e.status === 'pending' && (e.attempts || 0) < 3
  );
  let sent = 0;
  let failed = 0;

  for (const item of pending) {
    item.attempts = (item.attempts || 0) + 1;
    const result = await composeEmail({
      to: item.to,
      subject: item.subject,
      body: item.body,
      html: item.html,
      from: item.from,
    });
    if (result.ok && result.method !== 'queued') {
      item.status = 'sent';
      item.sentAt = new Date().toISOString();
      sent++;
    } else {
      item.status = item.attempts >= 3 ? 'failed' : 'pending';
      failed++;
    }
  }

  await writeEmailOutbox(outbox);
  return { sent, failed };
}

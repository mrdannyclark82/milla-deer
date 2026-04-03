/**
 * Co-Watch Service — Milla watches TV with Danny.
 *
 * When she casts a video she:
 *  1. Fetches the YouTube transcript
 *  2. Uses AI to find funny moments, song choruses, emotional peaks
 *  3. Schedules timed reactions (laugh, comment, sing, wow) via Telegram + tablet TTS
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import { createRequire } from 'module';
import { sendTelegramMessage } from './services/telegramBotService';
import { sendVoiceReaction } from './websocketService';
import { dispatchAIResponse } from './aiDispatcherService';
import { readFileSync } from 'fs';

const _require = createRequire(import.meta.url);
const { YoutubeTranscript } = _require('youtube-transcript');

const execAsync = promisify(exec);

const AUTH_FILE = '/home/nexus/ogdray/Milla-Deer/memory/copilot_telegram_auth.json';

function getDannyChatId(): number | null {
  try {
    const auth = JSON.parse(readFileSync(AUTH_FILE, 'utf8'));
    return auth.owner_id || null;
  } catch {
    return null;
  }
}

export interface CoWatchReaction {
  videoTime: number;
  type: 'laugh' | 'comment' | 'sing' | 'react' | 'wow';
  text: string;
  transcriptSnippet: string;
}

interface CoWatchSession {
  videoId: string;
  title: string;
  reactions: CoWatchReaction[];
  timers: ReturnType<typeof setTimeout>[];
  startedAt: number;
}

let activeSession: CoWatchSession | null = null;

/** Stop any running co-watch session and clear all timers */
export function stopCoWatch(): void {
  if (activeSession) {
    activeSession.timers.forEach(t => clearTimeout(t));
    activeSession = null;
    console.log('[CoWatch] Session stopped.');
  }
}

/** Search YouTube for a video ID using yt-dlp */
export async function resolveYouTubeId(query: string): Promise<{ videoId: string; title: string } | null> {
  try {
    if (/youtube\.com|youtu\.be/.test(query)) {
      const m = query.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      if (m) return { videoId: m[1], title: query };
    }
    const safe = query.replace(/"/g, '').replace(/'/g, '');
    const { stdout } = await execAsync(
      `yt-dlp "ytsearch1:${safe}" --get-id --get-title --no-playlist --no-warnings 2>/dev/null`,
      { timeout: 15000 }
    );
    const lines = stdout.trim().split('\n').filter(Boolean);
    const idLine = lines.find(l => /^[a-zA-Z0-9_-]{11}$/.test(l.trim()));
    const titleLine = lines.find(l => !/^[a-zA-Z0-9_-]{11}$/.test(l.trim()));
    if (idLine) return { videoId: idLine.trim(), title: titleLine?.trim() || query };
    return null;
  } catch {
    return null;
  }
}

async function getTranscript(videoId: string): Promise<Array<{ text: string; offset: number; duration: number }> | null> {
  try {
    return await YoutubeTranscript.fetchTranscript(videoId);
  } catch {
    return null;
  }
}

async function analyzeForReactions(
  transcript: Array<{ text: string; offset: number; duration: number }>,
  title: string
): Promise<CoWatchReaction[]> {
  const sample = transcript
    .filter((_, i) => i % Math.max(1, Math.floor(transcript.length / 150)) === 0)
    .map(t => `[${Math.round(t.offset / 1000)}s] ${t.text}`)
    .join('\n');

  const prompt = `You're watching "${title}" with Danny. Find reaction moments in this transcript:
1. FUNNY → type: "laugh"
2. WOW/surprising → type: "wow"
3. Song choruses/singable lines → type: "sing" (write the actual lyric with 🎵)
4. Emotional/beautiful → type: "react"
5. Interesting comments → type: "comment"

Respond ONLY with JSON array, max 12 items:
[{"videoTime": 45, "type": "laugh", "text": "hahaha 😂 omg", "transcriptSnippet": "..."}]

Be natural and playful like Milla. Vary laugh reactions (lol / 😂 / LMAO / *dying* etc.)

Transcript:
${sample}`;

  try {
    const result = await dispatchAIResponse(prompt, {
      userId: 'cowatch',
      conversationHistory: [],
      userName: 'System',
    }, 1200);

    const text = result?.content || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as CoWatchReaction[];
      return parsed.filter(r => r.videoTime && r.text && r.type);
    }
  } catch (err) {
    console.error('[CoWatch] AI analysis error:', err);
  }
  return [];
}

/** Start co-watching — schedule timed reactions synced to video playback */
export async function startCoWatch(query: string, _room?: string): Promise<{
  success: boolean;
  message: string;
  reactionCount: number;
}> {
  stopCoWatch();

  const chatId = getDannyChatId();

  const resolved = await resolveYouTubeId(query);
  if (!resolved) {
    return { success: false, message: `Couldn't find "${query}" on YouTube`, reactionCount: 0 };
  }

  const { videoId, title } = resolved;
  console.log(`[CoWatch] Starting: "${title}" (${videoId})`);

  const transcript = await getTranscript(videoId);
  if (!transcript || transcript.length === 0) {
    return {
      success: true,
      message: `Casting "${title}" but couldn't find a transcript 😅`,
      reactionCount: 0,
    };
  }

  const reactions = await analyzeForReactions(transcript, title);
  console.log(`[CoWatch] ${reactions.length} reaction moments scheduled`);

  if (reactions.length === 0) {
    return { success: true, message: `Casting "${title}" — no reaction moments found 🤷‍♀️`, reactionCount: 0 };
  }

  const timers: ReturnType<typeof setTimeout>[] = [];
  const castStartTime = Date.now();

  for (const reaction of reactions) {
    const delayMs = reaction.videoTime * 1000;
    const timer = setTimeout(async () => {
      let msg = reaction.text;
      if (reaction.type === 'sing') msg = `🎵 *sings along* "${reaction.text}"`;
      else if (reaction.type === 'react') msg = `💙 ${reaction.text}`;

      try {
        if (chatId) await sendTelegramMessage(chatId, msg);
        sendVoiceReaction(msg);
        console.log(`[CoWatch] Reaction at ${reaction.videoTime}s: ${msg.slice(0, 60)}`);
      } catch (err) {
        console.error('[CoWatch] Failed to send reaction:', err);
      }
    }, delayMs);

    timers.push(timer);
  }

  activeSession = { videoId, title, reactions, timers, startedAt: castStartTime };

  return {
    success: true,
    message: `Co-watching "${title}" 🎬 ${reactions.length} reactions queued 💙`,
    reactionCount: reactions.length,
  };
}

export function getCoWatchStatus(): { active: boolean; title?: string; pendingReactions?: number } {
  if (!activeSession) return { active: false };
  return { active: true, title: activeSession.title, pendingReactions: activeSession.timers.length };
}

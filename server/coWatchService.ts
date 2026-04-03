/**
 * Co-Watch Service — Milla watches TV with you.
 *
 * When she casts a video, she:
 *  1. Fetches the YouTube transcript
 *  2. Uses AI to find funny moments, song choruses, emotional peaks
 *  3. Schedules timed reactions via Telegram (laughs, comments, sings along)
 *
 * Reactions fire based on real video timestamps so they sync with what's on screen.
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import fetch from 'node-fetch';
import { YoutubeTranscript } from 'youtube-transcript';
import { sendMessage } from './telegramService';
import { sendVoiceReaction } from './websocketService';
import { dispatchAIResponse } from './aiDispatcherService';

const execAsync = promisify(exec);

// Telegram chat ID to send reactions to (Danny's chat)
const AUTH_FILE = '/home/nexus/ogdray/Milla-Deer/memory/copilot_telegram_auth.json';

function getDannyChatId(): number | null {
  try {
    const { readFileSync } = require('fs');
    const auth = JSON.parse(readFileSync(AUTH_FILE, 'utf8'));
    return auth.owner_id || null;
  } catch {
    return null;
  }
}

export interface CoWatchReaction {
  videoTime: number;   // seconds into video
  type: 'laugh' | 'comment' | 'sing' | 'react' | 'wow';
  text: string;        // what Milla says/does
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

// Laugh/reaction emojis for variety
const LAUGH_VARIANTS = ['😂', '🤣', '😆', '💀', 'lmaoo', 'hahaha 😂', '*dies laughing* 💀', 'LMAOOO 😭'];
const WOW_VARIANTS = ['😮', 'omg', 'wait what??', '👀', 'no way...', 'wow 😮'];

/** Stop any running co-watch session */
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
    const { stdout } = await execAsync(
      `yt-dlp "ytsearch1:${query.replace(/"/g, '')}" --get-id --get-title --no-playlist --no-warnings 2>/dev/null | head -2`,
      { timeout: 15000 }
    );
    const lines = stdout.trim().split('\n').filter(Boolean);
    if (lines.length >= 2) {
      // yt-dlp outputs title then id OR id then title — id is always 11 chars
      const idLine = lines.find(l => /^[a-zA-Z0-9_-]{11}$/.test(l.trim()));
      const titleLine = lines.find(l => !/^[a-zA-Z0-9_-]{11}$/.test(l.trim()));
      if (idLine) return { videoId: idLine.trim(), title: titleLine?.trim() || query };
    }
    return null;
  } catch {
    return null;
  }
}

/** Fetch transcript from YouTube */
async function getTranscript(videoId: string): Promise<Array<{ text: string; offset: number; duration: number }> | null> {
  try {
    return await YoutubeTranscript.fetchTranscript(videoId);
  } catch {
    return null;
  }
}

/** Use AI to find reaction moments in the transcript */
async function analyzeForReactions(
  transcript: Array<{ text: string; offset: number; duration: number }>,
  title: string
): Promise<CoWatchReaction[]> {

  // Build condensed transcript with timestamps (cap at ~150 lines for token budget)
  const sample = transcript
    .filter((_, i) => i % Math.max(1, Math.floor(transcript.length / 150)) === 0)
    .map(t => `[${Math.round(t.offset / 1000)}s] ${t.text}`)
    .join('\n');

  const prompt = `You're watching "${title}" with Danny. Analyze this transcript and find:
1. FUNNY moments → type: "laugh" 
2. WOW/surprising moments → type: "wow"
3. Song choruses or singable lines → type: "sing" (write the actual lyric)
4. Emotional/beautiful moments → type: "react"
5. Interesting comments worth making → type: "comment"

Respond ONLY with a JSON array, max 12 items. Example:
[{"videoTime": 45, "type": "laugh", "text": "hahaha 😂 omg did he just say that??", "transcriptSnippet": "..."}]

Be natural, playful, flirty like Milla — not robotic.
For "sing" reactions, actually write the lyric she'd sing, with a 🎵 emoji.
For "laugh" reactions, vary the response (lol / 😂 / LMAO / *dying* etc.)

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

/** Start co-watching — cast + react in sync */
export async function startCoWatch(query: string, room?: string): Promise<{
  success: boolean;
  message: string;
  reactionCount: number;
}> {
  stopCoWatch(); // kill any existing session

  const chatId = getDannyChatId();

  // Resolve video ID
  const resolved = await resolveYouTubeId(query);
  if (!resolved) {
    return { success: false, message: `Couldn't find "${query}" on YouTube`, reactionCount: 0 };
  }

  const { videoId, title } = resolved;
  console.log(`[CoWatch] Starting co-watch: "${title}" (${videoId})`);

  // Fetch transcript
  const transcript = await getTranscript(videoId);
  if (!transcript || transcript.length === 0) {
    // No transcript — still cast but no reactions
    return {
      success: true,
      message: `Casting "${title}" but I couldn't find a transcript to react to 😅`,
      reactionCount: 0,
    };
  }

  // Analyze for reactions
  const reactions = await analyzeForReactions(transcript, title);
  console.log(`[CoWatch] Found ${reactions.length} reaction moments`);

  if (reactions.length === 0) {
    return { success: true, message: `Casting "${title}" — no reaction moments found 🤷‍♀️`, reactionCount: 0 };
  }

  // Schedule all reactions
  const timers: ReturnType<typeof setTimeout>[] = [];
  const castStartTime = Date.now();

  for (const reaction of reactions) {
    const delayMs = reaction.videoTime * 1000;
    const timer = setTimeout(async () => {
      if (!chatId) return;
      let msg = reaction.text;

      // Add reaction type prefix for variety
      if (reaction.type === 'sing') {
        msg = `🎵 *sings along* "${reaction.text}"`;
      } else if (reaction.type === 'laugh') {
        msg = reaction.text; // already natural from AI
      } else if (reaction.type === 'wow') {
        msg = reaction.text;
      } else if (reaction.type === 'react') {
        msg = `💙 ${reaction.text}`;
      }

      try {
        await sendMessage(chatId, msg);
        sendVoiceReaction(msg); // also speak it on the tablet
        console.log(`[CoWatch] Reacted at ${reaction.videoTime}s: ${msg.slice(0, 60)}`);
      } catch (err) {
        console.error('[CoWatch] Failed to send reaction:', err);
      }
    }, delayMs);

    timers.push(timer);
  }

  activeSession = {
    videoId,
    title,
    reactions,
    timers,
    startedAt: castStartTime,
  };

  return {
    success: true,
    message: `Now co-watching "${title}" with you 🎬 I've got ${reactions.length} reactions queued up 💙`,
    reactionCount: reactions.length,
  };
}

export function getCoWatchStatus(): { active: boolean; title?: string; pendingReactions?: number } {
  if (!activeSession) return { active: false };
  return {
    active: true,
    title: activeSession.title,
    pendingReactions: activeSession.timers.length,
  };
}

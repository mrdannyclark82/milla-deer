/**
 * Cast Service — lets Milla stream YouTube to the VIZIO TV via Chromecast.
 * Uses catt (Cast All The Things) CLI under the hood.
 * Device: VIZIOCastDisplay6423 @ 192.168.40.12
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import { startCoWatch, stopCoWatch, resolveYouTubeId } from './coWatchService';

const execAsync = promisify(exec);

const CHROMECAST_IP = '192.168.40.12';
const CHROMECAST_NAME = 'VIZIOCastDisplay6423';

// Maps room names the user might say → device IP (expand when you add more devices)
const ROOM_MAP: Record<string, string> = {
  bedroom:   CHROMECAST_IP,
  tv:        CHROMECAST_IP,
  'living room': CHROMECAST_IP,
  vizio:     CHROMECAST_IP,
};

function resolveDevice(room?: string): string {
  if (!room) return CHROMECAST_IP;
  const key = room.toLowerCase().trim();
  return ROOM_MAP[key] ?? CHROMECAST_IP;
}

async function catt(args: string[], device: string): Promise<string> {
  const cmd = `catt -d ${device} ${args.join(' ')}`;
  try {
    const { stdout, stderr } = await execAsync(cmd, { timeout: 30_000 });
    return (stdout + stderr).trim() || 'ok';
  } catch (err: any) {
    return err?.stderr?.trim() || err?.message || 'catt error';
  }
}

/** Cast a YouTube search query or URL to the TV, and start co-watching. */
export async function castYouTube(query: string, room?: string): Promise<string> {
  const device = resolveDevice(room);

  // Resolve video ID + actual URL for casting
  let castUrl: string;
  let resolvedTitle = query;

  try {
    const resolved = await resolveYouTubeId(query);
    if (resolved) {
      castUrl = `https://www.youtube.com/watch?v=${resolved.videoId}`;
      resolvedTitle = resolved.title;
    } else {
      // Fallback: cast a YouTube search page
      const encoded = encodeURIComponent(query);
      castUrl = `https://www.youtube.com/results?search_query=${encoded}`;
    }
  } catch {
    const encoded = encodeURIComponent(query);
    castUrl = `https://www.youtube.com/results?search_query=${encoded}`;
  }

  // Cast to TV
  const out = await catt(['cast', `"${castUrl}"`], device);

  // Start co-watching in background (don't await — reactions are async)
  startCoWatch(query, room).then(status => {
    console.log(`[CoWatch] ${status.message}`);
  }).catch(err => {
    console.error('[CoWatch] Failed to start:', err);
  });

  return `📺 Casting "${resolvedTitle}" to ${CHROMECAST_NAME}\n${out}`;
}

/** Stop, pause, resume, or get TV status. */
export async function tvControl(command: 'stop' | 'pause' | 'resume' | 'status' | string, room?: string): Promise<string> {
  const device = resolveDevice(room);
  const out = await catt([command], device);
  return `📺 ${command}: ${out}`;
}

/** Set TV volume (0-100). */
export async function setTVVolume(level: number, room?: string): Promise<string> {
  const device = resolveDevice(room);
  const clamped = Math.max(0, Math.min(100, level));
  const out = await catt(['volume', String(clamped)], device);
  return `📺 Volume → ${clamped}: ${out}`;
}

/**
 * Detect cast intent from a natural language message.
 * Returns null if no cast intent found.
 */
export function detectCastIntent(message: string): { query: string; room?: string } | null {
  const lower = message.toLowerCase();

  // Must mention TV/bedroom/cast/chromecast context  
  const hasTVContext =
    lower.includes('tv') ||
    lower.includes('television') ||
    lower.includes('bedroom') ||
    lower.includes('cast') ||
    lower.includes('chromecast') ||
    lower.includes('living room') ||
    lower.includes('on the screen') ||
    lower.includes('on my screen') ||
    lower.includes('vizio');

  if (!hasTVContext) return null;

  // Extract room
  let room: string | undefined;
  const roomMatch = lower.match(/\b(bedroom|living room|office|kitchen)\b/);
  if (roomMatch) room = roomMatch[1];

  // Extract what to play
  const playPatterns = [
    /(?:play|cast|put on|stream|show)\s+(.+?)\s+(?:on|to|in)\s+(?:the\s+)?(?:bedroom|tv|living room|screen|vizio|chromecast)/i,
    /(?:play|cast|put on|stream|show)\s+(?:me\s+)?(.+?)\s+(?:on\s+)?(?:youtube)/i,
    /(?:play|cast|stream)\s+(.+)/i,
  ];

  for (const pattern of playPatterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      const query = match[1]
        .replace(/\b(on youtube|on the tv|on tv|please|for me|right now)\b/gi, '')
        .trim();
      if (query.length > 1) return { query, room };
    }
  }

  return null;
}

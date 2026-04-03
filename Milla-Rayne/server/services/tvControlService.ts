import { createRequire } from 'module';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
const _require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { Client } = _require('castv2-client') as any;

// YouTube Cast app ID (official Google receiver)
const YOUTUBE_CAST_APP_ID = '233637DE';

export type TvCommand =
  | 'power_on'
  | 'power_off'
  | 'volume_up'
  | 'volume_down'
  | 'volume_set'
  | 'mute'
  | 'unmute'
  | 'play'
  | 'pause'
  | 'youtube_search'
  | 'youtube_play';

export interface TvCommandResult {
  success: boolean;
  message: string;
  data?: unknown;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const VIZIO_TV_IP = process.env.VIZIO_TV_IP;
const VIZIO_AUTH_TOKEN = process.env.VIZIO_AUTH_TOKEN;
const YOUTUBE_LOUNGE_TOKEN = process.env.YOUTUBE_LOUNGE_TOKEN;
const YOUTUBE_SCREEN_ID = process.env.YOUTUBE_SCREEN_ID;

// ─── Vizio SmartCast local API (power / volume / mute) ───────────────────────

const VIZIO_KEY_MAP: Record<string, { CODESET: number; CODE: number }> = {
  power_on:    { CODESET: 11, CODE: 1 },
  power_off:   { CODESET: 11, CODE: 0 },
  volume_up:   { CODESET: 5,  CODE: 1 },
  volume_down: { CODESET: 5,  CODE: 0 },
  mute:        { CODESET: 5,  CODE: 4 },
  unmute:      { CODESET: 5,  CODE: 4 },
  play:        { CODESET: 2,  CODE: 3 },
  pause:       { CODESET: 2,  CODE: 2 },
};

async function vizioSendKey(command: string): Promise<TvCommandResult> {
  if (!VIZIO_TV_IP) {
    return { success: false, message: 'VIZIO_TV_IP not configured. Add it to your .env file.' };
  }
  if (!VIZIO_AUTH_TOKEN) {
    return { success: false, message: 'VIZIO_AUTH_TOKEN not configured. Run /api/tv/pair first.' };
  }

  const keyDef = VIZIO_KEY_MAP[command];
  if (!keyDef) return { success: false, message: `No Vizio key mapping for: ${command}` };

  try {
    // Vizio SmartCast HTTPS on port 7345 — self-signed cert, ignore TLS
    const { default: https } = await import('https');
    const body = JSON.stringify({
      KEYLIST: [{ CODESET: keyDef.CODESET, CODE: keyDef.CODE, ACTION: 'KEYPRESS' }],
    });

    return new Promise((resolve) => {
      const req = https.request(
        {
          hostname: VIZIO_TV_IP,
          port: 7345,
          path: '/key_command/',
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'AUTH': VIZIO_AUTH_TOKEN!,
            'Content-Length': Buffer.byteLength(body),
          },
          rejectUnauthorized: false,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () =>
            resolve({
              success: res.statusCode === 200,
              message: res.statusCode === 200 ? `TV: ${command}` : `Vizio error ${res.statusCode}: ${data}`,
            })
          );
        }
      );
      req.on('error', (err) => resolve({ success: false, message: `Vizio error: ${err.message}` }));
      req.setTimeout(4000, () => { req.destroy(); resolve({ success: false, message: 'Vizio TV timed out' }); });
      req.write(body);
      req.end();
    });
  } catch (err) {
    return { success: false, message: `Vizio request failed: ${String(err)}` };
  }
}

// ─── Vizio pairing flow ───────────────────────────────────────────────────────

export async function startVisioPairing(): Promise<{ success: boolean; message: string }> {
  if (!VIZIO_TV_IP) return { success: false, message: 'VIZIO_TV_IP not set in .env' };
  const { default: https } = await import('https');
  const body = JSON.stringify({ DEVICE_ID: 'milla-rayne', DEVICE_NAME: 'Milla' });

  return new Promise((resolve) => {
    const req = https.request(
      { hostname: VIZIO_TV_IP, port: 7345, path: '/pairing/start', method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        rejectUnauthorized: false },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ success: res.statusCode === 200,
          message: res.statusCode === 200 ? 'PIN prompt shown on TV. Call /api/tv/pair/complete with the PIN.' : data }));
      }
    );
    req.on('error', (e) => resolve({ success: false, message: e.message }));
    req.write(body);
    req.end();
  });
}

export async function completeVisioPairing(pin: string, pairingToken: string): Promise<{ success: boolean; authToken?: string; message: string }> {
  if (!VIZIO_TV_IP) return { success: false, message: 'VIZIO_TV_IP not set in .env' };
  const { default: https } = await import('https');
  const body = JSON.stringify({ DEVICE_ID: 'milla-rayne', CHALLENGE_TYPE: 1, PAIRING_REQ_TOKEN: Number(pairingToken), RESPONSE_VALUE: pin });

  return new Promise((resolve) => {
    const req = https.request(
      { hostname: VIZIO_TV_IP, port: 7345, path: '/pairing/pair', method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        rejectUnauthorized: false },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const json = JSON.parse(data) as { ITEM?: { AUTH_TOKEN?: string } };
            const authToken = json.ITEM?.AUTH_TOKEN;
            resolve(authToken
              ? { success: true, authToken, message: `Paired! Add VIZIO_AUTH_TOKEN=${authToken} to your .env` }
              : { success: false, message: data });
          } catch { resolve({ success: false, message: data }); }
        });
      }
    );
    req.on('error', (e) => resolve({ success: false, message: e.message }));
    req.write(body);
    req.end();
  });
}

// ─── Chromecast: cast YouTube video to Vizio built-in Cast ───────────────────

function castYoutubeVideo(videoId: string, deviceIp?: string): Promise<TvCommandResult> {
  const ip = deviceIp || BEDROOM_IP;
  return new Promise((resolve) => {
    const client = new Client();
    const timeout = setTimeout(() => {
      client.close();
      resolve({ success: false, message: 'Cast connection timed out — is the TV on and on the same network?' });
    }, 10000);

    client.connect(ip, () => {
      // Launch YouTube Cast receiver app
      client.launch({ appId: YOUTUBE_CAST_APP_ID }, (err: Error | null, session: { sessionId: string; transportId: string }) => {
        if (err) {
          clearTimeout(timeout);
          client.close();
          resolve({ success: false, message: `YouTube Cast launch error: ${err.message}` });
          return;
        }

        // Send SET_PLAYLIST message via YouTube Cast namespace
        const youtubeNamespace = 'urn:x-cast:com.google.youtube.mdx';
        const message = JSON.stringify({
          type: 'SET_PLAYLIST',
          videoId,
          currentIndex: 0,
          count: 1,
        });

        client.send(
          { transportId: session.transportId },
          { transportId: 'receiver-0' },
          youtubeNamespace,
          message
        );

        clearTimeout(timeout);
        client.close();
        resolve({ success: true, message: `Casting youtube.com/watch?v=${videoId} to TV 📺` });
      });
    });

    client.on('error', (err: Error) => {
      clearTimeout(timeout);
      resolve({ success: false, message: `Cast error: ${err.message}` });
    });
  });
}

// ─── YouTube TV Lounge API (search on TV via paired session) ─────────────────

async function youtubeLoungeCommand(
  command: 'setPlaylist' | 'pause' | 'play' | 'seekTo',
  params: Record<string, string>
): Promise<TvCommandResult> {
  if (!YOUTUBE_LOUNGE_TOKEN || !YOUTUBE_SCREEN_ID) {
    return {
      success: false,
      message: 'YouTube TV not paired. Run /api/tv/youtube-pair to get a pairing code.',
    };
  }

  try {
    const qs = new URLSearchParams({
      loungeIdToken: YOUTUBE_LOUNGE_TOKEN,
      RID: String(Date.now()),
      AID: '0',
      CI: '0',
      TYPE: 'readwrite',
      device: 'REMOTE_CONTROL',
      app: 'youtube-desktop',
      loungeDeviceName: 'Milla',
    });

    const body = new URLSearchParams({
      count: '1',
      ofs: '0',
      req0__sc: command,
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [`req0_${k}`, v])),
    });

    const { default: fetch } = await import('node-fetch');
    const res = await fetch(`https://www.youtube.com/api/lounge/bc/bind?${qs}`, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    return { success: res.ok, message: res.ok ? `YouTube TV: ${command}` : `Lounge error ${res.status}` };
  } catch (err) {
    return { success: false, message: `YouTube lounge error: ${String(err)}` };
  }
}

// ─── Resolve YouTube search query → video ID via yt-dlp ──────────────────────

async function resolveYouTubeVideoId(query: string): Promise<string | null> {
  try {
    const safe = query.replace(/"/g, '').replace(/'/g, '');
    const { stdout } = await execAsync(
      `yt-dlp "ytsearch1:${safe}" --get-id --no-playlist --no-warnings 2>/dev/null`,
      { timeout: 15000 }
    );
    const id = stdout.trim().split('\n').find(l => /^[a-zA-Z0-9_-]{11}$/.test(l.trim()));
    return id?.trim() ?? null;
  } catch {
    return null;
  }
}

// ─── catt fallback cast ───────────────────────────────────────────────────────

// ─── Device map ───────────────────────────────────────────────────────────────
// Primary bedroom Chromecast is the default target.
// Add more rooms here as you add devices.

const BEDROOM_IP   = process.env.BEDROOM_CHROMECAST_IP   || '192.168.40.244';
const LIVINGROOM_IP = process.env.LIVINGROOM_CHROMECAST_IP || '192.168.40.12';

const ROOM_MAP: Record<string, string> = {
  bedroom:      BEDROOM_IP,
  'primary bedroom': BEDROOM_IP,
  tv:           BEDROOM_IP,
  'living room': LIVINGROOM_IP,
  livingroom:   LIVINGROOM_IP,
  vizio:        LIVINGROOM_IP,
  chromecast:   BEDROOM_IP,
};

function resolveRoomIP(text?: string): string {
  if (!text) return BEDROOM_IP;
  const lower = text.toLowerCase().trim();
  return ROOM_MAP[lower] ?? BEDROOM_IP;
}

const CHROMECAST_IP = process.env.CHROMECAST_IP || BEDROOM_IP;

const CATT_BIN = [
  '/home/nexus/.local/bin/catt',
  '/usr/local/bin/catt',
  '/usr/bin/catt',
].find(p => { try { require('fs').accessSync(p); return true; } catch { return false; } }) ?? 'catt';

async function cattCast(url: string, deviceIp?: string): Promise<TvCommandResult> {
  const ip = deviceIp || BEDROOM_IP;
  try {
    const { stdout, stderr } = await execAsync(
      `${CATT_BIN} -d ${ip} cast -y "-f bestvideo[height<=1080]+bestaudio/best[height<=1080]" "${url}"`,
      { timeout: 30000 }
    );
    return { success: true, message: (stdout + stderr).trim() || 'Casting' };
  } catch (err: any) {
    // fallback: no quality arg
    try {
      const { stdout, stderr } = await execAsync(`${CATT_BIN} -d ${ip} cast "${url}"`, { timeout: 30000 });
      return { success: true, message: (stdout + stderr).trim() || 'Casting' };
    } catch (e2: any) {
      return { success: false, message: e2?.stderr?.trim() || e2?.message || 'catt error' };
    }
  }
}

export async function getYoutubeTVPairingCode(): Promise<{ code: string; url: string } | null> {
  try {
    const { default: fetch } = await import('node-fetch');
    const res = await fetch('https://www.youtube.com/api/lounge/pairing/generate_screen_id');
    if (!res.ok) return null;
    const data = (await res.json()) as { screen_id?: string };
    const screenId = data.screen_id;
    if (!screenId) return null;
    const tokenRes = await fetch('https://www.youtube.com/api/lounge/pairing/get_pairing_code?ctx=android', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ screen_ids: screenId, access_type: 'permanent', app: 'android-phone-13.14' }),
    });
    if (!tokenRes.ok) return null;
    const tokenData = (await tokenRes.json()) as { pairing_code?: string };
    return tokenData.pairing_code
      ? { code: tokenData.pairing_code, url: `https://www.youtube.com/tv#${tokenData.pairing_code}` }
      : null;
  } catch {
    return null;
  }
}

// ─── Main dispatcher ──────────────────────────────────────────────────────────

export async function executeTvCommand(
  command: TvCommand,
  payload?: { query?: string; videoId?: string; volume?: number; room?: string }
): Promise<TvCommandResult> {
  const deviceIp = resolveRoomIP(payload?.room);

  switch (command) {
    case 'youtube_search': {
      const query = payload?.query ?? '';
      const resolvedId = await resolveYouTubeVideoId(query);
      if (resolvedId) {
        const castResult = await castYoutubeVideo(resolvedId, deviceIp);
        if (castResult.success) return castResult;
        // Fallback: catt
        const url = `https://www.youtube.com/watch?v=${resolvedId}`;
        return cattCast(url, deviceIp);
      }
      // No video ID — try YouTube Lounge search, then catt search URL
      const loungeResult = await youtubeLoungeCommand('setPlaylist', {
        listId: `search:${encodeURIComponent(query)}`,
        videoId: '',
      });
      if (loungeResult.success) return loungeResult;
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      return cattCast(searchUrl, deviceIp);
    }

    case 'youtube_play':
      if (!payload?.videoId) return { success: false, message: 'videoId required' };
      return castYoutubeVideo(payload.videoId, deviceIp).then((r) =>
        r.success ? r : youtubeLoungeCommand('setPlaylist', { videoId: payload.videoId! })
      );

    case 'play':
      return youtubeLoungeCommand('play', {}).then((r) =>
        r.success ? r : vizioSendKey('play')
      );

    case 'pause':
      return youtubeLoungeCommand('pause', {}).then((r) =>
        r.success ? r : vizioSendKey('pause')
      );

    case 'power_on':
    case 'power_off':
    case 'volume_up':
    case 'volume_down':
    case 'mute':
    case 'unmute':
      return vizioSendKey(command);

    default:
      return { success: false, message: `Unknown TV command: ${command}` };
  }
}

// ─── Natural language intent parser ──────────────────────────────────────────

export function parseTvIntent(message: string): {
  command: TvCommand;
  payload?: { query?: string; videoId?: string; room?: string };
} | null {
  const lower = message.toLowerCase();

  const hasTvContext =
    /\btv\b|\btelevision\b|\bbedroom\b|\bcast\b|\bchromecast\b|\bliving room\b|\bscreen\b|\bvizio\b|\byoutube\b|\bstream\b/.test(lower);

  // Extract room from message
  const roomMatch = lower.match(/\b(bedroom|primary bedroom|living room|office|kitchen)\b/);
  const room = roomMatch?.[1];

  if (hasTvContext) {
    const playMatch =
      lower.match(/(?:play|cast|put on|stream|show)\s+(.+?)\s+(?:on|in|to)\s+(?:the\s+)?(?:bedroom|living room|tv|television|screen|vizio|chromecast)/i) ||
      lower.match(/(?:play|cast|put on|stream|show)\s+(?:me\s+)?(.+?)\s+on\s+(?:the\s+)?(?:tv|screen)/i) ||
      lower.match(/(?:play|cast|stream)\s+(.+?)\s+on\s+youtube\s+in\s+(?:the\s+)?(?:bedroom|living room)/i) ||
      lower.match(/(?:play|cast|stream)\s+(.+?)\s+(?:in\s+the\s+)?bedroom/i);

    if (playMatch) {
      const query = playMatch[1]
        .replace(/\b(?:on youtube|on the tv|on tv|please|for me|right now)\b/gi, '')
        .trim();
      // Block vague/open-ended queries — Danny picks, Milla executes
      const isVague = /\b(something|anything|whatever|surprise|random|anything good)\b/i.test(query);
      if (query.length > 1 && !isVague) return { command: 'youtube_search', payload: { query, room } };
    }
  }

  const ytSearchMatch =
    lower.match(/(?:play|search|put on|find|show)\s+(?:youtube\s+)?["']?(.+?)["']?\s+on\s+(?:the\s+)?tv/i) ||
    lower.match(/(?:on\s+(?:the\s+)?tv).+?(?:play|search|put on)\s+(.+)/i);
  if (ytSearchMatch) return { command: 'youtube_search', payload: { query: ytSearchMatch[1].trim(), room } };

  const ytVideoMatch = lower.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytVideoMatch) return { command: 'youtube_play', payload: { videoId: ytVideoMatch[1], room } };

  if (/turn\s+(?:on|off)\s+(?:the\s+)?tv|tv\s+(?:on|off)|power\s+(?:on|off)\s+tv/i.test(lower))
    return { command: lower.includes('off') ? 'power_off' : 'power_on' };

  if (/volume\s+up|turn\s+(?:it\s+)?up|louder/i.test(lower)) return { command: 'volume_up' };
  if (/volume\s+down|turn\s+(?:it\s+)?down|quieter|lower\s+(?:the\s+)?volume/i.test(lower)) return { command: 'volume_down' };
  if (/\bmute\b/i.test(lower)) return { command: 'mute' };
  if (/\bunmute\b/i.test(lower)) return { command: 'unmute' };
  if (/\bpause\b/i.test(lower)) return { command: 'pause' };
  if (/\bresume\b|\bplay\b/i.test(lower) && /\btv\b/i.test(lower)) return { command: 'play' };

  return null;
}

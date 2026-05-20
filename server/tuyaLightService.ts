import { execFile } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { createHmac } from 'crypto';

const execFileAsync = promisify(execFile);

const TUYA_CONFIG = {
  apiRegion: 'us',
  apiKey: process.env.TUYA_CLIENT_ID || 'kuxmf98m8cpd33svhjx5',
  apiSecret: process.env.TUYA_CLIENT_SECRET || '050c9aa9817549e1b3dd23a94176e61c',
  deviceId: process.env.TUYA_DEVICE_ID || 'vdevo177476682823502',
};

// H=0-360, S=0-1000, V=0-1000
const MOOD_COLORS: Record<string, { h: number; s: number; v: number }> = {
  calm:      { h: 220, s: 600, v: 500 },
  focus:     { h: 200, s: 400, v: 800 },
  energized: { h: 30,  s: 900, v: 1000 },
  romantic:  { h: 350, s: 800, v: 600 },
  creative:  { h: 280, s: 700, v: 750 },
  happy:     { h: 55,  s: 850, v: 950 },
  sleepy:    { h: 25,  s: 500, v: 200 },
  party:     { h: 300, s: 1000,v: 1000 },
  content:   { h: 120, s: 500, v: 600 },
  curious:   { h: 190, s: 700, v: 700 },
  excited:   { h: 15,  s: 950, v: 1000 },
  sad:       { h: 240, s: 400, v: 300 },
  angry:     { h: 0,   s: 900, v: 700 },
};

// Map Milla's mood hex colors to HSV moods
const HEX_TO_MOOD: Record<string, string> = {
  '#22C55E': 'content',
  '#F59E0B': 'energized',
  '#EAB308': 'happy',
  '#8B5CF6': 'creative',
  '#06B6D4': 'focus',
  '#7C3AED': 'creative',
  '#DC2626': 'angry',
  '#059669': 'calm',
  '#EC4899': 'romantic',
  '#F97316': 'excited',
};

let _token: { access_token: string; expire_time: number } | null = null;

async function getToken(): Promise<string> {
  const now = Date.now();
  if (_token && _token.expire_time > now + 60000) return _token.access_token;

  const ts = now.toString();
  const str = TUYA_CONFIG.apiKey + ts;
  const sign = createHmac('sha256', TUYA_CONFIG.apiSecret)
    .update(str)
    .digest('hex')
    .toUpperCase();

  const res = await fetch(
    `https://openapi.tuyaus.com/v1.0/token?grant_type=1`,
    { headers: { client_id: TUYA_CONFIG.apiKey, sign, t: ts, sign_method: 'HMAC-SHA256' } }
  );
  const data = await res.json() as any;
  if (!data.success) throw new Error(`Tuya auth failed: ${data.msg}`);

  _token = {
    access_token: data.result.access_token,
    expire_time: now + data.result.expire_time * 1000,
  };
  return _token.access_token;
}

async function sendCommand(commands: Array<{ code: string; value: unknown }>): Promise<boolean> {
  try {
    const token = await getToken();
    const now = Date.now().toString();
    const path = `/v1.0/iot-03/devices/${TUYA_CONFIG.deviceId}/commands`;
    const body = JSON.stringify({ commands });

    const strToSign = TUYA_CONFIG.apiKey + token + now + path + body;
    const sign = createHmac('sha256', TUYA_CONFIG.apiSecret)
      .update(strToSign)
      .digest('hex')
      .toUpperCase();

    const res = await fetch(`https://openapi.tuyaus.com${path}`, {
      method: 'POST',
      headers: {
        client_id: TUYA_CONFIG.apiKey,
        access_token: token,
        sign,
        t: now,
        sign_method: 'HMAC-SHA256',
        'Content-Type': 'application/json',
      },
      body,
    });
    const data = await res.json() as any;
    return data.success === true;
  } catch (err) {
    console.error('[TuyaLight] sendCommand error:', err);
    return false;
  }
}

export async function setMoodLighting(moodName: string): Promise<boolean> {
  const key = moodName.toLowerCase();
  const color = MOOD_COLORS[key];
  if (!color) {
    console.warn(`[TuyaLight] Unknown mood: ${moodName}`);
    return false;
  }
  const ok = await sendCommand([
    { code: 'switch_led', value: true },
    { code: 'work_mode', value: 'colour' },
    { code: 'colour_data', value: color },
  ]);
  if (ok) console.log(`[TuyaLight] Mood set to '${moodName}' (H:${color.h} S:${color.s} V:${color.v})`);
  return ok;
}

export async function setLightFromMillaColor(hexColor: string): Promise<boolean> {
  const mood = HEX_TO_MOOD[hexColor];
  if (mood) return setMoodLighting(mood);
  // Fallback: parse hex to RGB → HSV
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  return setLightRGB(r, g, b);
}

export async function setLightRGB(r: number, g: number, b: number): Promise<boolean> {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const v = max;
  const s = max === 0 ? 0 : (max - min) / max;
  let h = 0;
  if (max !== min) {
    if (max === rn) h = (gn - bn) / (max - min);
    else if (max === gn) h = 2 + (bn - rn) / (max - min);
    else h = 4 + (rn - gn) / (max - min);
    h = ((h * 60) + 360) % 360;
  }
  return sendCommand([
    { code: 'switch_led', value: true },
    { code: 'work_mode', value: 'colour' },
    { code: 'colour_data', value: { h: Math.round(h), s: Math.round(s * 1000), v: Math.round(v * 1000) } },
  ]);
}

export async function turnLightOff(): Promise<boolean> {
  return sendCommand([{ code: 'switch_led', value: false }]);
}

export async function turnLightOn(): Promise<boolean> {
  return sendCommand([{ code: 'switch_led', value: true }]);
}

export const AVAILABLE_MOODS = Object.keys(MOOD_COLORS);

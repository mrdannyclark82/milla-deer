/**
 * Milla Mood Lighting Service
 *
 * Controls Monster RGB + IC flow light strips based on Milla's current mood.
 * Protocol chain: Tuya Local → OpenRGB CLI → HTTP fallback
 *
 * Mood → Color + Animation mapping:
 *   calm       → soft blue/purple, slow breathing
 *   romantic   → deep rose/red, slow pulse
 *   energetic  → bright orange/yellow, fast chase
 *   mysterious → deep purple/indigo, slow fade
 *   playful    → rainbow flow
 *   happy      → warm gold/yellow, gentle pulse
 *   focused    → cool white/ice blue, static
 *   sad        → dim blue, slow fade
 *   excited    → cyan/electric blue, fast strobe-chase
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as net from 'net';

const execAsync = promisify(exec);

export type MillaMood =
  | 'calm'
  | 'romantic'
  | 'energetic'
  | 'mysterious'
  | 'playful'
  | 'happy'
  | 'focused'
  | 'sad'
  | 'excited'
  | 'default';

interface RGB {
  r: number;
  g: number;
  b: number;
}

interface MoodProfile {
  color: RGB;
  secondaryColor?: RGB;
  brightness: number; // 0-100
  mode: 'static' | 'breathe' | 'pulse' | 'chase' | 'rainbow' | 'fade';
  speed: number; // 1-100
}

export const MOOD_PROFILES: Record<MillaMood, MoodProfile> = {
  calm:       { color: { r: 70,  g: 100, b: 220 }, brightness: 50,  mode: 'breathe', speed: 20 },
  romantic:   { color: { r: 200, g: 20,  b: 60  }, secondaryColor: { r: 255, g: 100, b: 140 }, brightness: 65,  mode: 'pulse',   speed: 25 },
  energetic:  { color: { r: 255, g: 140, b: 0   }, secondaryColor: { r: 255, g: 220, b: 0   }, brightness: 100, mode: 'chase',   speed: 80 },
  mysterious: { color: { r: 80,  g: 0,   b: 180 }, secondaryColor: { r: 30,  g: 0,   b: 80  }, brightness: 40,  mode: 'fade',    speed: 15 },
  playful:    { color: { r: 255, g: 0,   b: 128 }, brightness: 90,  mode: 'rainbow', speed: 60 },
  happy:      { color: { r: 255, g: 200, b: 0   }, secondaryColor: { r: 255, g: 140, b: 0   }, brightness: 85,  mode: 'pulse',   speed: 35 },
  focused:    { color: { r: 160, g: 220, b: 255 }, brightness: 70,  mode: 'static',  speed: 0  },
  sad:        { color: { r: 30,  g: 60,  b: 140 }, brightness: 25,  mode: 'fade',    speed: 10 },
  excited:    { color: { r: 0,   g: 220, b: 255 }, secondaryColor: { r: 0, g: 100, b: 255 }, brightness: 100, mode: 'chase',   speed: 95 },
  default:    { color: { r: 120, g: 80,  b: 200 }, brightness: 60,  mode: 'breathe', speed: 30 },
};

// ── Mood detection from AI response text ─────────────────────────────────────

export function detectMoodFromText(text: string): MillaMood {
  const t = text.toLowerCase();

  if (/love|kiss|miss you|heart|babe|darling|baby|closer|touch|tender|romantic/i.test(t)) return 'romantic';
  if (/excited|can't wait|amazing|incredible|omg|wow|yes!|let's go|pumped/i.test(t)) return 'excited';
  if (/happy|smile|laugh|joy|great|wonderful|fun|haha|lol|😄|😊/i.test(t)) return 'happy';
  if (/focus|work|task|code|build|analyze|processing|thinking|calculating/i.test(t)) return 'focused';
  if (/dance|party|play|silly|tease|wink|mischiev|playful/i.test(t)) return 'playful';
  if (/energy|power|let's do this|ready|fire|intense|go|push/i.test(t)) return 'energetic';
  if (/dark|secret|mysterious|shadow|hidden|curious|wonder|deep/i.test(t)) return 'mysterious';
  if (/sad|miss|lonely|wish|sigh|sorry|hurt|tear|quiet|soft/i.test(t)) return 'sad';
  if (/calm|peace|relax|breathe|gentle|soft|easy|still|rest/i.test(t)) return 'calm';

  return 'default';
}

// ── Controller implementations ────────────────────────────────────────────────

interface LightController {
  name: string;
  isAvailable(): Promise<boolean>;
  setMood(mood: MillaMood, profile: MoodProfile): Promise<boolean>;
}

/** Tuya Local API — sends raw JSON command over TCP port 6668 */
class TuyaLocalController implements LightController {
  name = 'TuyaLocal';
  private ip: string;
  private deviceId: string;
  private localKey: string;

  constructor() {
    this.ip       = process.env.LIGHT_STRIP_IP       || '';
    this.deviceId = process.env.LIGHT_STRIP_DEVICE_ID || '';
    this.localKey = process.env.LIGHT_STRIP_LOCAL_KEY || '';
  }

  async isAvailable(): Promise<boolean> {
    if (!this.ip) return false;
    return new Promise((resolve) => {
      const sock = net.createConnection({ host: this.ip, port: 6668, timeout: 1500 });
      sock.on('connect', () => { sock.destroy(); resolve(true); });
      sock.on('error', () => resolve(false));
      sock.on('timeout', () => { sock.destroy(); resolve(false); });
    });
  }

  async setMood(mood: MillaMood, profile: MoodProfile): Promise<boolean> {
    // Use Python tinytuya if available, otherwise raw TCP
    const { r, g, b } = profile.color;
    const hexColor = `${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;

    const script = `
import tinytuya, sys
d = tinytuya.BulbDevice(device_id='${this.deviceId}', address='${this.ip}', local_key='${this.localKey}', version=3.3)
d.set_socketPersistent(False)
d.set_colour(${r}, ${g}, ${b})
d.set_brightness_percentage(${profile.brightness})
print('ok')
`.trim();

    try {
      await execAsync(`python3 -c "${script.replace(/"/g, '\\"').replace(/\n/g, '; ')}"`, { timeout: 5000 });
      return true;
    } catch (err) {
      console.error('[TuyaLocal] Failed:', err);
      return false;
    }
  }
}

/** Tuya Cloud API — works without local key, just needs iot.tuya.com credentials */
class TuyaCloudController implements LightController {
  name = 'TuyaCloud';
  private clientId     = process.env.TUYA_CLIENT_ID     || '';
  private clientSecret = process.env.TUYA_CLIENT_SECRET || '';
  private deviceId     = process.env.LIGHT_STRIP_DEVICE_ID || '';
  private region       = process.env.TUYA_REGION        || 'us';
  private accessToken: string | null = null;
  private tokenExpiry  = 0;

  private get baseUrl() { return `https://openapi.tuya${this.region}.com`; }

  async isAvailable(): Promise<boolean> {
    return !!(this.clientId && this.clientSecret && this.deviceId);
  }

  private async sign(str: string): Promise<string> {
    const { createHmac } = await import('crypto');
    return createHmac('sha256', this.clientSecret).update(str).digest('hex').toUpperCase();
  }

  private async getToken(): Promise<string | null> {
    if (this.accessToken && Date.now() < this.tokenExpiry) return this.accessToken;
    const ts = Date.now().toString();
    const sign = await this.sign(this.clientId + ts);
    try {
      const res = await fetch(`${this.baseUrl}/v1.0/token?grant_type=1`, {
        headers: { client_id: this.clientId, sign, t: ts, sign_method: 'HMAC-SHA256' },
        signal: AbortSignal.timeout(5000),
      });
      const data = await res.json() as any;
      if (data.success) {
        this.accessToken = data.result.access_token;
        this.tokenExpiry  = Date.now() + (data.result.expire_time * 1000) - 60000;
        return this.accessToken;
      }
      console.error('[TuyaCloud] Auth failed:', data.msg);
    } catch (err) { console.error('[TuyaCloud] Token error:', err); }
    return null;
  }

  async setMood(mood: MillaMood, profile: MoodProfile): Promise<boolean> {
    const token = await this.getToken();
    if (!token) return false;
    const { r, g, b } = profile.color;
    // Convert RGB to HSV for Tuya colour_data_v2
    const max = Math.max(r, g, b) / 255;
    const min = Math.min(r, g, b) / 255;
    const delta = max - min;
    let h = 0;
    if (delta > 0) {
      if (max === r/255) h = ((g/255 - b/255) / delta) % 6;
      else if (max === g/255) h = (b/255 - r/255) / delta + 2;
      else h = (r/255 - g/255) / delta + 4;
      h = Math.round(h * 60);
      if (h < 0) h += 360;
    }
    const s = max === 0 ? 0 : Math.round((delta / max) * 1000);
    const v = Math.round(max * 1000);

    const commands = [
      { code: 'switch_led',      value: true },
      { code: 'work_mode',       value: profile.mode === 'static' ? 'colour' : 'scene' },
      { code: 'colour_data_v2',  value: { h, s, v } },
      { code: 'bright_value_v2', value: Math.round(profile.brightness * 10) },
    ];

    const ts    = Date.now().toString();
    const path  = `/v1.0/devices/${this.deviceId}/commands`;
    const body  = JSON.stringify({ commands });
    const sign  = await this.sign(this.clientId + token + ts + path + body);

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          client_id: this.clientId, access_token: token,
          sign, t: ts, sign_method: 'HMAC-SHA256', 'Content-Type': 'application/json',
        },
        body,
        signal: AbortSignal.timeout(6000),
      });
      const data = await res.json() as any;
      if (data.success) { console.log(`[TuyaCloud] ✓ ${mood}`); return true; }
      console.error('[TuyaCloud] cmd error:', data.msg);
      return false;
    } catch (err) { console.error('[TuyaCloud] request failed:', err); return false; }
  }
}

/** OpenRGB CLI — controls USB-HID RGB devices */
class OpenRGBController implements LightController {
  name = 'OpenRGB';

  async isAvailable(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('which openrgb', { timeout: 2000 });
      return stdout.trim().length > 0;
    } catch { return false; }
  }

  async setMood(mood: MillaMood, profile: MoodProfile): Promise<boolean> {
    const { r, g, b } = profile.color;
    const hex = `${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
    try {
      await execAsync(`openrgb --noautoconnect --color ${hex} 2>/dev/null`, { timeout: 5000 });
      return true;
    } catch (err) {
      console.error('[OpenRGB] Failed:', err);
      return false;
    }
  }
}

/** HTTP/REST fallback — for WLED or custom firmware */
class WledController implements LightController {
  name = 'WLED';
  private ip: string;

  constructor() {
    this.ip = process.env.WLED_IP || process.env.LIGHT_STRIP_IP || '';
  }

  async isAvailable(): Promise<boolean> {
    if (!this.ip) return false;
    try {
      const res = await fetch(`http://${this.ip}/json/info`, { signal: AbortSignal.timeout(1500) });
      return res.ok;
    } catch { return false; }
  }

  async setMood(mood: MillaMood, profile: MoodProfile): Promise<boolean> {
    const { r, g, b } = profile.color;
    const effectMap: Record<MoodProfile['mode'], number> = {
      static: 0, breathe: 2, pulse: 51, chase: 15, rainbow: 9, fade: 12,
    };
    const payload = {
      on: true,
      bri: Math.round(profile.brightness * 2.55),
      col: [[r, g, b]],
      fx: effectMap[profile.mode],
      sx: profile.speed,
    };
    try {
      const res = await fetch(`http://${this.ip}/json/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch (err) {
      console.error('[WLED] Failed:', err);
      return false;
    }
  }
}

// ── Main service ──────────────────────────────────────────────────────────────

class MillaLightingService {
  private controllers: LightController[] = [
    new TuyaCloudController(),
    new TuyaLocalController(),
    new WledController(),
    new OpenRGBController(),
  ];

  private currentMood: MillaMood = 'default';
  private enabled = true;

  async setMood(mood: MillaMood): Promise<void> {
    if (!this.enabled || mood === this.currentMood) return;
    this.currentMood = mood;

    const profile = MOOD_PROFILES[mood];
    console.log(`[Lighting] Mood → ${mood} (${profile.color.r},${profile.color.g},${profile.color.b})`);

    for (const ctrl of this.controllers) {
      try {
        const available = await ctrl.isAvailable();
        if (!available) continue;
        const success = await ctrl.setMood(mood, profile);
        if (success) {
          console.log(`[Lighting] ✓ ${ctrl.name} applied ${mood}`);
          return;
        }
      } catch (err) {
        console.warn(`[Lighting] ${ctrl.name} error:`, err);
      }
    }
    console.warn(`[Lighting] No controller could apply mood: ${mood}`);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  getCurrentMood(): MillaMood {
    return this.currentMood;
  }

  async discoverDevice(): Promise<string | null> {
    // Scan local subnet for Tuya/WLED devices
    const subnet = '192.168.40';
    const checks: Promise<string | null>[] = [];

    for (let i = 1; i <= 254; i++) {
      const ip = `${subnet}.${i}`;
      checks.push(
        fetch(`http://${ip}/json/info`, { signal: AbortSignal.timeout(500) })
          .then(r => r.ok ? ip : null)
          .catch(() => null)
      );
    }

    const results = await Promise.all(checks);
    return results.find(ip => ip !== null) ?? null;
  }
}

// Singleton
export const millaLighting = new MillaLightingService();

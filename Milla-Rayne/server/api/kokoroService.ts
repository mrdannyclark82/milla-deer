/**
 * Piper TTS Service — local neural TTS for Milla's voice.
 * Uses the piper HTTP server running at PIPER_TTS_URL (default: http://localhost:5400).
 * Voice model: en_US-amy-medium (warm, expressive female voice).
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const PIPER_TTS_URL = process.env.PIPER_TTS_URL || 'http://localhost:5400';

export async function generatePiperSpeech(text: string): Promise<string | null> {
  try {
    const response = await fetch(`${PIPER_TTS_URL}/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) return null;

    const audioDir = path.resolve(process.cwd(), 'client', 'public', 'audio');
    if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

    const hash = crypto.createHash('sha256').update(`piper:${text}`).digest('hex');
    const filePath = path.join(audioDir, `${hash}.wav`);

    if (!fs.existsSync(filePath)) {
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(filePath, buffer);
    }

    return `/audio/${hash}.wav`;
  } catch {
    return null;
  }
}

export async function isPiperAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${PIPER_TTS_URL}/health`, {
      signal: AbortSignal.timeout(2_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

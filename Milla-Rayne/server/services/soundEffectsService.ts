/**
 * Sound Effects Service
 *
 * Gives Milla a library of ElevenLabs-generated sound effects she can
 * select contextually based on mood/intent. Plays via the client's
 * Web Audio API by sending a SSE event, or directly via server-side
 * aplay/paplay on Linux when running headlessly.
 *
 * Sound files live in: voice/sounds/
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readdirSync } from 'fs';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOUNDS_DIR = path.resolve(__dirname, '../../../voice/sounds');

export interface SoundEffect {
  id: string;
  file: string;
  label: string;
  /** Moods/contexts that should trigger this sound */
  triggers: string[];
}

const SOUND_LIBRARY: SoundEffect[] = [
  {
    id: 'giggle_3',
    file: 'giggle_3.mp3',
    label: 'Giggle (soft)',
    triggers: ['funny', 'joke', 'laugh', 'haha', 'lol', 'humor', 'amused', 'teasing'],
  },
  {
    id: 'giggle_4',
    file: 'giggle_4.mp3',
    label: 'Giggle (bright)',
    triggers: ['excited', 'happy', 'delight', 'playful', 'cute', 'giggle'],
  },
  {
    id: 'heartbeat',
    file: 'heartbeat.wav',
    label: 'Heartbeat',
    triggers: ['nervous', 'suspense', 'intense', 'waiting', 'anticipation', 'stress'],
  },
  {
    id: 'crowd_scream',
    file: 'crowd_scream.wav',
    label: 'Crowd reaction',
    triggers: ['shocked', 'wow', 'amazing', 'incredible', 'milestone', 'victory', 'launch'],
  },
  {
    id: 'distant_laugh',
    file: 'distant_laugh.wav',
    label: 'Distant laugh',
    triggers: ['sarcastic', 'ironic', 'backfire', 'awkward', 'roast'],
  },
];

/** Return all available sound effects */
export function listSounds(): SoundEffect[] {
  return SOUND_LIBRARY.filter(s => existsSync(path.join(SOUNDS_DIR, s.file)));
}

/** Pick the best sound effect for a given mood/text context */
export function pickSoundForContext(text: string): SoundEffect | null {
  const lower = text.toLowerCase();
  for (const sound of SOUND_LIBRARY) {
    if (sound.triggers.some(trigger => lower.includes(trigger))) {
      const filePath = path.join(SOUNDS_DIR, sound.file);
      if (existsSync(filePath)) return sound;
    }
  }
  return null;
}

/** Get full absolute path for a sound by ID */
export function getSoundPath(id: string): string | null {
  const sound = SOUND_LIBRARY.find(s => s.id === id);
  if (!sound) return null;
  const filePath = path.join(SOUNDS_DIR, sound.file);
  return existsSync(filePath) ? filePath : null;
}

/**
 * Play a sound server-side via aplay/paplay (Linux).
 * Non-blocking — fire and forget.
 */
export function playSoundServerSide(id: string): void {
  const filePath = getSoundPath(id);
  if (!filePath) {
    console.warn(`[SoundFX] Sound not found: ${id}`);
    return;
  }

  const player = filePath.endsWith('.mp3') ? 'mpg123' : 'aplay';
  const proc = spawn(player, [filePath], { detached: true, stdio: 'ignore' });
  proc.unref();
  console.log(`[SoundFX] Playing ${id} via ${player}`);
}

/**
 * Scan the sounds directory and register any new files not yet in SOUND_LIBRARY.
 * Milla can call this to "discover" new sound effects placed in voice/sounds/.
 */
export function discoverNewSounds(): SoundEffect[] {
  if (!existsSync(SOUNDS_DIR)) return [];

  const knownFiles = new Set(SOUND_LIBRARY.map(s => s.file));
  const allFiles = readdirSync(SOUNDS_DIR).filter(f => /\.(mp3|wav|ogg)$/i.test(f));
  const newFiles = allFiles.filter(f => !knownFiles.has(f));

  const discovered: SoundEffect[] = newFiles.map(file => {
    const id = file.replace(/\.[^.]+$/, '').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    return {
      id,
      file,
      label: file.replace(/[-_#\d]+/g, ' ').replace(/\.[^.]+$/, '').trim(),
      triggers: [], // Milla assigns triggers as she learns
    };
  });

  if (discovered.length > 0) {
    console.log(`[SoundFX] Discovered ${discovered.length} new sound(s):`, discovered.map(s => s.file));
    SOUND_LIBRARY.push(...discovered);
  }

  return discovered;
}

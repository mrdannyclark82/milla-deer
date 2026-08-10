import { loadSceneSettings } from '@/utils/sceneSettingsStore';

export const MILLA_ROOM_VOICE_ID = 'knLPDa0yhh07scaTXeg6';

function cleanForSpeech(text: string): string {
  return text
    .replace(/\*[^*]*\*/g, '')
    .replace(/[_~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

let roomVoiceBusy = false;

async function playAudioUrl(url: string): Promise<boolean> {
  try {
    const audio = new Audio(url);
    audio.volume = 0.92;
    await audio.play();
    return true;
  } catch {
    return false;
  }
}

async function speakViaPiper(text: string): Promise<boolean> {
  const response = await fetch('/api/tts/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      text,
      voiceId: MILLA_ROOM_VOICE_ID,
      prefer: 'piper',
    }),
  });
  if (!response.ok) return false;
  const data = (await response.json()) as { audioUrl?: string | null };
  if (!data.audioUrl) return false;
  return playAudioUrl(data.audioUrl);
}

async function speakViaElevenLabs(
  text: string,
  voiceId: string
): Promise<boolean> {
  const response = await fetch('/api/elevenlabs/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ text, voiceName: voiceId }),
  });
  if (!response.ok) return false;
  const blob = await response.blob();
  if (!blob.size || blob.type.includes('json')) return false;
  const url = URL.createObjectURL(blob);
  try {
    const audio = new Audio(url);
    audio.volume = 0.92;
    await audio.play();
    return true;
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

export async function speakRoomLine(message: string): Promise<void> {
  const settings = loadSceneSettings();
  if (settings.interactiveRoomVoiceEnabled === false) return;

  const text = cleanForSpeech(message);
  if (!text || roomVoiceBusy) return;

  const voiceId = settings.interactiveRoomVoiceId || MILLA_ROOM_VOICE_ID;

  roomVoiceBusy = true;
  try {
    // Local Piper (Amy) — warm offline Milla voice, no robot browser fallback
    if (await speakViaPiper(text)) return;

    // Custom ElevenLabs clone when API key is live
    if (await speakViaElevenLabs(text, voiceId)) return;

    console.warn('Room voice unavailable — Piper and ElevenLabs both failed');
  } catch (error) {
    console.warn('Room voice failed:', error);
  } finally {
    roomVoiceBusy = false;
  }
}

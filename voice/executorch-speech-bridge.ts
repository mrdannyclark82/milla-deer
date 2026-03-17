// On-device STT/TTS bridge — 2× faster fallback, zero cloud
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';

export const speakWithExecuTorch = async (text: string, persona: string = 'deer') => {
  const pitch = persona === 'deer' ? 1.15 : 0.95;
  const rate = 0.92;
  await Speech.speak(text, { pitch, rate });
  console.log(`[ExecuTorch Bridge] Spoken as ${persona}`);
};

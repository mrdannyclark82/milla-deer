import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// TTS fallback chain:
//   1. POST /api/tts/speak  → server returns audioUrl (OpenAI / ElevenLabs)
//   2. Browser Web Speech API (window.speechSynthesis) — zero-cost, instant
// ---------------------------------------------------------------------------

const SERVER_TTS_ENABLED =
  typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? false  // off for non-local, avoid cross-origin complexity
    : true;

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  // Prefer a natural-sounding female English voice
  const ranked = [
    (v: SpeechSynthesisVoice) => v.name.includes('Samantha'),
    (v: SpeechSynthesisVoice) => v.name.includes('Karen'),
    (v: SpeechSynthesisVoice) => v.name.includes('Tessa'),
    (v: SpeechSynthesisVoice) => v.name.includes('Moira'),
    (v: SpeechSynthesisVoice) =>
      v.lang.startsWith('en') && v.name.toLowerCase().includes('female'),
    (v: SpeechSynthesisVoice) => v.lang === 'en-US' && !v.name.includes('Google'),
    (v: SpeechSynthesisVoice) => v.lang.startsWith('en-US'),
    (v: SpeechSynthesisVoice) => v.lang.startsWith('en'),
  ];
  for (const test of ranked) {
    const match = voices.find(test);
    if (match) return match;
  }
  return voices[0] ?? null;
}

// Strip markdown / emotes so they don't get read aloud
function cleanForSpeech(text: string): string {
  return text
    .replace(/\*[^*]*\*/g, '')          // *italics/emotes*
    .replace(/```[\s\S]*?```/g, '')      // code blocks
    .replace(/`[^`]*`/g, '')            // inline code
    .replace(/#+\s/g, '')               // headers
    .replace(/!\[.*?\]\(.*?\)/g, '')    // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → label only
    .replace(/---+/g, '')               // dividers
    .replace(/[*_~]/g, '')              // stray markdown
    .trim();
}

async function speakViaServer(text: string): Promise<boolean> {
  try {
    const res = await fetch('/api/tts/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return false;
    const { audioUrl } = await res.json() as { audioUrl?: string };
    if (!audioUrl) return false;
    const audio = new Audio(audioUrl);
    await audio.play();
    return true;
  } catch {
    return false;
  }
}

function speakViaBrowser(
  text: string,
  onStart?: () => void,
  onEnd?: () => void
): SpeechSynthesisUtterance | null {
  if (!('speechSynthesis' in window)) return null;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.92;
  utterance.pitch = 1.05;
  utterance.volume = 1;

  const voice = pickVoice();
  if (voice) utterance.voice = voice;

  utterance.onstart = () => onStart?.();
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();

  window.speechSynthesis.speak(utterance);
  return utterance;
}

// ---------------------------------------------------------------------------
// STT — Web Speech Recognition
// ---------------------------------------------------------------------------
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
  interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start(): void;
    stop(): void;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: Event) => void) | null;
    onend: (() => void) | null;
  }
}

export interface UseVoiceReturn {
  isSpeaking: boolean;
  isListening: boolean;
  autoSpeak: boolean;
  voiceReady: boolean;
  speak: (text: string) => void;
  stop: () => void;
  toggleAutoSpeak: () => void;
  startListening: (onTranscript: (text: string) => void) => void;
  stopListening: () => void;
}

export function useVoice(): UseVoiceReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(() => {
    try {
      return localStorage.getItem('milla_auto_speak') === 'true';
    } catch {
      return false;
    }
  });
  const [voiceReady, setVoiceReady] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Voices load async in some browsers
  useEffect(() => {
    const check = () => {
      if ('speechSynthesis' in window) {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) setVoiceReady(true);
      }
    };
    check();
    window.speechSynthesis?.addEventListener?.('voiceschanged', check);
    return () =>
      window.speechSynthesis?.removeEventListener?.('voiceschanged', check);
  }, []);

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(
    async (rawText: string) => {
      const text = cleanForSpeech(rawText);
      if (!text) return;

      stop();
      setIsSpeaking(true);

      // Try server TTS first if enabled (higher quality when key exists)
      if (SERVER_TTS_ENABLED) {
        const ok = await speakViaServer(text);
        if (ok) {
          setIsSpeaking(false);
          return;
        }
      }

      // Fall back to browser speech
      speakViaBrowser(
        text,
        () => setIsSpeaking(true),
        () => setIsSpeaking(false)
      );
    },
    [stop]
  );

  const toggleAutoSpeak = useCallback(() => {
    setAutoSpeak((v) => {
      const next = !v;
      try {
        localStorage.setItem('milla_auto_speak', String(next));
      } catch {}
      return next;
    });
  }, []);

  const startListening = useCallback(
    (onTranscript: (text: string) => void) => {
      const SR =
        window.SpeechRecognition ?? window.webkitSpeechRecognition;
      if (!SR) return;

      const recognition = new SR();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = event.results[0]?.[0]?.transcript ?? '';
        if (transcript) onTranscript(transcript);
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);

      recognition.start();
      recognitionRef.current = recognition;
      setIsListening(true);
    },
    []
  );

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
      recognitionRef.current?.stop();
    };
  }, []);

  return {
    isSpeaking,
    isListening,
    autoSpeak,
    voiceReady,
    speak,
    stop,
    toggleAutoSpeak,
    startListening,
    stopListening,
  };
}

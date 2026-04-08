import { useState, useCallback } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Radio } from 'lucide-react';
import { VoiceVisualizer } from './VoiceVisualizer';

/**
 * Self-contained voice panel for the Dashboard voice section.
 * Handles its own listen/speak state internally.
 */
export function VoicePage() {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [statusMsg, setStatusMsg] = useState('Ready');
  const recognitionRef = { current: null as SpeechRecognition | null };

  const startListening = useCallback(async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const SpeechRecognitionAPI =
        (window as Window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition ||
        (window as Window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;

      if (!SpeechRecognitionAPI) {
        setStatusMsg('Speech recognition not supported in this browser.');
        return;
      }

      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognitionRef.current = recognition;

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const result = Array.from(event.results)
          .map((r) => r[0].transcript)
          .join('');
        setTranscript(result);
      };

      recognition.onend = () => {
        setIsListening(false);
        setStatusMsg('Transcript captured. Send to Milla via chat.');
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        setIsListening(false);
        setStatusMsg(`Error: ${event.error}`);
      };

      recognition.start();
      setIsListening(true);
      setStatusMsg('Listening...');
    } catch {
      setStatusMsg('Microphone access denied.');
    }
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const speakText = useCallback((text: string) => {
    if (!text.trim()) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, []);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  return (
    <div className="min-h-[500px] flex flex-col gap-6 p-4">
      <div className="flex items-center gap-3 mb-2">
        <Radio className="w-5 h-5 text-[#00f2ff]" />
        <h2 className="text-xl font-semibold text-white tracking-tight">Voice Interface</h2>
        <span className="ml-auto text-xs font-mono text-white/40 uppercase tracking-widest">{statusMsg}</span>
      </div>

      {/* Visualizer */}
      <div className="flex justify-center">
        <VoiceVisualizer
          isListening={isListening}
          isSpeaking={isSpeaking}
          className="w-full max-w-md h-32"
        />
      </div>

      {/* Controls */}
      <div className="flex gap-4 justify-center">
        <button
          onClick={isListening ? stopListening : startListening}
          className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-medium text-sm transition-all border ${
            isListening
              ? 'bg-red-500/20 border-red-500/40 text-red-300 hover:bg-red-500/30'
              : 'bg-[#00f2ff]/10 border-[#00f2ff]/30 text-[#00f2ff] hover:bg-[#00f2ff]/20'
          }`}
        >
          {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          {isListening ? 'Stop Listening' : 'Start Listening'}
        </button>

        <button
          onClick={isSpeaking ? stopSpeaking : () => speakText(transcript)}
          disabled={!transcript.trim() && !isSpeaking}
          className="flex items-center gap-2 px-6 py-3 rounded-2xl font-medium text-sm transition-all border bg-white/5 border-white/10 text-white/70 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {isSpeaking ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          {isSpeaking ? 'Stop Speaking' : 'Read Transcript'}
        </button>
      </div>

      {/* Transcript */}
      <div className="flex-1 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 min-h-[140px]">
        <div className="text-xs font-mono text-white/30 uppercase tracking-widest mb-3">Transcript</div>
        {transcript ? (
          <p className="text-white/80 leading-relaxed text-sm">{transcript}</p>
        ) : (
          <p className="text-white/20 text-sm italic">Speak to capture transcript...</p>
        )}
      </div>

      {transcript && (
        <button
          onClick={() => setTranscript('')}
          className="self-end text-xs text-white/30 hover:text-white/60 transition-colors"
        >
          Clear transcript
        </button>
      )}
    </div>
  );
}

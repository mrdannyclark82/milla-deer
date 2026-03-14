import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';

interface LiveSessionProps {
  apiKey: string;
  onClose: () => void;
  systemInstruction?: string;
}

const LiveSession: React.FC<LiveSessionProps> = ({ apiKey, onClose, systemInstruction }) => {
  const [status, setStatus] = useState<'connecting' | 'active' | 'error' | 'closed'>('connecting');
  const [volume, setVolume] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Audio Contexts
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sessionRef = useRef<any>(null); // Keep session reference

  useEffect(() => {
    let mounted = true;

    const startSession = async () => {
      try {
        const ai = new GoogleGenAI({ apiKey });
        
        // Setup Audio
        inputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        outputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        
        // Setup Video Stream (Camera)
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play();
        }

        const sessionPromise = ai.live.connect({
          model: 'gemini-2.5-flash-native-audio-preview-09-2025',
          callbacks: {
            onopen: () => {
              if (!mounted) return;
              setStatus('active');

              // Audio Input Stream Processing
              const source = inputContextRef.current!.createMediaStreamSource(stream);
              const processor = inputContextRef.current!.createScriptProcessor(4096, 1, 1);
              
              processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                const pcmBlob = createBlob(inputData);
                sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
                
                // Visualize volume
                let sum = 0;
                for(let i=0; i<inputData.length; i++) sum += Math.abs(inputData[i]);
                setVolume(Math.min(100, (sum / inputData.length) * 500));
              };

              source.connect(processor);
              processor.connect(inputContextRef.current!.destination);

              // Video Input Frame Processing (1 FPS)
              const interval = setInterval(() => {
                  if (!videoRef.current || !canvasRef.current) return;
                  const ctx = canvasRef.current.getContext('2d');
                  if (!ctx) return;
                  
                  canvasRef.current.width = videoRef.current.videoWidth;
                  canvasRef.current.height = videoRef.current.videoHeight;
                  ctx.drawImage(videoRef.current, 0, 0);
                  
                  const base64 = canvasRef.current.toDataURL('image/jpeg', 0.5).split(',')[1];
                  sessionPromise.then(session => session.sendRealtimeInput({ 
                      media: { mimeType: 'image/jpeg', data: base64 } 
                  }));
              }, 1000);
            },
            onmessage: async (msg: LiveServerMessage) => {
                const audioData = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                if (audioData && outputContextRef.current) {
                    const buffer = await decodeAudio(audioData, outputContextRef.current);
                    const source = outputContextRef.current.createBufferSource();
                    source.buffer = buffer;
                    source.connect(outputContextRef.current.destination);
                    
                    const now = outputContextRef.current.currentTime;
                    const start = Math.max(now, nextStartTimeRef.current);
                    source.start(start);
                    nextStartTimeRef.current = start + buffer.duration;
                }
            },
            onclose: () => setStatus('closed'),
            onerror: (err) => {
                console.error(err);
                setStatus('error');
            }
          },
          config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction: systemInstruction || "You are Elara, a helpful visual assistant.",
          }
        });

        sessionRef.current = sessionPromise;

      } catch (e) {
        console.error("Live Init Failed", e);
        setStatus('error');
      }
    };

    startSession();

    return () => {
        mounted = false;
        sessionRef.current?.then((s: any) => s.close());
        inputContextRef.current?.close();
        outputContextRef.current?.close();
    };
  }, [apiKey, systemInstruction]);

  // Audio Helpers
  const createBlob = (data: Float32Array) => {
      const buffer = new ArrayBuffer(data.length * 2);
      const view = new DataView(buffer);
      for (let i = 0; i < data.length; i++) {
          let s = Math.max(-1, Math.min(1, data[i]));
          view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      }
      return { mimeType: 'audio/pcm;rate=16000', data: btoa(String.fromCharCode(...new Uint8Array(buffer))) };
  };

  const decodeAudio = async (base64: string, ctx: AudioContext) => {
      const bin = atob(base64);
      const arr = new Uint8Array(bin.length);
      for (let i=0; i<bin.length; i++) arr[i] = bin.charCodeAt(i);
      const int16 = new Int16Array(arr.buffer);
      const float32 = new Float32Array(int16.length);
      for(let i=0; i<int16.length; i++) float32[i] = int16[i] / 32768.0;
      
      const buffer = ctx.createBuffer(1, float32.length, 24000);
      buffer.copyToChannel(float32, 0);
      return buffer;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center">
        <canvas ref={canvasRef} className="hidden" />
        
        <div className="relative w-full max-w-lg aspect-video bg-slate-900 rounded-2xl overflow-hidden border border-slate-700 shadow-2xl mb-8">
            <video ref={videoRef} className="w-full h-full object-cover opacity-50" muted />
            <div className="absolute inset-0 flex items-center justify-center">
                <div className={`w-32 h-32 rounded-full blur-xl transition-all duration-100 ${
                    status === 'active' ? 'bg-emerald-500' : 'bg-red-500'
                }`} style={{ opacity: 0.2 + (volume / 200), transform: `scale(${1 + volume/100})` }}></div>
                <div className="absolute text-center">
                    <div className="text-4xl mb-2">{status === 'active' ? '🎙️' : '⌛'}</div>
                    <p className="text-emerald-400 font-mono text-sm tracking-widest uppercase">{status}</p>
                </div>
            </div>
        </div>

        <button onClick={onClose} className="px-8 py-3 bg-red-600 hover:bg-red-500 text-white rounded-full font-bold tracking-wider transition-all shadow-lg shadow-red-500/30">
            END SESSION
        </button>
    </div>
  );
};

export default LiveSession;

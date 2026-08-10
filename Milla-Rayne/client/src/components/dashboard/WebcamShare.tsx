import { useRef, useState, useEffect, useCallback } from 'react';
import {
  Camera,
  X,
  RefreshCw,
  Share2,
  Eye,
  EyeOff,
  Loader2,
} from 'lucide-react';

interface WebcamShareProps {
  onClose?: () => void;
  onShareComplete?: (message: string) => void;
}

export function WebcamShare({ onClose, onShareComplete }: WebcamShareProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [autoShare, setAutoShare] = useState(false);
  const [lastShared, setLastShared] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);

  const startCamera = async () => {
    try {
      setError(null);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setIsLive(true);
    } catch (err) {
      console.error('Error accessing webcam:', err);
      setError('Could not access webcam. Please check permissions.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setIsLive(false);
    setAutoShare(false);
  };

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return null;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8);
  }, []);

  const handleShare = async () => {
    const imageData = captureFrame();
    if (!imageData) return;

    setIsSharing(true);
    try {
      const response = await fetch('/api/vision/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageData,
          message: 'Here is a live look from my webcam.',
          userName: 'Danny Ray',
        }),
      });

      const data = await response.json();
      if (data.success && data.content) {
        setLastShared(new Date().toLocaleTimeString());
        onShareComplete?.(`Vision Analysis: ${data.content}`);
      } else {
        setError(data.error || 'Failed to share frame');
      }
    } catch (err) {
      setError('Error communicating with vision server.');
    } finally {
      setIsSharing(false);
    }
  };

  // Auto-share loop
  useEffect(() => {
    let interval: number | null = null;
    if (autoShare && isLive) {
      interval = window.setInterval(() => {
        handleShare();
      }, 60000); // Auto-share every 60 seconds to conserve quota
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoShare, isLive]);

  return (
    <div className="flex flex-col gap-4 p-4 bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <Camera className="w-5 h-5 text-[#00f2ff]" />
          <h3 className="text-sm font-semibold text-white tracking-wide">
            Webcam Share
          </h3>
          {isLive && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/20 text-[10px] text-red-400 font-bold border border-red-500/30 ml-2 uppercase animate-pulse">
              Live
            </span>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Video Preview */}
      <div className="relative aspect-video bg-zinc-900 rounded-2xl overflow-hidden border border-white/5 shadow-inner">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={`w-full h-full object-cover transition-opacity duration-500 ${isLive ? 'opacity-100' : 'opacity-0'}`}
        />
        {!isLive && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-[#00f2ff] animate-spin" />
            <span className="text-xs text-white/40">
              Initializing optics...
            </span>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center gap-3">
            <EyeOff className="w-10 h-10 text-rose-500/50" />
            <span className="text-sm text-rose-200/70 font-medium">
              {error}
            </span>
            <button
              onClick={startCamera}
              className="mt-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs hover:bg-white/10 transition-colors"
            >
              Retry
            </button>
          </div>
        )}
        {/* Overlays */}
        <div className="absolute top-3 right-3 flex flex-col gap-2">
          <div className="px-2 py-1 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 text-[10px] text-[#00f2ff] font-mono">
            {isLive ? '1280x720@30fps' : 'OFFLINE'}
          </div>
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {/* Controls */}
      <div className="grid grid-cols-2 gap-3 mt-1">
        <button
          onClick={handleShare}
          disabled={!isLive || isSharing}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-semibold transition-all ${
            isLive && !isSharing
              ? 'bg-gradient-to-r from-[#00f2ff] to-[#7c3aed] text-white shadow-glow-sm hover:shadow-glow-md active:scale-95'
              : 'bg-white/5 text-white/20 cursor-not-allowed border border-white/5'
          }`}
        >
          {isSharing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Share2 className="w-4 h-4" />
          )}
          {isSharing ? 'Sharing...' : 'Share Frame'}
        </button>

        <button
          onClick={() => setAutoShare(!autoShare)}
          disabled={!isLive}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-semibold transition-all border ${
            autoShare
              ? 'bg-[#ff00aa]/20 border-[#ff00aa]/40 text-[#ff00aa] shadow-[0_0_15px_rgba(255,0,170,0.2)]'
              : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
          }`}
        >
          {autoShare ? (
            <Eye className="w-4 h-4" />
          ) : (
            <EyeOff className="w-4 h-4" />
          )}
          Live Eye
        </button>
      </div>

      {lastShared && (
        <div className="text-[10px] text-center text-white/30 font-mono italic">
          Last shared: {lastShared}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { UserRound } from 'lucide-react';

interface HologramAvatarProps {
  avatarState?: 'idle' | 'listening' | 'thinking' | 'speaking';
  onInteraction?: (type: string) => void;
  mediaUrl?: string | null;
  mediaType?: 'image' | 'video' | null;
}

export function HologramAvatar({
  avatarState = 'idle',
  onInteraction,
  mediaUrl,
  mediaType,
}: HologramAvatarProps) {
  const [breathScale, setBreathScale] = useState(1);
  const [glowIntensity, setGlowIntensity] = useState(1);
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
  const [videoFailed, setVideoFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const breathInterval = setInterval(() => {
      const time = Date.now() / 1000;
      setBreathScale(1 + Math.sin(time * 0.8) * 0.02);
      setGlowIntensity(0.8 + Math.sin(time * 1.2) * 0.2);
    }, 50);

    return () => clearInterval(breathInterval);
  }, []);

  useEffect(() => {
    setVideoFailed(false);
  }, [mediaType, mediaUrl]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setMousePos({ x, y });
  };

  const getStateStyles = () => {
    switch (avatarState) {
      case 'listening':
        return {
          borderColor: 'border-[#00f2ff]',
          glowColor: 'rgba(0, 242, 255, 0.6)',
          pulseSpeed: '1.5s',
        };
      case 'thinking':
        return {
          borderColor: 'border-[#ff00aa]',
          glowColor: 'rgba(255, 0, 170, 0.6)',
          pulseSpeed: '0.8s',
        };
      case 'speaking':
        return {
          borderColor: 'border-[#7c3aed]',
          glowColor: 'rgba(124, 58, 237, 0.6)',
          pulseSpeed: '0.5s',
        };
      default:
        return {
          borderColor: 'border-white/20',
          glowColor: 'rgba(0, 242, 255, 0.3)',
          pulseSpeed: '3s',
        };
    }
  };

  const stateStyles = getStateStyles();

  return (
    <div
      ref={containerRef}
      className="relative flex items-center justify-center"
      onMouseMove={handleMouseMove}
      onClick={() => onInteraction?.('click')}
    >
      {/* Outer glow rings */}
      <div
        className="absolute w-[400px] h-[400px] rounded-full opacity-30"
        style={{
          background: `radial-gradient(circle, ${stateStyles.glowColor} 0%, transparent 70%)`,
          animation: `pulse ${stateStyles.pulseSpeed} ease-in-out infinite`,
          transform: `scale(${glowIntensity})`,
        }}
      />
      <div
        className="absolute w-[350px] h-[350px] rounded-full opacity-20"
        style={{
          background:
            'radial-gradient(circle, rgba(255, 0, 170, 0.4) 0%, transparent 60%)',
          animation: 'pulse 4s ease-in-out infinite reverse',
        }}
      />

      {/* Holographic prism effect */}
      <div className="absolute w-[320px] h-[320px]">
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(from ${mousePos.x * 360}deg, 
              rgba(0, 242, 255, 0.1), 
              rgba(255, 0, 170, 0.1), 
              rgba(124, 58, 237, 0.1), 
              rgba(0, 242, 255, 0.1))`,
            animation: 'spin 10s linear infinite',
          }}
        />
      </div>

      {/* Avatar container */}
      <div
        className={`relative w-72 h-72 rounded-full overflow-hidden border-2 ${stateStyles.borderColor} transition-all duration-500`}
        style={{
          transform: `scale(${breathScale}) perspective(1000px) rotateX(${(mousePos.y - 0.5) * 5}deg) rotateY(${(mousePos.x - 0.5) * 5}deg)`,
          boxShadow: `
            0 0 30px ${stateStyles.glowColor},
            0 0 60px ${stateStyles.glowColor.replace('0.6', '0.3')},
            inset 0 0 40px rgba(0, 242, 255, 0.1)
          `,
        }}
      >
        {/* Avatar gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0c021a] via-[#1a0033] to-[#0c021a]" />

        {/* Holographic scan lines */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 242, 255, 0.1) 2px, rgba(0, 242, 255, 0.1) 4px)',
            animation: 'scanlines 8s linear infinite',
          }}
        />

        {mediaUrl ? (
          mediaType === 'video' && !videoFailed ? (
            <video
              src={mediaUrl}
              autoPlay
              muted
              playsInline
              preload="metadata"
              poster="/api/assets/contact-icon"
              className="absolute inset-0 h-full w-full object-cover"
              onEnded={(event) => {
                event.currentTarget.pause();
              }}
              onError={() => setVideoFailed(true)}
            />
          ) : (
            <img
              src={mediaType === 'image' ? mediaUrl : '/api/assets/contact-icon'}
              alt="Milla avatar media"
              className="absolute inset-0 h-full w-full object-cover"
            />
          )
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative flex h-40 w-40 items-center justify-center rounded-full border border-white/10 bg-white/5 shadow-[0_0_35px_rgba(0,242,255,0.18)]">
              <UserRound
                className="h-24 w-24 text-[#00f2ff]/50"
                strokeWidth={1.5}
              />
            </div>
          </div>
        )}

        {/* Interactive highlight */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background: `radial-gradient(circle at ${mousePos.x * 100}% ${mousePos.y * 100}%, rgba(255, 255, 255, 0.2) 0%, transparent 50%)`,
          }}
        />
      </div>

      {/* Floating particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(12)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-[#00f2ff]"
            style={{
              left: `${20 + Math.random() * 60}%`,
              top: `${20 + Math.random() * 60}%`,
              opacity: 0.4 + Math.random() * 0.4,
              animation: `float ${3 + Math.random() * 4}s ease-in-out infinite`,
              animationDelay: `${i * 0.3}s`,
            }}
          />
        ))}
      </div>

    </div>
  );
}

export default HologramAvatar;

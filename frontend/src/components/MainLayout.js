import React, { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import Sidebar from './Sidebar';
import ChatInterface from './ChatInterface';
import Avatar3D from './Avatar3D';
import HologramProjector from './HologramProjector';
import YouTubePlayer from './YouTubePlayer';
import { Menu, X } from 'lucide-react';

export default function MainLayout() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [persona, setPersona] = useState(user?.persona || 'Professional');
  const [toolMode, setToolMode] = useState('chat');
  const [holoScene, setHoloScene] = useState(null);
  const [activeVideo, setActiveVideo] = useState(null);

  const bgImages = {
    midnight: 'https://static.prod-images.emergentagent.com/jobs/69fc1105-f452-4afc-b9a3-fc4ed8c1d685/images/ae070e9b5907b6c9590bea83a88ae5683640ab4705844dffa71f560aeb80528f.png',
    serenity: 'https://static.prod-images.emergentagent.com/jobs/69fc1105-f452-4afc-b9a3-fc4ed8c1d685/images/2a597d41f22d009b269fd354ee86e61b72bea943a28d048feefed55764357c5e.png',
    cyberpunk: '',
    aurora: '',
  };

  const handleHologramScene = useCallback((scene) => {
    setHoloScene(scene);
  }, []);

  const handleYouTubeVideo = useCallback((video) => {
    setActiveVideo(video);
  }, []);

  const handleToolModeChange = useCallback((mode) => {
    setToolMode(mode);
    if (mode !== 'holo') {
      setHoloScene(null);
    }
  }, []);

  return (
    <div data-testid="main-layout" style={{ height: '100vh', width: '100%', display: 'flex', overflow: 'hidden', position: 'relative' }}>
      {/* Background */}
      {bgImages[theme] && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0,
          backgroundImage: `url(${bgImages[theme]})`,
          backgroundSize: 'cover', backgroundPosition: 'center',
          opacity: 0.3, transition: 'opacity 0.5s ease',
        }} />
      )}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, background: `${theme === 'serenity' ? 'rgba(245,245,240,0.85)' : 'rgba(11,16,33,0.85)'}` }} />

      {/* Mobile menu toggle */}
      <button data-testid="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)} style={{
        position: 'fixed', top: 16, left: 16, zIndex: 60,
        width: 40, height: 40, borderRadius: 10,
        background: 'var(--glass)', backdropFilter: 'blur(12px)',
        border: '1px solid var(--glass-border)',
        color: 'var(--fg)', display: 'none', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
      }}>
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>
      <style>{'@media (max-width: 1023px) { [data-testid="sidebar-toggle"] { display: flex !important; } }'}</style>

      {/* Sidebar */}
      <div style={{
        position: sidebarOpen ? 'fixed' : 'relative',
        inset: sidebarOpen ? 0 : 'auto',
        zIndex: 50,
        width: sidebarOpen ? '100%' : 380,
        flexShrink: 0,
        display: sidebarOpen ? 'block' : 'none',
      }} className="sidebar-wrapper">
        <Sidebar persona={persona} setPersona={setPersona} onClose={() => setSidebarOpen(false)} />
      </div>
      <style>{'@media (min-width: 1024px) { .sidebar-wrapper { display: block !important; position: relative !important; width: 380px !important; } }'}</style>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1, minWidth: 0 }}>
        {/* 3D Avatar / Hologram region */}
        <div data-testid="avatar-region" style={{
          height: toolMode === 'holo' && holoScene ? '40%' : '28%',
          minHeight: toolMode === 'holo' && holoScene ? 240 : 160,
          maxHeight: toolMode === 'holo' && holoScene ? 420 : 300,
          width: '100%', position: 'relative', flexShrink: 0,
          transition: 'all 0.5s ease',
        }}>
          {toolMode === 'holo' && holoScene ? (
            <HologramProjector scene={holoScene} />
          ) : (
            <Avatar3D isSpeaking={isSpeaking} />
          )}
        </div>

        {/* Chat interface */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <ChatInterface
            persona={persona}
            onSpeakingChange={setIsSpeaking}
            onHologramScene={handleHologramScene}
            onYouTubeVideo={handleYouTubeVideo}
            toolMode={toolMode}
            setToolMode={handleToolModeChange}
          />
        </div>
      </div>

      {/* YouTube PiP Player */}
      <YouTubePlayer video={activeVideo} onClose={() => setActiveVideo(null)} />
    </div>
  );
}

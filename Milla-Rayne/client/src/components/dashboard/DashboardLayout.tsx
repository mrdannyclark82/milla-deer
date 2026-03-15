import { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import { DashboardSidebar } from './DashboardSidebar';
import { HologramAvatar } from './HologramAvatar';
import { ModelSelector, type AIModel } from './ModelSelector';
import { VideoAnalysisPanel } from './VideoAnalysisPanel';
import { ScoreSettings } from './ScoreSettings';
import { ChatThreadPanel } from './ChatThreadPanel';
import { Sandbox } from '@/components/Sandbox';
import { KnowledgeBaseSearch } from '@/components/KnowledgeBaseSearch';
import { DailyNewsDigest } from '@/components/DailyNewsDigest';
import { GmailTasksView } from '@/components/GmailTasksView';
import { DatabaseView } from '@/components/DatabaseView';
import AIModelSelector from '@/components/AIModelSelector';
import { YoutubePlayerCyberpunk } from '@/components/YoutubePlayerCyberpunk';
import { CreativeStudio } from '@/components/CreativeStudio';
import type { DailyNewsDigest as DailyNewsDigestType } from '@/types/millalyzer';

export function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [activeSection, setActiveSection] = useState('hub');
  const [developerMode, setDeveloperMode] = useState(false);
  const [showSettings, setShowSettings] = useState(true);
  const [showVideoPanel, setShowVideoPanel] = useState(true);
  const [activityLog, setActivityLog] = useState<string[]>([
    `${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · Session initialized`,
  ]);
  const [selectedModel, setSelectedModel] = useState<AIModel | null>(null);
  const [recentAnalyses, setRecentAnalyses] = useState<string[]>([]);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [avatarMedia, setAvatarMedia] = useState<{
    url: string;
    type: 'image' | 'video';
  } | null>(null);
  const [youtubeVideos, setYoutubeVideos] = useState<
    Array<{ id: string; title: string; channel: string; thumbnail?: string }>
  >([]);
  const [scoreSettings, setScoreSettings] = useState({
    ambientLight: 65,
    amplitude: 50,
    status: 80,
    volume: 70,
  });

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const fetchConnectionState = async () => {
      try {
        const response = await fetch('/api/oauth/authenticated');
        if (!response.ok) return;
        const data = await response.json();
        setIsGoogleConnected(Boolean(data.isAuthenticated ?? data.authenticated));
      } catch (error) {
        console.error('Failed to check Google connection state:', error);
      }
    };

    fetchConnectionState();
  }, []);

  const timestamped = (message: string) =>
    `${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${message}`;

  const logActivity = (entry: string) => {
    setActivityLog((prev) => [timestamped(entry), ...prev].slice(0, 8));
  };

  const handleAnalyzeComplete = (label: string) => {
    logActivity(`Video analyzed: ${label}`);
    setRecentAnalyses((prev) => [label, ...prev].slice(0, 5));
  };

  const handlePlayVideo = (videoId: string) => {
    setActiveVideoId(videoId);
    setShowVideoPanel(true);
    logActivity(`Opened YouTube player for ${videoId}`);
  };

  const handleScoreChange = (next: typeof scoreSettings) => {
    setScoreSettings(next);
    logActivity('Score settings adjusted');
  };

  const handleModelChange = (model: AIModel) => {
    setSelectedModel(model);
    logActivity(`Model selected: ${model.name}`);
  };

  const sectionLabels: Record<string, string> = {
    hub: 'Milla Hub',
    knowledge: 'Knowledge Base',
    news: 'Daily News Digest',
    gmail: 'Gmail & Tasks',
    studio: 'Studio',
    database: 'Data Storage',
    models: 'AI Models',
    settings: 'Settings',
    ide: 'IDE Sandbox',
  };

  const emptyDigest: DailyNewsDigestType = {
    date: new Date().toLocaleDateString(),
    totalVideos: 0,
    analysisCount: 0,
    categories: {},
    topStories: [],
  };

  return (
    <div className="min-h-screen bg-[#0c021a] text-white font-sans overflow-hidden">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,242,255,0.08),transparent_35%),radial-gradient(circle_at_80%_10%,rgba(255,0,170,0.08),transparent_30%),radial-gradient(circle_at_50%_70%,rgba(124,58,237,0.12),transparent_40%)]" />
        <div className="absolute inset-0 opacity-40 bg-[linear-gradient(120deg,rgba(255,255,255,0.04)_0%,rgba(255,255,255,0)_35%,rgba(255,255,255,0)_65%,rgba(255,255,255,0.08)_100%)] animate-pulse" />
        <div className="absolute inset-0 bg-[length:120px_120px] bg-cyber-grid opacity-20 mix-blend-screen" />
      </div>

      {/* Floating particles */}
      <div className="pointer-events-none fixed inset-0">
        {Array.from({ length: 24 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-[#00f2ff] opacity-60"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationName: 'float',
              animationDuration: `${6 + Math.random() * 6}s`,
              animationDelay: `${Math.random() * 3}s`,
              animationTimingFunction: 'ease-in-out',
              animationIterationCount: 'infinite',
            }}
          />
        ))}
      </div>

      {/* Mobile hamburger */}
      {isMobile && (
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="fixed top-4 left-4 z-50 p-2 rounded-lg bg-white/10 backdrop-blur-lg border border-white/10 hover:bg-white/20 transition-all duration-300 shadow-glow-sm"
        >
          {sidebarOpen ? (
            <X className="w-6 h-6" />
          ) : (
            <Menu className="w-6 h-6" />
          )}
        </button>
      )}

      {/* Sidebar */}
      <DashboardSidebar
        isOpen={sidebarOpen}
        isMobile={isMobile}
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        onClose={() => setSidebarOpen(false)}
        developerMode={developerMode}
        onDeveloperModeChange={setDeveloperMode}
      />

      {/* Main content */}
      <main
        className={`relative z-10 transition-all duration-300 ${
          sidebarOpen && !isMobile ? 'lg:ml-72 xl:ml-72 ml-64' : 'ml-0'
        } min-h-screen flex flex-col`}
      >
        <header className="flex justify-end px-6 pt-6">
          <ModelSelector
            value={selectedModel ?? undefined}
            onChange={handleModelChange}
          />
        </header>

        {/* Content */}
        <div className="flex-1 w-full px-6 pb-12 pt-6">
          <div
            className={`grid gap-6 ${
              activeSection === 'studio' ? 'xl:grid-cols-1' : 'xl:grid-cols-[2fr_1fr]'
            }`}
          >
            <div className="space-y-6">
              {/* Hero / hologram */}
              <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_25px_120px_rgba(0,0,0,0.45)]">
                <div className="absolute inset-0 bg-gradient-to-br from-[#00f2ff]/10 via-transparent to-[#ff00aa]/10" />
                <div className="absolute -left-20 top-10 h-40 w-40 rounded-full bg-[#00f2ff]/20 blur-3xl" />
                <div className="absolute -right-16 bottom-6 h-48 w-48 rounded-full bg-[#ff00aa]/15 blur-3xl" />
                <div className="relative z-10 px-6 py-6 lg:px-10 lg:py-8">
                  <div className="flex justify-end">
                    <div
                      className={`h-3 w-3 rounded-full transition-all ${
                        isGoogleConnected
                          ? 'bg-[#00f2ff] shadow-[0_0_18px_rgba(0,242,255,0.95)] animate-pulse'
                          : 'bg-white/20 shadow-none'
                      }`}
                      aria-label={
                        isGoogleConnected
                          ? 'Gmail and Tasks connected'
                          : 'Gmail and Tasks disconnected'
                      }
                      title={
                        isGoogleConnected
                          ? 'Gmail and Tasks connected'
                          : 'Gmail and Tasks disconnected'
                      }
                    />
                  </div>

                  <div className="flex items-center justify-center py-2">
                    <HologramAvatar
                      mediaUrl={avatarMedia?.url}
                      mediaType={avatarMedia?.type}
                    />
                  </div>
                </div>
              </section>

              {activeSection === 'hub' ? (
                <>
                  <ChatThreadPanel
                    onPlayVideo={(videoId) => {
                      handlePlayVideo(videoId);
                      handleAnalyzeComplete(`YouTube Video ${videoId}`);
                    }}
                  />
                </>
              ) : activeSection === 'studio' ? (
                <CreativeStudio
                  isOpen={true}
                  embedded={true}
                  onClose={() => setActiveSection('hub')}
                  onApplyToAvatar={(media) => {
                    setAvatarMedia({ url: media.url, type: media.type });
                    logActivity(`Studio applied ${media.model} image to avatar`);
                    setActiveSection('hub');
                  }}
                />
              ) : activeSection === 'ide' ? (
                <div className="h-[600px] relative">
                  <Sandbox
                    isOpen={true}
                    onClose={() => setActiveSection('hub')}
                    embedded={true}
                  />
                </div>
              ) : activeSection === 'knowledge' ? (
                <KnowledgeBaseSearch
                  className="min-h-[500px]"
                  onClose={() => setActiveSection('hub')}
                />
              ) : activeSection === 'news' ? (
                <DailyNewsDigest
                  digest={emptyDigest}
                  className="min-h-[500px]"
                />
              ) : activeSection === 'gmail' ? (
                <GmailTasksView />
              ) : activeSection === 'database' ? (
                <DatabaseView />
              ) : activeSection === 'models' ? (
                <div className="flex justify-center p-10">
                  <div className="w-full max-w-2xl">
                    <AIModelSelector
                      currentModel={selectedModel?.id as any}
                      onModelChange={(id) => {
                        // The selector updates the backend, we just need to reflect it locally if needed
                        // But the header selector might be independent state.
                        // Ideally they sync via the parent or context.
                        // For now, let's just let it be.
                      }}
                    />
                  </div>
                </div>
              ) : activeSection === 'settings' ? (
                <div className="bg-[#0c021a]/90 border border-white/10 rounded-2xl p-6">
                  <h3 className="text-xl font-semibold text-white mb-6">
                    System Settings
                  </h3>
                  <div className="grid gap-8 md:grid-cols-2">
                    <ScoreSettings
                      values={scoreSettings}
                      onChange={handleScoreChange}
                      onClose={() => {}}
                    />
                    {/* Add more settings components here if available */}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-10 text-center min-h-[400px]">
                  <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                    <Sparkles className="w-8 h-8 text-white/20" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">
                    {sectionLabels[activeSection]}
                  </h3>
                  <p className="text-white/50 max-w-md">
                    This module is currently being initialized. Please check
                    back shortly or return to Milla Hub.
                  </p>
                  <button
                    onClick={() => setActiveSection('hub')}
                    className="mt-6 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-medium transition-colors"
                  >
                    Return to Hub
                  </button>
                </div>
              )}
            </div>

            {/* Right rail */}
            {activeSection !== 'studio' && <div className="space-y-4">
              {showSettings && (
                <ScoreSettings
                  values={scoreSettings}
                  onChange={handleScoreChange}
                  onClose={() => setShowSettings(false)}
                />
              )}
              {showVideoPanel && (
                <VideoAnalysisPanel
                  recentItems={recentAnalyses}
                  onAnalyzeComplete={handleAnalyzeComplete}
                  onClose={() => setShowVideoPanel(false)}
                  activeVideoId={activeVideoId}
                  onPlayVideo={handlePlayVideo}
                  onSearchResults={setYoutubeVideos}
                />
              )}

              <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4">
                <div className="flex items-center justify-between text-sm font-medium">
                  <span className="text-white/80">Quick Toggles</span>
                  <button
                    onClick={() => {
                      const next = !(showSettings && showVideoPanel);
                      setShowSettings(next);
                      setShowVideoPanel(next);
                    }}
                    className="text-[11px] rounded-full bg-white/5 px-3 py-1 border border-white/10 hover:border-white/30 transition-all"
                  >
                    {showSettings && showVideoPanel
                      ? 'Hide panels'
                      : 'Show panels'}
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-white/60">
                  <button
                    onClick={() => setShowSettings(!showSettings)}
                    className={`rounded-xl border px-3 py-2 text-left transition-all ${
                      showSettings
                        ? 'border-[#00f2ff]/40 bg-[#00f2ff]/10 text-[#00f2ff]'
                        : 'border-white/10 bg-white/5 hover:border-white/20'
                    }`}
                  >
                    Score Settings
                  </button>
                  <button
                    onClick={() => setShowVideoPanel(!showVideoPanel)}
                    className={`rounded-xl border px-3 py-2 text-left transition-all ${
                      showVideoPanel
                        ? 'border-[#ff00aa]/40 bg-[#ff00aa]/10 text-[#ff00aa]'
                        : 'border-white/10 bg-white/5 hover:border-white/20'
                    }`}
                  >
                    Video Analysis
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4">
                <div className="flex items-center justify-between text-sm font-medium text-white/80">
                  <span>Activity</span>
                  <span className="text-[11px] text-white/40">
                    {activityLog.length} events
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {activityLog.map((item, i) => (
                    <div
                      key={`${item}-${i}`}
                      className="rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-xs text-white/70"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>}
          </div>
        </div>
      </main>

      {(activeVideoId || youtubeVideos.length > 0) && (
        <YoutubePlayerCyberpunk
          videoId={activeVideoId || undefined}
          videos={youtubeVideos}
          onClose={() => {
            setActiveVideoId(null);
            setYoutubeVideos([]);
          }}
          onSelectVideo={handlePlayVideo}
          onAnalyzeVideo={(videoId) => {
            setShowVideoPanel(true);
            handleAnalyzeComplete(`YouTube Video ${videoId}`);
          }}
        />
      )}

      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}

export default DashboardLayout;

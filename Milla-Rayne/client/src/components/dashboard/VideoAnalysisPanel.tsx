import { useRef, useState, type DragEvent } from 'react';
import { X, Play, Link, Youtube, Upload, Loader2, Search } from 'lucide-react';

interface SearchResultVideo {
  id: string;
  title: string;
  channel: string;
  thumbnail?: string;
}

interface VideoAnalysisPanelProps {
  onClose: () => void;
  recentItems?: string[];
  onAnalyzeComplete?: (label: string) => void;
  activeVideoId?: string | null;
  onPlayVideo?: (videoId: string) => void;
  onSearchResults?: (videos: SearchResultVideo[]) => void;
}

export function VideoAnalysisPanel({
  onClose,
  recentItems = [],
  onAnalyzeComplete,
  activeVideoId,
  onPlayVideo,
  onSearchResults,
}: VideoAnalysisPanelProps) {
  const [videoUrl, setVideoUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultVideo[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'url' | 'upload'>('url');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // If we have an active video ID, switch to player view automatically or show it above
  // For now, let's render the player prominently if activeVideoId exists.

  const handleAnalyze = async () => {
    if (!videoUrl.trim()) return;
    setIsAnalyzing(true);
    try {
      const response = await fetch('/api/analyze-youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: videoUrl.trim() }),
      });
      const data = await response.json();
      if (data.success) {
        onAnalyzeComplete?.(data.analysis?.videoInfo?.title || videoUrl.trim());
        setVideoUrl('');
      } else {
        console.error('Analysis failed:', data.error);
      }
    } catch (e) {
      console.error('Analysis error:', e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileSelect = async (file?: File) => {
    if (!file) return;
    setIsAnalyzing(true);
    try {
      const response = await fetch('/api/analyze-video', {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      const data = await response.json();
      if (data.insights) {
        onAnalyzeComplete?.(file.name);
      }
    } catch (e) {
      console.error('File analysis error:', e);
    } finally {
      setIsAnalyzing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    handleFileSelect(e.dataTransfer.files?.[0]);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchError(null);

    try {
      const response = await fetch(
        `/api/youtube/search?query=${encodeURIComponent(searchQuery.trim())}&maxResults=8`
      );
      const data = await response.json();

      if (!response.ok || !data.success) {
        setSearchResults([]);
        setSearchError(data.message || data.error || 'Search failed');
        return;
      }

      const videos: SearchResultVideo[] = (data.data || [])
        .map((item: any) => ({
          id: item.id?.videoId || item.id,
          title: item.snippet?.title || 'Untitled video',
          channel: item.snippet?.channelTitle || 'Unknown channel',
          thumbnail:
            item.snippet?.thumbnails?.medium?.url ||
            item.snippet?.thumbnails?.default?.url,
        }))
        .filter((item: SearchResultVideo) => item.id);

      setSearchResults(videos);
      onSearchResults?.(videos);
      if (videos[0]) {
        onPlayVideo?.(videos[0].id);
      }
    } catch (error) {
      setSearchResults([]);
      setSearchError(
        error instanceof Error ? error.message : 'Search request failed'
      );
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="dashboard-card dashboard-card-pink rounded-3xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Youtube className="w-4 h-4 text-[#ff00aa]" />
          <h3 className="text-sm font-medium text-white">Video Analysis</h3>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-xl flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all border border-white/10"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/5">
        <button
          onClick={() => setActiveTab('url')}
          className={`flex-1 px-4 py-2.5 text-xs font-medium transition-all ${
            activeTab === 'url'
              ? 'text-[#00f2ff] border-b-2 border-[#00f2ff] bg-[#00f2ff]/5'
              : 'text-white/50 hover:text-white/80'
          }`}
        >
          <Link className="w-3.5 h-3.5 inline-block mr-1.5" />
          URL
        </button>
        <button
          onClick={() => setActiveTab('upload')}
          className={`flex-1 px-4 py-2.5 text-xs font-medium transition-all ${
            activeTab === 'upload'
              ? 'text-[#00f2ff] border-b-2 border-[#00f2ff] bg-[#00f2ff]/5'
              : 'text-white/50 hover:text-white/80'
          }`}
        >
          <Upload className="w-3.5 h-3.5 inline-block mr-1.5" />
          Upload
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        {activeVideoId && (
          <div className="mb-4 rounded-xl overflow-hidden shadow-lg border border-white/10 aspect-video">
            <iframe
              width="100%"
              height="100%"
              src={`https://www.youtube.com/embed/${activeVideoId}?autoplay=1&mute=1&modestbranding=1&rel=0&origin=${window.location.origin}`}
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}

        {activeTab === 'url' ? (
          <div className="space-y-4">
            <div className="relative">
              <input
                type="text"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="Paste YouTube or video URL..."
                className="w-full px-4 py-2.5 pl-10 bg-white/5 border border-white/10 rounded-xl text-sm placeholder:text-white/30 focus:outline-none focus:border-[#00f2ff]/50 focus:bg-white/10 transition-all"
              />
              <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            </div>

            <button
              onClick={handleAnalyze}
              disabled={!videoUrl.trim() || isAnalyzing}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                videoUrl.trim() && !isAnalyzing
                  ? 'bg-gradient-to-r from-[#00f2ff] to-[#ff00aa] text-white shadow-[0_0_20px_rgba(0,242,255,0.3)] hover:shadow-[0_0_30px_rgba(0,242,255,0.5)]'
                  : 'bg-white/10 text-white/30 cursor-not-allowed'
              }`}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Analyze Video
                </>
              )}
            </button>

            <div className="h-px bg-white/10" />

            <div className="space-y-3">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSearch();
                    }
                  }}
                  placeholder="Search YouTube videos..."
                  className="w-full px-4 py-2.5 pl-10 bg-white/5 border border-white/10 rounded-xl text-sm placeholder:text-white/30 focus:outline-none focus:border-[#ff00aa]/50 focus:bg-white/10 transition-all"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              </div>

              <button
                onClick={handleSearch}
                disabled={!searchQuery.trim() || isSearching}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  searchQuery.trim() && !isSearching
                    ? 'bg-white/10 text-white hover:bg-white/15 border border-white/10'
                    : 'bg-white/10 text-white/30 cursor-not-allowed'
                }`}
              >
                {isSearching ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    Search YouTube
                  </>
                )}
              </button>

              {searchError && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                  {searchError}
                </div>
              )}

              {searchResults.length > 0 && (
                <div className="space-y-2 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-2">
                  {searchResults.map((video) => (
                    <button
                      key={video.id}
                      onClick={() => onPlayVideo?.(video.id)}
                      className="w-full rounded-lg border border-white/5 bg-white/5 p-2 text-left hover:bg-white/10 transition-all"
                    >
                      <div className="flex gap-3">
                        {video.thumbnail && (
                          <img
                            src={video.thumbnail}
                            alt={video.title}
                            className="h-16 w-24 rounded object-cover"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-white line-clamp-2">
                            {video.title}
                          </div>
                          <div className="mt-1 text-xs text-white/50 truncate">
                            {video.channel}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div
            className="border-2 border-dashed border-white/10 rounded-xl p-8 text-center hover:border-[#00f2ff]/30 hover:bg-[#00f2ff]/5 transition-all cursor-pointer"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-8 h-8 text-white/30 mx-auto mb-2" />
            <p className="text-sm text-white/50">Drop video file here</p>
            <p className="text-xs text-white/30 mt-1">or click to browse</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files?.[0])}
            />
          </div>
        )}
      </div>

      {/* Recent analyses */}
      <div className="px-4 py-3 border-t border-white/5">
        <div className="text-xs text-white/40 mb-2">Recent</div>
        <div className="space-y-1">
          {recentItems.length === 0 ? (
            <div className="text-xs text-white/30 px-2 py-1.5">
              No analyses yet
            </div>
          ) : (
            recentItems.map((item, i) => (
              <div
                key={`${item}-${i}`}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer transition-all"
              >
                <Play className="w-3 h-3 text-white/30" />
                <span className="text-xs text-white/60 truncate">{item}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default VideoAnalysisPanel;

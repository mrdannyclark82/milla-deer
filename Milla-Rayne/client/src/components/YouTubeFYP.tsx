import React, { useEffect, useState, useCallback } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Play,
  Sparkles,
  TrendingUp,
  RefreshCw,
  ExternalLink,
  Tv,
} from 'lucide-react';

interface FYPVideo {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
  description: string;
  publishedAt: string;
  viewCount?: number;
  source: string;
}

interface YouTubeFYPProps {
  onPlayVideo?: (videoId: string) => void;
  onAnalyzeVideo?: (videoId: string) => void;
  className?: string;
}

function formatViews(count?: number): string {
  if (!count) return '';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M views`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(0)}K views`;
  return `${count} views`;
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function VideoCard({
  video,
  onPlay,
  onAnalyze,
}: {
  video: FYPVideo;
  onPlay: (id: string) => void;
  onAnalyze: (id: string) => void;
}) {
  const [imgError, setImgError] = useState(false);
  const isTrending = video.source === 'trending';

  return (
    <div className="group relative flex flex-col bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 hover:border-purple-500/30 transition-all duration-200 overflow-hidden cursor-pointer">
      {/* Thumbnail */}
      <div
        className="relative aspect-video bg-black/40 overflow-hidden"
        onClick={() => onPlay(video.id)}
      >
        {!imgError ? (
          <img
            src={video.thumbnail}
            alt={video.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-black/60">
            <Play className="w-10 h-10 text-white/30" />
          </div>
        )}

        {/* Hover play overlay */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="bg-red-600 rounded-full p-3">
            <Play className="w-5 h-5 text-white fill-white" />
          </div>
        </div>

        {isTrending && (
          <div className="absolute top-2 left-2">
            <Badge className="bg-orange-500/80 text-white border-0 text-xs gap-1">
              <TrendingUp className="w-3 h-3" /> Trending
            </Badge>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-1 flex-1">
        <p
          className="text-sm font-medium text-white/90 line-clamp-2 leading-snug group-hover:text-white transition-colors"
          onClick={() => onPlay(video.id)}
        >
          {video.title}
        </p>
        <p className="text-xs text-white/50">{video.channel}</p>
        <div className="flex items-center gap-2 text-xs text-white/40 mt-auto pt-1">
          {video.viewCount && <span>{formatViews(video.viewCount)}</span>}
          {video.publishedAt && <span>{timeAgo(video.publishedAt)}</span>}
          {!isTrending && (
            <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 border text-xs ml-auto">
              {video.source}
            </Badge>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-white/70 hover:text-white hover:bg-white/10 flex-1"
            onClick={() => onPlay(video.id)}
          >
            <Play className="w-3 h-3 mr-1" /> Play
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-purple-300 hover:text-purple-200 hover:bg-purple-500/10 flex-1"
            onClick={() => onAnalyze(video.id)}
          >
            <Sparkles className="w-3 h-3 mr-1" /> Analyze
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-white/50 hover:text-white hover:bg-white/10"
            onClick={() => window.open(`https://youtube.com/watch?v=${video.id}`, '_blank')}
          >
            <ExternalLink className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function YouTubeFYP({ onPlayVideo, onAnalyzeVideo, className = '' }: YouTubeFYPProps) {
  const [feed, setFeed] = useState<FYPVideo[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/youtube/fyp');
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      if (data.success) {
        setFeed(data.feed || []);
        setTopics(data.predictedTopics || []);
      } else {
        setError(data.message || 'Failed to load feed');
      }
    } catch (e) {
      setError('Could not load your feed. Make sure Google is connected.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  const handlePlay = (videoId: string) => {
    onPlayVideo?.(videoId);
  };

  const handleAnalyze = (videoId: string) => {
    onAnalyzeVideo?.(videoId);
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Tv className="w-5 h-5 text-red-400" />
          <span className="font-semibold text-white">For You</span>
          {topics.length > 0 && (
            <div className="flex gap-1 ml-2">
              {topics.map((t) => (
                <Badge
                  key={t}
                  className="bg-purple-500/20 text-purple-300 border-purple-500/30 border text-xs"
                >
                  {t}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={fetchFeed}
          disabled={loading}
          className="h-8 w-8 p-0 text-white/60 hover:text-white hover:bg-white/10"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {loading && (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-xl bg-white/5 border border-white/10 overflow-hidden animate-pulse">
                  <div className="aspect-video bg-white/10" />
                  <div className="p-3 space-y-2">
                    <div className="h-3 bg-white/10 rounded w-full" />
                    <div className="h-3 bg-white/10 rounded w-2/3" />
                    <div className="h-2 bg-white/5 rounded w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <Tv className="w-10 h-10 text-white/20" />
              <p className="text-white/50 text-sm">{error}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={fetchFeed}
                className="border-white/20 text-white/70 hover:bg-white/10"
              >
                Try Again
              </Button>
            </div>
          )}

          {!loading && !error && feed.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <Tv className="w-10 h-10 text-white/20" />
              <p className="text-white/50 text-sm">No videos yet. Watch some content to train your feed.</p>
            </div>
          )}

          {!loading && !error && feed.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {feed.map((video) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  onPlay={handlePlay}
                  onAnalyze={handleAnalyze}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

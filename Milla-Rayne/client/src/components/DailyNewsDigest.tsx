import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Newspaper,
  ChevronDown,
  ChevronUp,
  Play,
  TrendingUp,
  GitBranch,
  Music4,
  MonitorPlay,
  Cpu,
  Inbox,
  CalendarDays,
  Mail,
  Clock3,
} from 'lucide-react';
import type { DailyNewsDigest, NewsItem } from '@/types/millalyzer';

interface DailyNewsDigestProps {
  digest: DailyNewsDigest;
  onAnalyzeVideo?: (videoId: string) => void;
  onWatchVideo?: (videoId: string) => void;
  className?: string;
}

class DailyNewsDigestErrorBoundary extends React.Component<
  { children: React.ReactNode; className?: string },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('DailyNewsDigest render failed:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card className={`dashboard-card ${this.props.className || ''}`}>
          <CardHeader>
            <CardTitle className="text-white">Daily Video Digest</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="dashboard-card-inner p-4 text-sm text-white/70">
              The news panel hit a rendering error. Refresh the dashboard to retry.
            </div>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}

/**
 * DailyNewsDigest - Display daily tech news from YouTube
 *
 * Features:
 * - Categorized news items
 * - Top stories section
 * - Quick actions (analyze, watch)
 * - Collapsible categories
 */
export function DailyNewsDigest({
  digest,
  onAnalyzeVideo,
  onWatchVideo,
  className = '',
}: DailyNewsDigestProps) {
  return (
    <DailyNewsDigestErrorBoundary className={className}>
      <DailyNewsDigestPanel
        digest={digest}
        onAnalyzeVideo={onAnalyzeVideo}
        onWatchVideo={onWatchVideo}
        className={className}
      />
    </DailyNewsDigestErrorBoundary>
  );
}

function DailyNewsDigestPanel({
  digest,
  onAnalyzeVideo,
  onWatchVideo,
  className = '',
}: DailyNewsDigestProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set()
  );

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const getCategoryIcon = (category: string) => {
    const icons: Record<string, React.ReactNode> = {
      AI: <Cpu className="w-4 h-4" />,
      Tech: <MonitorPlay className="w-4 h-4" />,
      GitHub: <GitBranch className="w-4 h-4" />,
      Music: <Music4 className="w-4 h-4" />,
      Other: <Play className="w-4 h-4" />,
    };
    return icons[category] || <Newspaper className="w-4 h-4" />;
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      AI: 'border-violet-400/30',
      Tech: 'border-cyan-400/30',
      GitHub: 'border-emerald-400/30',
      Music: 'border-pink-400/30',
      Other: 'border-white/20',
    };
    return colors[category] || 'border-white/10';
  };

  const categoryAliases: Record<string, string> = {
    'AI & Machine Learning': 'AI',
    'Web Development': 'Tech',
    'DevOps & Cloud': 'Tech',
    'Programming Languages': 'GitHub',
    'Data Science': 'AI',
    'Security & Privacy': 'Tech',
    'Tech Industry': 'Tech',
    'Personalized Picks': 'Other',
  };

  const normalizedCategories = Object.entries(digest.categories).reduce<
    Record<string, NewsItem[]>
  >((acc, [category, items]) => {
    const key = categoryAliases[category] || category;
    acc[key] = [...(acc[key] || []), ...items.map((item) => ({ ...item, category: key }))];
    return acc;
  }, {});

  const orderedCategories = ['AI', 'Tech', 'GitHub', 'Music', 'Other']
    .filter((category) => normalizedCategories[category]?.length)
    .map((category) => [category, normalizedCategories[category]] as const);

  return (
    <Card className={`dashboard-card ${className}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Newspaper className="w-5 h-5 text-blue-400" />
            <CardTitle className="text-xl text-white">
              Daily Video Digest
            </CardTitle>
          </div>
          <Badge variant="outline" className="border-blue-500/30 text-blue-300">
            {digest.date}
          </Badge>
        </div>
        <p className="text-sm text-white/60 mt-2">
          Found {digest.totalVideos} suggested videos across{' '}
          {orderedCategories.length} categories
          {digest.analysisCount > 0 && (
            <span className="text-purple-300">
              {' '}
              • {digest.analysisCount} auto-analyzed
            </span>
          )}
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {digest.inboxSummary && (
          <div className="dashboard-card-inner space-y-3 border-cyan-500/20 p-4">
            <h3 className="text-sm font-semibold text-white/80 flex items-center gap-2">
              <Inbox className="w-4 h-4 text-cyan-300" />
              Inbox Snapshot
            </h3>
            <p className="text-xs text-white/55">
              {digest.inboxSummary.unreadCount} unread across the latest{' '}
              {digest.inboxSummary.emails.length} emails.
            </p>
            <div className="space-y-2">
              {digest.inboxSummary.emails.slice(0, 5).map((email) => (
                <div
                  key={email.id}
                  className="dashboard-card-inner p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Mail className="w-3.5 h-3.5 text-cyan-300 flex-shrink-0" />
                      <span className="text-xs font-medium text-white truncate">
                        {email.from}
                      </span>
                    </div>
                    <span className="text-[11px] text-white/40 flex-shrink-0">
                      {email.date}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-white">{email.subject}</div>
                  <div className="mt-1 text-xs text-white/50 line-clamp-2">
                    {email.preview}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {digest.personalization && digest.personalization.focusAreas.length > 0 && (
          <div className="dashboard-card-inner space-y-3 border-violet-500/20 p-4">
            <h3 className="text-sm font-semibold text-white/80 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-violet-300" />
              Personalized focus
            </h3>
            <div className="flex flex-wrap gap-2">
              {digest.personalization.focusAreas.map((focusArea) => (
                <Badge
                  key={focusArea}
                  variant="outline"
                  className="border-violet-400/30 text-violet-200"
                >
                  {focusArea}
                </Badge>
              ))}
            </div>
            <div className="space-y-2 text-xs text-white/55">
              {digest.personalization.reasons.map((reason) => (
                <p key={reason}>{reason}</p>
              ))}
            </div>
          </div>
        )}

        {digest.dailySchedule && (
          <div className="dashboard-card-inner space-y-3 border-emerald-500/20 p-4">
            <h3 className="text-sm font-semibold text-white/80 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-emerald-300" />
              Daily Schedule
            </h3>
            <p className="text-xs text-white/55">
              {digest.dailySchedule.count} event
              {digest.dailySchedule.count === 1 ? '' : 's'} on today&apos;s
              calendar.
            </p>
            <div className="space-y-2">
              {digest.dailySchedule.events.length > 0 ? (
                digest.dailySchedule.events.slice(0, 5).map((event) => (
                  <div
                    key={event.id}
                    className="dashboard-card-inner p-3"
                  >
                    <div className="text-sm font-medium text-white">
                      {event.summary}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-white/50">
                      <Clock3 className="w-3.5 h-3.5 text-emerald-300" />
                      <span>{new Date(event.start).toLocaleString()}</span>
                    </div>
                    {event.location && (
                      <div className="mt-1 text-xs text-white/45">
                        {event.location}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="dashboard-card-inner p-3 text-xs text-white/50">
                  No events scheduled for today.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Top Stories */}
        {digest.topStories.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-white/80 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-orange-400" />
              Top Stories
            </h3>
            <div className="space-y-2">
              {digest.topStories.slice(0, 5).map((story, index) => (
                <NewsItemCard
                  key={story.videoId}
                  item={story}
                  index={index}
                  onAnalyze={onAnalyzeVideo}
                  onWatch={onWatchVideo}
                  isTopStory
                />
              ))}
            </div>
          </div>
        )}

        {digest.topStories.length === 0 && orderedCategories.length === 0 && (
          <div className="dashboard-card-inner border-white/10 p-4 text-sm text-white/65">
            No video stories loaded yet. The digest is still showing your inbox and calendar,
            and it will populate videos as soon as YouTube search returns results again.
          </div>
        )}

        <Separator className="bg-white/10" />

        {/* Categories */}
        <ScrollArea className="h-[500px] pr-4">
          <div className="space-y-3">
            {orderedCategories.map(([category, items]) => (
              <div
                key={category}
                className={`dashboard-card-inner overflow-hidden ${getCategoryColor(category)}`}
              >
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {getCategoryIcon(category)}
                    <span className="font-semibold text-white">{category}</span>
                    <Badge
                      variant="outline"
                      className="border-white/20 text-white/60"
                    >
                      {items.length}
                    </Badge>
                  </div>
                  {expandedCategories.has(category) ? (
                    <ChevronUp className="w-4 h-4 text-white/60" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-white/60" />
                  )}
                </button>

                {expandedCategories.has(category) && (
                  <div className="px-4 pb-4 space-y-2">
                    {items.map((item, index) => (
                      <NewsItemCard
                        key={item.videoId}
                        item={item}
                        index={index}
                        onAnalyze={onAnalyzeVideo}
                        onWatch={onWatchVideo}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

/**
 * NewsItemCard - Display individual news item
 */
interface NewsItemCardProps {
  item: NewsItem;
  index: number;
  onAnalyze?: (videoId: string) => void;
  onWatch?: (videoId: string) => void;
  isTopStory?: boolean;
}

function NewsItemCard({
  item,
  index,
  onAnalyze,
  onWatch,
  isTopStory,
}: NewsItemCardProps) {
  return (
    <div className="dashboard-card-inner p-3 transition-colors group hover:border-white/20">
      <div className="flex gap-3">
        {/* Thumbnail */}
        {item.thumbnail && (
          <div className="flex-shrink-0">
            <img
              src={item.thumbnail}
              alt={item.title}
              className="w-24 h-16 object-cover rounded"
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h4 className="text-sm font-semibold text-white line-clamp-2 flex-1">
              {isTopStory && (
                <span className="text-orange-400 mr-1">#{index + 1}</span>
              )}
              {item.title}
            </h4>
          </div>

          <div className="flex items-center gap-2 mb-2 text-xs text-white/50">
            <span>{item.channel}</span>
            <span>•</span>
            <span>{new Date(item.publishedAt).toLocaleDateString()}</span>
            {item.relevanceScore !== undefined && (
              <>
                <span>•</span>
                <span className="text-purple-300">
                  Score: {item.relevanceScore}
                </span>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
            {onWatch && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onWatch(item.videoId)}
                className="h-6 px-2 text-xs text-cyan-200 hover:text-cyan-100 hover:bg-cyan-500/10"
              >
                <Play className="w-3 h-3 mr-1" />
                Play
              </Button>
            )}
            {onAnalyze && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onAnalyze(item.videoId)}
                className="h-6 px-2 text-xs text-purple-300 hover:text-purple-200 hover:bg-purple-500/10"
              >
                <Sparkles className="w-3 h-3 mr-1" />
                Analyze
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

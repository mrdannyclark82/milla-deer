import { useState, useEffect, useRef } from 'react';
import {
  CalendarDays,
  Check,
  ExternalLink,
  GitBranch,
  Link2,
  Mail,
  Menu,
  Play,
  RefreshCw,
  Sparkles,
  Unplug,
  X,
  XCircle,
} from 'lucide-react';
import { DashboardSidebar } from './DashboardSidebar';
import { HologramAvatar } from './HologramAvatar';
import { ModelSelector, type AIModel } from './ModelSelector';
import { VideoAnalysisPanel } from './VideoAnalysisPanel';
import { ScoreSettings } from './ScoreSettings';
import { ConsciousnessPanel } from './ConsciousnessPanel';
import { CollaborationPanel } from './CollaborationPanel';
import { FusionMetricsPanel } from './FusionMetricsPanel';
import { GoogleSyncCard } from './GoogleSyncCard';
import { IntegrationHealthCard } from './IntegrationHealthCard';
import { FeatureDiscoveryCard } from './FeatureDiscoveryCard';
import { ChatThreadPanel } from './ChatThreadPanel';
import type {
    CollaborationSchedulerState,
    ConsciousnessState,
    FusionTelemetrySnapshot,
    ProactiveFeature,
    SandboxFeatureSummary,
    SandboxReadiness,
    SandboxSummary,
    SystemConfigStatus,
  } from './dashboardTypes';
import type { DeviceCapabilityProfile } from '@shared/swarm';
import { Sandbox } from '@/components/Sandbox';
import { KnowledgeBaseSearch } from '@/components/KnowledgeBaseSearch';
import { DailyNewsDigest } from '@/components/DailyNewsDigest';
import { GmailTasksView } from '@/components/GmailTasksView';
import { DatabaseView } from '@/components/DatabaseView';
import AIModelSelector from '@/components/AIModelSelector';
import { YoutubePlayerCyberpunk } from '@/components/YoutubePlayerCyberpunk';
import { CreativeStudio } from '@/components/CreativeStudio';
import { ScrollArea } from '@/components/ui/scroll-area';
import { YouTubeFYP } from '@/components/YouTubeFYP';
import { AgentsPanel } from '@/components/AgentsPanel';
import { ComputerUsePanel } from '@/components/ComputerUsePanel';
import DreamDashboard from '@/components/DreamDashboard';
import SwarmPanel from '@/components/SwarmPanel';
import DeerFlowPanel from '@/components/DeerFlowPanel';
import { proactiveGet, proactivePost } from '@/lib/proactiveApi';
import {
  loadSceneSettings,
  onSettingsChange,
  updateSceneSettings,
} from '@/utils/sceneSettingsStore';
import type { DailyNewsDigest as DailyNewsDigestType } from '@/types/millalyzer';

const HUB_AVATAR_MEDIA = {
  url: '/api/assets/loop-video',
  type: 'video' as const,
};

const MEDIA_AVATAR_MEDIA = {
  url: '/api/assets/media-video',
  type: 'video' as const,
};

const STUDIO_AVATAR_MEDIA = {
  url: '/api/assets/studio-video',
  type: 'video' as const,
};

const TRANSITION_AVATAR_MEDIA = {
  url: '/api/assets/working-video',
  type: 'video' as const,
};

const DASHBOARD_SWARM_SESSION_STORAGE_KEY = 'milla-dashboard-swarm-session-id';

function getDashboardSwarmSessionId() {
  const existingValue = window.localStorage.getItem(
    DASHBOARD_SWARM_SESSION_STORAGE_KEY
  );
  if (existingValue) {
    return existingValue;
  }

  const nextValue = `dashboard_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  window.localStorage.setItem(DASHBOARD_SWARM_SESSION_STORAGE_KEY, nextValue);
  return nextValue;
}

function buildBrowserCapabilityProfile(): DeviceCapabilityProfile {
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number })
    .deviceMemory;
  const deviceLabel = `${navigator.platform || 'browser'} ${navigator.userAgent
    .split(' ')
    .slice(0, 2)
    .join(' ')}`.trim();

  return {
    sessionId: getDashboardSwarmSessionId(),
    userId: 'default-user',
    surface: 'web',
    platform: navigator.userAgent,
    deviceLabel,
    syncedAt: Date.now(),
    network: navigator.onLine ? 'online' : 'offline',
    capabilities: {
      aiCore: false,
      liteRt: false,
      localModel: false,
      mediaPipe: 'gpu' in navigator || 'mediaCapabilities' in navigator,
      vision: true,
      voice: 'speechSynthesis' in window,
      webgpu: Boolean((navigator as Navigator & { gpu?: unknown }).gpu),
    },
    preferredBackends: Boolean((navigator as Navigator & { gpu?: unknown }).gpu)
      ? ['webgpu-browser', 'remote-cloud', 'openai-edge-stub']
      : ['remote-cloud', 'openai-edge-stub'],
    runtime: {
      activeProfile: Boolean((navigator as Navigator & { gpu?: unknown }).gpu)
        ? 'webgpu'
        : 'browser',
      activeModelSource: null,
      importedModelSizeMb: null,
      lastKnownLatencyMs: Boolean((navigator as Navigator & { gpu?: unknown }).gpu)
        ? 110
        : 260,
      totalRamMb: typeof deviceMemory === 'number' ? deviceMemory * 1024 : null,
    },
  };
}

interface GmailSummary {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  preview: string;
  date: string;
  isRead: boolean;
  isStarred: boolean;
}

interface GmailRecentResponse {
  success: boolean;
  emails: GmailSummary[];
  error?: string;
}

interface CalendarEventSummary {
  id: string;
  summary: string;
  description: string;
  location: string;
  start: string;
  end: string;
  htmlLink: string;
  status: string;
}

interface CalendarEventsResponse {
  success: boolean;
  events: CalendarEventSummary[];
  error?: string;
}


export function DashboardLayout() {
  const initialSceneSettings = loadSceneSettings();
  const toScoreSettings = (settings: typeof initialSceneSettings) => ({
    ambientLight: settings.dashboardAmbientLight ?? 65,
    amplitude: Math.round((settings.animationSpeed - 0.5) * 100),
    status: densityToStatus(settings.particleDensity),
    volume: settings.enableParallax
      ? Math.round((settings.parallaxIntensity / 75) * 100)
      : 0,
  });
  const statusToDensity = (value: number) => {
    if (value < 10) return 'off' as const;
    if (value < 40) return 'low' as const;
    if (value < 75) return 'medium' as const;
    return 'high' as const;
  };
  const densityToStatus = (density: string) => {
    switch (density) {
      case 'low':
        return 30;
      case 'medium':
        return 65;
      case 'high':
        return 100;
      default:
        return 0;
    }
  };

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [activeSection, setActiveSection] = useState('chat');
  const [developerMode, setDeveloperMode] = useState(false);
  const [showSettings, setShowSettings] = useState(true);
  const [showVideoPanel, setShowVideoPanel] = useState(true);

  const [activityLog, setActivityLog] = useState<string[]>([
    `${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · Session initialized`,
  ]);
  const [selectedModel, setSelectedModel] = useState<AIModel | null>(null);
  const [recentAnalyses, setRecentAnalyses] = useState<string[]>([]);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [dailyBrief, setDailyBrief] = useState<DailyNewsDigestType>({
    date: new Date().toLocaleDateString(),
    totalVideos: 0,
    analysisCount: 0,
    categories: {},
    topStories: [],
    inboxSummary: { unreadCount: 0, emails: [] },
    dailySchedule: { count: 0, events: [] },
  });
  const [isDailyBriefLoading, setIsDailyBriefLoading] = useState(false);
  const [dailyBriefError, setDailyBriefError] = useState<string | null>(null);
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [isGoogleActionLoading, setIsGoogleActionLoading] = useState(false);
  const [googleActionError, setGoogleActionError] = useState<string | null>(null);
  const [hubQuickActionResult, setHubQuickActionResult] = useState('');
  const [hubQuickActionError, setHubQuickActionError] = useState<string | null>(null);
  const [isHubQuickActionLoading, setIsHubQuickActionLoading] = useState(false);
  const [isFeatureDiscoveryLoading, setIsFeatureDiscoveryLoading] =
    useState(false);
  const [featureDiscoveryError, setFeatureDiscoveryError] = useState<
    string | null
  >(null);
  const [discoveredFeatures, setDiscoveredFeatures] = useState<
    ProactiveFeature[]
  >([]);
  const [recommendedFeatures, setRecommendedFeatures] = useState<
    ProactiveFeature[]
  >([]);
  const [featureSandboxes, setFeatureSandboxes] = useState<SandboxSummary[]>([]);
  const [sandboxReadinessById, setSandboxReadinessById] = useState<
    Record<string, SandboxReadiness>
  >({});
  const [featureActionLoadingKey, setFeatureActionLoadingKey] = useState<
    string | null
  >(null);
  const [systemConfigStatus, setSystemConfigStatus] =
    useState<SystemConfigStatus | null>(null);
  const [isSystemConfigLoading, setIsSystemConfigLoading] = useState(false);
  const [systemConfigError, setSystemConfigError] = useState<string | null>(null);
  const [consciousnessState, setConsciousnessState] =
    useState<ConsciousnessState | null>(null);
  const [isConsciousnessLoading, setIsConsciousnessLoading] = useState(false);
  const [consciousnessError, setConsciousnessError] = useState<string | null>(null);
  const [triggeringCycle, setTriggeringCycle] = useState<'gim' | 'rem' | null>(
    null
  );
  const [collaborationScheduler, setCollaborationScheduler] =
    useState<CollaborationSchedulerState | null>(null);
  const [collaborationCronDraft, setCollaborationCronDraft] = useState(
    '0 8 * * *'
  );
  const [isCollaborationLoading, setIsCollaborationLoading] = useState(false);
  const [collaborationError, setCollaborationError] = useState<string | null>(null);
  const [fusionSnapshot, setFusionSnapshot] =
    useState<FusionTelemetrySnapshot | null>(null);
  const [fusionError, setFusionError] = useState<string | null>(null);
  const [isFusionLoading, setIsFusionLoading] = useState(false);
  const googlePopupPollRef = useRef<number | null>(null);
  const [avatarMedia, setAvatarMedia] = useState<{
    url: string;
    type: 'image' | 'video';
  } | null>(null);
  const [youtubeVideos, setYoutubeVideos] = useState<
    Array<{ id: string; title: string; channel: string; thumbnail?: string }>
  >([]);
  const [scoreSettings, setScoreSettings] = useState({
    ...toScoreSettings(initialSceneSettings),
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
    if (activeSection !== 'settings' && activeSection !== 'knowledge') {
      return;
    }

    if (activeSection === 'settings') {
      void refreshFeatureDiscovery();
      void refreshSystemConfigStatus();
    }

    if (activeSection === 'knowledge') {
      void refreshConsciousnessState();
      void refreshCollaborationScheduler();
      void refreshFusionSnapshot();
    }
  }, [activeSection]);


  useEffect(() => {
    if (activeSection !== 'news') {
      return;
    }

    void (async () => {
      setIsDailyBriefLoading(true);
      setDailyBriefError(null);
      try {
        const response = await fetch('/api/daily-brief');
        if (!response.ok) {
          throw new Error('Unable to load daily brief');
        }

        const data = await response.json();
        setDailyBrief({
          date: data.date || new Date().toLocaleDateString(),
          totalVideos: data.totalVideos || 0,
          analysisCount: data.analysisCount || 0,
          categories: data.categories || {},
          topStories: data.topStories || [],
          inboxSummary: data.inboxSummary || { unreadCount: 0, emails: [] },
          dailySchedule: data.dailySchedule || { count: 0, events: [] },
        });
        logActivity('Daily brief synced');
      } catch (error) {
        console.error('Failed to load daily brief:', error);
        setDailyBriefError(
          error instanceof Error
            ? error.message
            : 'Daily brief is unavailable right now.'
        );
      } finally {
        setIsDailyBriefLoading(false);
      }
    })();
  }, [activeSection]);

  useEffect(() => {
    void (async () => {
      try {
        await fetch('/api/swarm/devices/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(buildBrowserCapabilityProfile()),
        });
      } catch (error) {
        console.error('Failed to register dashboard swarm profile:', error);
      }
    })();
  }, []);

  useEffect(() => {
    const fetchConnectionState = async () => {
      try {
        const response = await fetch('/api/oauth/authenticated');
        if (!response.ok) return false;
        const data = await response.json();
        const connected = Boolean(data.isAuthenticated ?? data.authenticated);
        setIsGoogleConnected(connected);
        setGoogleActionError(null);
        return connected;
      } catch (error) {
        console.error('Failed to check Google connection state:', error);
        setGoogleActionError('Unable to check Google sync status right now.');
        return false;
      }
    };

    const handleGoogleOAuthComplete = async (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.data?.type !== 'google-oauth-complete'
      ) {
        return;
      }

      setIsGoogleConnected(Boolean(event.data?.connected ?? true));
      logActivity('Google connected');

      if (googlePopupPollRef.current) {
        window.clearInterval(googlePopupPollRef.current);
        googlePopupPollRef.current = null;
      }
    };

    fetchConnectionState();
    window.addEventListener('message', handleGoogleOAuthComplete);

    return () =>
      window.removeEventListener('message', handleGoogleOAuthComplete);
  }, []);

  useEffect(() => {
    return onSettingsChange((settings) => {
      setScoreSettings((current) => {
        const next = toScoreSettings(settings);
        return JSON.stringify(current) === JSON.stringify(next) ? current : next;
      });
    });
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

  const formatHubQuickActionDate = (value: string) => {
    if (!value) {
      return 'No date provided';
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    const options: Intl.DateTimeFormatOptions = value.includes('T')
      ? { dateStyle: 'medium', timeStyle: 'short' }
      : { dateStyle: 'medium' };

    return parsed.toLocaleString([], options);
  };

  const runHubQuickAction = async (action: 'gmail-recent' | 'calendar-today') => {
    if (!isGoogleConnected) {
      setHubQuickActionError(
        'Connect Google first to use Gmail and Calendar quick actions.'
      );
      setHubQuickActionResult('');
      return;
    }

    setIsHubQuickActionLoading(true);
    setHubQuickActionError(null);

    try {
      if (action === 'gmail-recent') {
        const response = await fetch('/api/gmail/recent?maxResults=5');
        const data = (await response.json()) as GmailRecentResponse;
        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Unable to load recent Gmail messages.');
        }

        const formatted = data.emails.length
          ? [
              'Recent Gmail messages',
              '',
              ...data.emails.map((email, index) =>
                [
                  `${index + 1}. ${email.subject}`,
                  `   From: ${email.from}`,
                  `   ${email.preview}`,
                  `   ${formatHubQuickActionDate(email.date)}`,
                ].join('\n')
              ),
            ].join('\n')
          : 'Recent Gmail messages\n\nNo inbox messages were returned.';

        setHubQuickActionResult(formatted);
        logActivity('Loaded recent Gmail messages');
        return;
      }

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const tomorrowStart = new Date(todayStart);
      tomorrowStart.setDate(tomorrowStart.getDate() + 1);
      const params = new URLSearchParams({
        timeMin: todayStart.toISOString(),
        timeMax: tomorrowStart.toISOString(),
        maxResults: '8',
      });
      const response = await fetch(`/api/calendar/events?${params.toString()}`);
      const data = (await response.json()) as CalendarEventsResponse;
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to load today’s calendar.');
      }

      const formatted = data.events.length
        ? [
            "Today's calendar",
            '',
            ...data.events.map((event, index) =>
              [
                `${index + 1}. ${event.summary}`,
                `   Starts: ${formatHubQuickActionDate(event.start)}`,
                event.location ? `   Location: ${event.location}` : null,
                event.description ? `   ${event.description}` : null,
              ]
                .filter(Boolean)
                .join('\n')
            ),
          ].join('\n')
        : "Today's calendar\n\nNo events are scheduled for today.";

      setHubQuickActionResult(formatted);
      logActivity("Loaded today's calendar");
    } catch (error) {
      console.error('Failed to run dashboard quick action:', error);
      setHubQuickActionResult('');
      setHubQuickActionError(
        error instanceof Error ? error.message : 'Unable to run the quick action.'
      );
    } finally {
      setIsHubQuickActionLoading(false);
    }
  };

  const handleScoreChange = (next: typeof scoreSettings) => {
    setScoreSettings(next);
    updateSceneSettings({
      dashboardAmbientLight: next.ambientLight,
      animationSpeed: 0.5 + next.amplitude / 100,
      particleDensity: statusToDensity(next.status),
      enableParticles: next.status >= 10,
      enableParallax: next.volume >= 10,
      parallaxIntensity: Math.round((next.volume / 100) * 75),
    });
    logActivity('Score settings adjusted');
  };

  const handleModelChange = (model: AIModel) => {
    setSelectedModel(model);
    logActivity(`Model selected: ${model.name}`);
  };

  const refreshGoogleConnectionState = async () => {
    try {
      setGoogleActionError(null);
      const response = await fetch('/api/oauth/authenticated');
      if (!response.ok) {
        throw new Error('Unable to refresh Google status');
      }

      const data = await response.json();
      const connected = Boolean(data.isAuthenticated ?? data.authenticated);
      setIsGoogleConnected(connected);
      logActivity(
        connected ? 'Google sync available' : 'Google not connected yet'
      );
    } catch (error) {
      console.error('Failed to refresh Google connection state:', error);
      setGoogleActionError(
        error instanceof Error
          ? error.message
          : 'Unable to refresh Google status.'
      );
    }
  };

  const handleGoogleConnect = async () => {
    setIsGoogleActionLoading(true);
    setGoogleActionError(null);

    try {
      const response = await fetch('/api/auth/google/url');
      if (!response.ok) {
        throw new Error('Unable to start Google sign-in');
      }

      const data = await response.json();
      if (!data.url) {
        throw new Error('Missing Google authorization URL');
      }

      const width = 600;
      const height = 720;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      const popup = window.open(
        data.url,
        'google-oauth',
        `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`
      );

      if (!popup || popup.closed) {
        window.location.href = data.url;
        return;
      }

      if (googlePopupPollRef.current) {
        window.clearInterval(googlePopupPollRef.current);
      }

      googlePopupPollRef.current = window.setInterval(async () => {
        if (!popup.closed) {
          return;
        }

        if (googlePopupPollRef.current) {
          window.clearInterval(googlePopupPollRef.current);
          googlePopupPollRef.current = null;
        }
        await refreshGoogleConnectionState();
      }, 500);
    } catch (error) {
      console.error('Failed to connect Google:', error);
      setGoogleActionError(
        error instanceof Error ? error.message : 'Unable to connect Google right now.'
      );
    } finally {
      setIsGoogleActionLoading(false);
    }
  };

  const handleGoogleDisconnect = async () => {
    setIsGoogleActionLoading(true);
    setGoogleActionError(null);

    try {
      const response = await fetch('/api/oauth/disconnect', {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Unable to disconnect Google');
      }

      setIsGoogleConnected(false);
      logActivity('Google disconnected');
    } catch (error) {
      console.error('Failed to disconnect Google:', error);
      setGoogleActionError(
        error instanceof Error ? error.message : 'Unable to disconnect Google right now.'
      );
    } finally {
      setIsGoogleActionLoading(false);
    }
  };

  const refreshFeatureDiscovery = async () => {
    setIsFeatureDiscoveryLoading(true);
    setFeatureDiscoveryError(null);

    try {
      const [discoveredResponse, recommendationsResponse, sandboxesResponse] =
        await Promise.all([
          proactiveGet<{ success: boolean; features?: ProactiveFeature[] }>(
            '/api/milla/features/discovered'
          ),
          proactiveGet<{
            success: boolean;
            recommendations?: ProactiveFeature[];
          }>('/api/milla/features/recommendations?limit=5'),
          proactiveGet<{ success: boolean; sandboxes?: SandboxSummary[] }>(
            '/api/milla/sandboxes'
          ),
        ]);

      setDiscoveredFeatures(discoveredResponse.features ?? []);
      setRecommendedFeatures(recommendationsResponse.recommendations ?? []);
      setFeatureSandboxes(sandboxesResponse.sandboxes ?? []);
      const linkedSandboxes = (sandboxesResponse.sandboxes ?? []).filter(
        (sandbox) =>
          sandbox.features.some((feature) => Boolean(feature.sourceFeatureId))
      );
      if (linkedSandboxes.length > 0) {
        const readinessEntries = await Promise.all(
          linkedSandboxes.map(async (sandbox) => {
            const readinessResponse = await proactiveGet<{
              success: boolean;
              readiness: SandboxReadiness;
            }>(`/api/milla/sandboxes/${sandbox.id}/readiness`);
            return [sandbox.id, readinessResponse.readiness] as const;
          })
        );
        setSandboxReadinessById(Object.fromEntries(readinessEntries));
      } else {
        setSandboxReadinessById({});
      }
      logActivity(
        `Loaded ${discoveredResponse.features?.length ?? 0} discovered features`
      );
    } catch (error) {
      console.error('Failed to load proactive feature discovery:', error);
      setFeatureDiscoveryError(
        'Feature discovery is unavailable right now. Make sure the proactive server is running on port 5001.'
      );
    } finally {
      setIsFeatureDiscoveryLoading(false);
    }
  };

  const updateFeatureStatusFromDashboard = async (
    feature: ProactiveFeature,
    status: ProactiveFeature['status'],
    actionLabel: string
  ) => {
    setFeatureActionLoadingKey(`${feature.id}:${actionLabel}`);
    setFeatureDiscoveryError(null);

    try {
      await proactivePost(`/api/milla/features/${feature.id}/status`, { status });
      logActivity(`${actionLabel} feature: ${feature.name}`);
      await refreshFeatureDiscovery();
    } catch (error) {
      console.error(`Failed to ${actionLabel} feature:`, error);
      setFeatureDiscoveryError(
        error instanceof Error
          ? error.message
          : `Unable to ${actionLabel} feature right now.`
      );
    } finally {
      setFeatureActionLoadingKey(null);
    }
  };

  const findSandboxLinkForFeature = (featureId: string) => {
    for (const sandbox of featureSandboxes) {
      const sandboxFeature = sandbox.features.find(
        (candidate) => candidate.sourceFeatureId === featureId
      );
      if (sandboxFeature) {
        return { sandbox, sandboxFeature };
      }
    }

    return null;
  };

  const refreshSandboxReadiness = async (sandboxId: string) => {
    const response = await proactiveGet<{
      success: boolean;
      readiness: SandboxReadiness;
    }>(`/api/milla/sandboxes/${sandboxId}/readiness`);
    setSandboxReadinessById((current) => ({
      ...current,
      [sandboxId]: response.readiness,
    }));
    return response.readiness;
  };

  const sendFeatureToSandbox = async (feature: ProactiveFeature) => {
    if (findSandboxLinkForFeature(feature.id)) {
      logActivity(`Feature already has a sandbox: ${feature.name}`);
      return;
    }

    setFeatureActionLoadingKey(`${feature.id}:sandbox`);
    setFeatureDiscoveryError(null);

    try {
      const sandboxResponse = await proactivePost<{
        success: boolean;
        sandbox?: SandboxSummary;
      }>('/api/milla/sandboxes', {
        name: `${feature.name} Review`,
        description: `Validation sandbox for proactive feature ${feature.name}`,
        createdBy: 'user',
        createGitBranch: false,
      });

      const sandboxId = sandboxResponse.sandbox?.id;
      if (!sandboxId) {
        throw new Error('Sandbox creation did not return an id.');
      }

      const featureResponse = await proactivePost<{
        success: boolean;
        feature?: SandboxFeatureSummary;
      }>(`/api/milla/sandboxes/${sandboxId}/features`, {
        name: feature.name,
        description: feature.description,
        files: [],
        sourceFeatureId: feature.id,
      });
      const sandboxFeatureId = featureResponse.feature?.id;
      if (!sandboxFeatureId) {
        throw new Error('Sandbox feature creation did not return an id.');
      }
      await proactivePost(`/api/milla/features/${feature.id}/status`, {
        status: 'in_sandbox',
      });
      const implementationResponse = await proactivePost<{
        success: boolean;
        result?: { success: boolean; error?: string };
      }>(
        `/api/milla/sandboxes/${sandboxId}/features/${sandboxFeatureId}/implement`
      );

      logActivity(
        implementationResponse.success
          ? `Implemented feature in sandbox: ${feature.name}`
          : `${feature.name} implementation needs review`
      );
      await refreshFeatureDiscovery();
      await refreshSandboxReadiness(sandboxId);
    } catch (error) {
      console.error('Failed to send feature to sandbox:', error);
      setFeatureDiscoveryError(
        error instanceof Error
          ? error.message
          : 'Unable to send feature to sandbox right now.'
      );
    } finally {
      setFeatureActionLoadingKey(null);
    }
  };

  const runSandboxAcceptanceTest = async (feature: ProactiveFeature) => {
    const link = findSandboxLinkForFeature(feature.id);
    if (!link) {
      setFeatureDiscoveryError('Send the feature to a sandbox before testing it.');
      return;
    }

    setFeatureActionLoadingKey(`${feature.id}:test`);
    setFeatureDiscoveryError(null);

    try {
      const response = await proactivePost<{
        success: boolean;
        result?: { passed: boolean };
      }>(
        `/api/milla/sandboxes/${link.sandbox.id}/features/${link.sandboxFeature.id}/test`,
        { testType: 'user_acceptance' }
      );

      logActivity(
        `${feature.name} sandbox test ${response.result?.passed ? 'passed' : 'needs review'}`
      );
      await refreshFeatureDiscovery();
      await refreshSandboxReadiness(link.sandbox.id);
    } catch (error) {
      console.error('Failed to run sandbox test:', error);
      setFeatureDiscoveryError(
        error instanceof Error
          ? error.message
          : 'Unable to run the sandbox test right now.'
      );
    } finally {
      setFeatureActionLoadingKey(null);
    }
  };

  const markFeatureSandboxReadyForMerge = async (feature: ProactiveFeature) => {
    const link = findSandboxLinkForFeature(feature.id);
    if (!link) {
      setFeatureDiscoveryError('No sandbox is linked to this feature yet.');
      return;
    }

    setFeatureActionLoadingKey(`${feature.id}:merge`);
    setFeatureDiscoveryError(null);

    try {
      const readiness = await refreshSandboxReadiness(link.sandbox.id);
      if (!readiness.ready) {
        setFeatureDiscoveryError(
          readiness.reasons.join(' ') || 'Sandbox is not ready for merge yet.'
        );
        return;
      }

      await proactivePost(`/api/milla/sandboxes/${link.sandbox.id}/mark-for-merge`);
      logActivity(`Marked sandbox ready for merge: ${link.sandbox.name}`);
      await refreshFeatureDiscovery();
      await refreshSandboxReadiness(link.sandbox.id);
    } catch (error) {
      console.error('Failed to mark sandbox for merge:', error);
      setFeatureDiscoveryError(
        error instanceof Error
          ? error.message
          : 'Unable to mark sandbox for merge right now.'
      );
    } finally {
      setFeatureActionLoadingKey(null);
    }
  };

  const refreshSystemConfigStatus = async () => {
    setIsSystemConfigLoading(true);
    setSystemConfigError(null);
    try {
      const response = await fetch('/api/system/config-status');
      if (!response.ok) {
        throw new Error('Unable to refresh integration health');
      }

      const data = await response.json();
      setSystemConfigStatus(data);
      const githubStatus = data.integrationChecks?.github;
      if (githubStatus?.valid) {
        logActivity('GitHub integration verified');
      }
    } catch (error) {
      console.error('Failed to load system config status:', error);
      setSystemConfigError(
        error instanceof Error
          ? error.message
          : 'Integration health is unavailable right now.'
      );
    } finally {
      setIsSystemConfigLoading(false);
    }
  };

  const refreshConsciousnessState = async () => {
    setIsConsciousnessLoading(true);
    setConsciousnessError(null);
    try {
      const response = await fetch('/api/system/consciousness');
      if (!response.ok) {
        throw new Error('Unable to load consciousness state');
      }

      const data = await response.json();
      setConsciousnessState(data);
    } catch (error) {
      console.error('Failed to load consciousness state:', error);
      setConsciousnessError(
        error instanceof Error
          ? error.message
          : 'Consciousness memory is unavailable right now.'
      );
    } finally {
      setIsConsciousnessLoading(false);
    }
  };

  const refreshFusionSnapshot = async () => {
    setIsFusionLoading(true);
    setFusionError(null);

    try {
      const response = await fetch('/api/monitoring/fusion');
      if (!response.ok) {
        throw new Error('Unable to refresh fusion telemetry');
      }

      const data = await response.json();
      setFusionSnapshot(data.snapshot ?? null);
    } catch (error) {
      console.error('Failed to load fusion telemetry:', error);
      setFusionError(
        error instanceof Error
          ? error.message
          : 'Fusion telemetry is unavailable right now.'
      );
    } finally {
      setIsFusionLoading(false);
    }
  };

  const triggerConsciousnessCycleFromDashboard = async (
    cycle: 'gim' | 'rem'
  ) => {
    setTriggeringCycle(cycle);
    try {
      const response = await fetch('/api/system/consciousness/trigger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cycle }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || `Unable to trigger ${cycle} cycle`);
      }

      setConsciousnessState(data);
      logActivity(`${cycle.toUpperCase()} cycle triggered`);
      await refreshSystemConfigStatus();
    } catch (error) {
      console.error(`Failed to trigger ${cycle} cycle:`, error);
      logActivity(`${cycle.toUpperCase()} cycle trigger failed`);
    } finally {
      setTriggeringCycle(null);
    }
  };

  const refreshCollaborationScheduler = async () => {
    setIsCollaborationLoading(true);
    setCollaborationError(null);
    try {
      const response = await fetch('/api/system/collaboration-cycle');
      if (!response.ok) {
        throw new Error('Unable to load collaboration scheduler');
      }

      const data = await response.json();
      setCollaborationScheduler(data);
      setCollaborationCronDraft(data.settings?.cron || '0 8 * * *');
    } catch (error) {
      console.error('Failed to load collaboration scheduler:', error);
      setCollaborationError(
        error instanceof Error
          ? error.message
          : 'Collaboration cycle is unavailable right now.'
      );
    } finally {
      setIsCollaborationLoading(false);
    }
  };

  const updateCollaborationScheduleFromDashboard = async (
    updates: Partial<CollaborationSchedulerState['settings']>
  ) => {
    setIsCollaborationLoading(true);
    setCollaborationError(null);
    try {
      const response = await fetch('/api/system/collaboration-cycle/schedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });
      if (!response.ok) {
        throw new Error('Unable to update collaboration schedule');
      }

      const data = await response.json();
      setCollaborationScheduler(data);
      setCollaborationCronDraft(data.settings?.cron || collaborationCronDraft);
      logActivity('Updated collaboration schedule');
    } catch (error) {
      console.error('Failed to update collaboration schedule:', error);
      setCollaborationError(
        error instanceof Error
          ? error.message
          : 'Unable to update collaboration schedule right now.'
      );
      logActivity('Collaboration schedule update failed');
    } finally {
      setIsCollaborationLoading(false);
    }
  };

  const triggerCollaborationCycleFromDashboard = async () => {
    setIsCollaborationLoading(true);
    setCollaborationError(null);
    try {
      const response = await fetch('/api/system/collaboration-cycle/trigger', {
        method: 'POST',
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Unable to run collaboration cycle');
      }

      setCollaborationScheduler(data);
      logActivity('Collaboration cycle completed');
      await refreshFeatureDiscovery();
      await refreshSystemConfigStatus();
    } catch (error) {
      console.error('Failed to run collaboration cycle:', error);
      setCollaborationError(
        error instanceof Error
          ? error.message
          : 'Unable to run the collaboration cycle right now.'
      );
      logActivity('Collaboration cycle failed');
    } finally {
      setIsCollaborationLoading(false);
    }
  };

  const sectionLabels: Record<string, string> = {
    chat: 'Chat',
    hub: 'Milla Hub',
    knowledge: 'Knowledge Base',
    news: 'Daily News Digest',
    gmail: 'Gmail & Tasks',
    studio: 'Studio',
    database: 'Data Storage',
    models: 'AI Models',
    settings: 'Settings',
    ide: 'IDE Sandbox',
    fyp: 'For You',
  };

  const formatFeatureStatus = (status: ProactiveFeature['status']) =>
    status.replace(/_/g, ' ');

  const formatTimestamp = (value: number | null) =>
    value
      ? new Date(value).toLocaleString([], {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'Not yet saved';

  const formatFeatureSource = (source: ProactiveFeature['source']) =>
    source === 'user_pattern' ? 'user pattern' : source;

  const summarizeFeatureIntent = (feature: ProactiveFeature) =>
    feature.description || `${feature.name} enhancement discovered from ${formatFeatureSource(feature.source)}.`;

  const renderPanelNotice = (
    message: string,
    tone: 'warning' | 'error' | 'info' = 'info'
  ) => {
    const classes =
      tone === 'error'
        ? 'border-rose-400/20 bg-rose-500/10 text-rose-100'
        : tone === 'warning'
          ? 'border-amber-400/20 bg-amber-400/10 text-amber-100'
          : 'border-cyan-400/20 bg-cyan-400/10 text-cyan-100';

    return (
      <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${classes}`}>
        {message}
      </div>
    );
  };

  const renderFeatureActions = (
    feature: ProactiveFeature,
    accent: 'pink' | 'cyan'
  ) => {
    const link = findSandboxLinkForFeature(feature.id);
    const readiness = link ? sandboxReadinessById[link.sandbox.id] : null;
    const implementation = link?.sandboxFeature.implementation;
    const accentClass =
      accent === 'pink'
        ? 'border-[#ff00aa]/20 bg-[#ff00aa]/10 text-[#ff9dda] hover:bg-[#ff00aa]/20'
        : 'border-[#00f2ff]/20 bg-[#00f2ff]/10 text-[#9ef6ff] hover:bg-[#00f2ff]/20';

    return (
      <div className="mt-3 space-y-3">
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">
            What this feature does
          </div>
          <div className="mt-2 text-sm text-white/80">
            {summarizeFeatureIntent(feature)}
          </div>
        </div>

        {feature.status === 'implemented' ? (
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-100">
            This feature has already completed the sandbox loop and is marked implemented.
          </div>
        ) : null}

        {feature.status === 'in_sandbox' && !link ? (
          <div className="rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 py-3 text-sm text-violet-100">
            This feature is already in sandbox review from a previous discovery cycle.
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {feature.status !== 'planned' &&
          feature.status !== 'in_sandbox' &&
          feature.status !== 'implemented' &&
          feature.status !== 'rejected' ? (
            <button
              onClick={() =>
                void updateFeatureStatusFromDashboard(feature, 'planned', 'approved')
              }
              disabled={featureActionLoadingKey !== null}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${accentClass}`}
            >
              <Check className="h-3.5 w-3.5" />
              {featureActionLoadingKey === `${feature.id}:approved`
                ? 'Approving...'
                : 'Approve'}
            </button>
          ) : null}

          {feature.status !== 'in_sandbox' &&
          feature.status !== 'implemented' &&
          feature.status !== 'rejected' &&
          !link ? (
            <button
              onClick={() => void sendFeatureToSandbox(feature)}
              disabled={featureActionLoadingKey !== null}
              className="inline-flex items-center gap-2 rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-xs font-medium text-violet-100 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <GitBranch className="h-3.5 w-3.5" />
              {featureActionLoadingKey === `${feature.id}:sandbox`
                ? 'Implementing...'
                : 'Implement in sandbox'}
            </button>
          ) : null}

          {feature.status !== 'implemented' && feature.status !== 'rejected' ? (
            <button
              onClick={() =>
                void updateFeatureStatusFromDashboard(feature, 'rejected', 'rejected')
              }
              disabled={featureActionLoadingKey !== null}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/75 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <XCircle className="h-3.5 w-3.5" />
              {featureActionLoadingKey === `${feature.id}:rejected`
                ? 'Rejecting...'
                : 'Reject'}
            </button>
          ) : null}
        </div>

        {link ? (
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-xs text-white/70">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-white">{link.sandbox.name}</span>
              <span className="rounded-full border border-white/10 px-2 py-0.5 uppercase tracking-wide text-white/50">
                {link.sandbox.status}
              </span>
              <span className="rounded-full border border-white/10 px-2 py-0.5 uppercase tracking-wide text-white/50">
                {link.sandboxFeature.status}
              </span>
              {implementation ? (
                <span className="rounded-full border border-cyan-400/20 px-2 py-0.5 uppercase tracking-wide text-cyan-100">
                  impl {implementation.status}
                </span>
              ) : null}
            </div>
            <div className="mt-2 text-white/50">
              {link.sandbox.branchName} • tests {link.sandboxFeature.testsPassed}/
              {link.sandboxFeature.testsFailed}
            </div>
            {implementation ? (
              <div className="mt-3 rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-3 text-sm text-cyan-50">
                <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-100/80">
                  Implementation status
                </div>
                <div className="mt-2">
                  {implementation.summary ||
                    (implementation.status === 'running'
                      ? 'The coding agent is generating and validating code in an isolated worktree.'
                      : implementation.status === 'failed'
                        ? 'The coding agent could not apply a working patch yet.'
                        : 'A real patch has been generated for this feature.')}
                </div>
                {implementation.lastError ? (
                  <div className="mt-2 text-xs text-rose-100">
                    {implementation.lastError}
                  </div>
                ) : null}
                {implementation.changedFiles?.length ? (
                  <div className="mt-2 text-xs text-cyan-100/80">
                    Files: {implementation.changedFiles.join(', ')}
                  </div>
                ) : null}
                {implementation.validation?.length ? (
                  <div className="mt-3 space-y-2 text-xs text-cyan-100/80">
                    {implementation.validation.map((result, index) => (
                      <div
                        key={`${result.command}-${index}`}
                        className="rounded-lg border border-white/10 bg-black/20 px-3 py-2"
                      >
                        <div className="font-medium text-white">
                          {result.passed ? 'PASS' : 'FAIL'} {result.command}
                        </div>
                        <div className="mt-1 whitespace-pre-wrap break-words text-white/60">
                          {result.output}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {readiness ? (
              <div
                className={`mt-3 rounded-xl border px-3 py-3 ${
                  readiness.ready
                    ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100'
                    : 'border-amber-400/20 bg-amber-400/10 text-amber-100'
                }`}
              >
                <div className="text-[10px] uppercase tracking-[0.2em] opacity-80">
                  Readiness summary
                </div>
                <div className="mt-2 text-sm">
                  {readiness.ready
                    ? 'This sandbox has passed readiness checks and can be marked ready for merge.'
                    : 'This sandbox still has blocking conditions before it can merge.'}
                </div>
                {readiness.reasons.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-xs">
                    {readiness.reasons.map((reason) => (
                      <li key={reason}>- {reason}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {link.sandbox.status !== 'merged' ? (
                <button
                  onClick={() => void runSandboxAcceptanceTest(feature)}
                  disabled={featureActionLoadingKey !== null}
                  className="inline-flex items-center gap-2 rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-xs font-medium text-violet-100 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Play className="h-3.5 w-3.5" />
                  {featureActionLoadingKey === `${feature.id}:test`
                    ? 'Testing...'
                    : 'Run sandbox test'}
                </button>
              ) : null}

              <button
                onClick={() => void refreshSandboxReadiness(link.sandbox.id)}
                disabled={featureActionLoadingKey !== null}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/75 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Check readiness
              </button>

              {link.sandbox.status !== 'merged' ? (
                <button
                  onClick={() => void markFeatureSandboxReadyForMerge(feature)}
                  disabled={featureActionLoadingKey !== null}
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Check className="h-3.5 w-3.5" />
                  {featureActionLoadingKey === `${feature.id}:merge`
                    ? 'Marking...'
                    : 'Mark ready for merge'}
                </button>
              ) : (
                <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-100">
                  <Check className="h-3.5 w-3.5" />
                  Merged into improvement loop
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const emptyDigest: DailyNewsDigestType = {
    date: new Date().toLocaleDateString(),
    totalVideos: 0,
    analysisCount: 0,
    categories: {},
    topStories: [],
    inboxSummary: { unreadCount: 0, emails: [] },
    dailySchedule: { count: 0, events: [] },
  };

  const ambientAccent = 0.05 + scoreSettings.ambientLight / 1000;
  const pulseOpacity = 0.18 + scoreSettings.amplitude / 300;
  const particleCount = 12 + Math.round((scoreSettings.status / 100) * 18);
  const liveThreadGlow = 0.1 + scoreSettings.volume / 400;
  const resolvedAvatarMedia =
    avatarMedia ??
    (activeSection === 'studio'
      ? STUDIO_AVATAR_MEDIA
      : activeSection === 'news' || Boolean(activeVideoId) || youtubeVideos.length > 0
        ? MEDIA_AVATAR_MEDIA
        : activeSection === 'hub' || activeSection === 'chat'
          ? HUB_AVATAR_MEDIA
          : TRANSITION_AVATAR_MEDIA);

  return (
    <div className="min-h-screen bg-[#0c021a] text-white font-sans overflow-hidden">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0">
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(circle_at_20%_20%, rgba(0,242,255,${ambientAccent}), transparent 35%), radial-gradient(circle_at_80%_10%, rgba(255,0,170,${ambientAccent}), transparent 30%), radial-gradient(circle_at_50%_70%, rgba(124,58,237,${
              ambientAccent + 0.04
            }), transparent 40%)`,
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            opacity: pulseOpacity,
            background:
              'linear-gradient(120deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0) 35%, rgba(255,255,255,0) 65%, rgba(255,255,255,0.08) 100%)',
            animation: 'breathing 14s ease-in-out infinite',
          }}
        />
        <div className="absolute inset-0 bg-[length:120px_120px] bg-cyber-grid opacity-20 mix-blend-screen" />
      </div>

      {/* Floating particles */}
      <div className="pointer-events-none fixed inset-0">
        {Array.from({ length: particleCount }).map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-[#00f2ff] opacity-60"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              opacity: 0.2 + scoreSettings.status / 125,
              animationName: 'float',
              animationDuration: `${6 + Math.random() * 6 - scoreSettings.amplitude / 40}s`,
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
              activeSection === 'studio' || activeSection === 'chat' ? 'xl:grid-cols-1' : 'xl:grid-cols-[2fr_1fr]'
            }`}
          >
            <div className="space-y-6">
              {/* Hero / hologram */}
              <section className="dashboard-card relative overflow-hidden rounded-3xl shadow-[0_25px_120px_rgba(0,0,0,0.45)]">
                <div className="absolute inset-0 bg-gradient-to-br from-[#00f2ff]/10 via-transparent to-[#ff00aa]/10" />
                <div
                  className="absolute inset-x-[18%] top-6 bottom-6 opacity-90"
                  style={{
                    background:
                      'radial-gradient(ellipse at center, rgba(0,242,255,0.18) 0%, rgba(255,0,170,0.14) 38%, rgba(124,58,237,0.08) 58%, transparent 76%)',
                    clipPath:
                      'polygon(50% 0%, 68% 8%, 78% 24%, 80% 42%, 74% 60%, 67% 78%, 58% 100%, 42% 100%, 33% 78%, 26% 60%, 20% 42%, 22% 24%, 32% 8%)',
                    animation: 'breathing 12s ease-in-out infinite',
                    filter: 'blur(18px)',
                  }}
                />
                <div className="absolute -left-20 top-10 h-40 w-40 rounded-full bg-[#00f2ff]/16 blur-3xl" />
                <div className="absolute -right-16 bottom-6 h-48 w-48 rounded-full bg-[#ff00aa]/12 blur-3xl" />
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
                      mediaUrl={resolvedAvatarMedia.url}
                      mediaType={resolvedAvatarMedia.type}
                    />
                  </div>
                </div>
              </section>

              {activeSection === 'chat' ? (
                <ChatThreadPanel
                  onPlayVideo={(videoId) => {
                    handlePlayVideo(videoId);
                    handleAnalyzeComplete(`YouTube Video ${videoId}`);
                  }}
                />
              ) : activeSection === 'hub' ? (
                <div className="space-y-6">
                  <section className="rounded-2xl border border-cyan-400/20 bg-white/5 p-5 backdrop-blur-xl">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="text-xs uppercase tracking-[0.28em] text-cyan-200/75">
                          Quick actions
                        </div>
                        <h3 className="mt-2 text-xl font-semibold text-white">
                          Workspace tools on the Hub
                        </h3>
                        <p className="mt-2 max-w-2xl text-sm text-white/65">
                          Pull live Gmail and Calendar data without opening the Sandbox, or jump straight to the dashboard areas that manage collaboration and proactive discoveries.
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/60">
                        Google {isGoogleConnected ? 'connected' : 'not connected'}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        onClick={() => void runHubQuickAction('gmail-recent')}
                        disabled={isHubQuickActionLoading || !isGoogleConnected}
                        className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Mail className="h-4 w-4" />
                        Recent Gmail
                      </button>
                      <button
                        onClick={() => void runHubQuickAction('calendar-today')}
                        disabled={isHubQuickActionLoading || !isGoogleConnected}
                        className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <CalendarDays className="h-4 w-4" />
                        Today&apos;s calendar
                      </button>
                      <button
                        onClick={() => setActiveSection('knowledge')}
                        className="inline-flex items-center gap-2 rounded-xl border border-violet-400/20 bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-100 transition hover:bg-violet-500/20"
                      >
                        <Link2 className="h-4 w-4" />
                        Collaboration status
                      </button>
                      <button
                        onClick={() => setActiveSection('settings')}
                        className="inline-flex items-center gap-2 rounded-xl border border-violet-400/20 bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-100 transition hover:bg-violet-500/20"
                      >
                        <Sparkles className="h-4 w-4" />
                        Proactive features
                      </button>
                    </div>

                    {hubQuickActionError ? (
                      <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                        {hubQuickActionError}
                      </div>
                    ) : null}

                    <div className="mt-4 rounded-xl border border-white/10 bg-[#050816] p-4">
                      <pre className="whitespace-pre-wrap break-words font-mono text-xs text-cyan-50">
                        {hubQuickActionResult ||
                          'Use the quick actions above to load recent Gmail or today’s calendar right here on the Hub.'}
                      </pre>
                    </div>
                  </section>
                </div>
              ) : activeSection === 'studio' ? (
                <CreativeStudio
                  isOpen={true}
                  embedded={true}
                  onClose={() => setActiveSection('hub')}
                  onApplyToAvatar={(media) => {
                    setAvatarMedia({ url: media.url, type: media.type });
                    logActivity(`Studio applied ${media.type} media to avatar`);
                    setActiveSection('hub');
                  }}
                />
              ) : activeSection === 'ide' ? (
                <div className="relative h-[calc(100vh-13rem)] min-h-[760px] overflow-auto">
                  <Sandbox
                    isOpen={true}
                    onClose={() => setActiveSection('hub')}
                    embedded={true}
                  />
                </div>
              ) : activeSection === 'knowledge' ? (
                <div className="space-y-6">
                  <KnowledgeBaseSearch
                    className="min-h-[500px]"
                    onClose={() => setActiveSection('hub')}
                  />
                  <ConsciousnessPanel
                    consciousnessError={consciousnessError}
                    consciousnessState={consciousnessState}
                    formatTimestamp={formatTimestamp}
                    isConsciousnessLoading={isConsciousnessLoading}
                    refreshConsciousnessState={refreshConsciousnessState}
                    renderPanelNotice={renderPanelNotice}
                    triggerConsciousnessCycleFromDashboard={
                      triggerConsciousnessCycleFromDashboard
                    }
                    triggeringCycle={triggeringCycle}
                  />
                  <CollaborationPanel
                    collaborationCronDraft={collaborationCronDraft}
                    collaborationError={collaborationError}
                    collaborationScheduler={collaborationScheduler}
                    formatTimestamp={formatTimestamp}
                    isCollaborationLoading={isCollaborationLoading}
                    refreshCollaborationScheduler={refreshCollaborationScheduler}
                    renderPanelNotice={renderPanelNotice}
                    setCollaborationCronDraft={setCollaborationCronDraft}
                    triggerCollaborationCycleFromDashboard={
                      triggerCollaborationCycleFromDashboard
                    }
                    updateCollaborationScheduleFromDashboard={
                      updateCollaborationScheduleFromDashboard
                    }
                  />
                  <FusionMetricsPanel
                    formatTimestamp={formatTimestamp}
                    fusionError={fusionError}
                    fusionSnapshot={fusionSnapshot}
                    isFusionLoading={isFusionLoading}
                    refreshFusionSnapshot={refreshFusionSnapshot}
                    renderPanelNotice={renderPanelNotice}
                  />
                </div>
              ) : activeSection === 'news' ? (
                <div className="space-y-4">
                  {dailyBriefError ? renderPanelNotice(dailyBriefError, 'warning') : null}
                  {isDailyBriefLoading ? renderPanelNotice('Refreshing daily brief...') : null}
                  <DailyNewsDigest
                    digest={dailyBrief || emptyDigest}
                    className="min-h-[500px]"
                    onWatchVideo={handlePlayVideo}
                    onAnalyzeVideo={(videoId) => {
                      handlePlayVideo(videoId);
                      setShowVideoPanel(true);
                      handleAnalyzeComplete(`Queued digest video ${videoId}`);
                    }}
                  />
                </div>
              ) : activeSection === 'gmail' ? (
                <GmailTasksView />
              ) : activeSection === 'fyp' ? (
                <YouTubeFYP
                  onPlayVideo={(id) => {
                    setYoutubeVideos([]);
                    setActiveVideoId(id);
                  }}
                  onAnalyzeVideo={(id) => {
                    setActiveSection('hub');
                    // TODO: wire to chat input when hub chat state is accessible
                    console.log('Analyze video:', id);
                  }}
                />
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
                    <GoogleSyncCard
                      googleActionError={googleActionError}
                      handleGoogleConnect={handleGoogleConnect}
                      handleGoogleDisconnect={handleGoogleDisconnect}
                      isGoogleActionLoading={isGoogleActionLoading}
                      isGoogleConnected={isGoogleConnected}
                      logActivity={logActivity}
                      refreshGoogleConnectionState={refreshGoogleConnectionState}
                      renderPanelNotice={renderPanelNotice}
                      setActiveSection={setActiveSection}
                    />
                    <IntegrationHealthCard
                      isSystemConfigLoading={isSystemConfigLoading}
                      refreshSystemConfigStatus={refreshSystemConfigStatus}
                      renderPanelNotice={renderPanelNotice}
                      systemConfigError={systemConfigError}
                      systemConfigStatus={systemConfigStatus}
                    />
                    <FeatureDiscoveryCard
                      discoveredFeatures={discoveredFeatures}
                      featureDiscoveryError={featureDiscoveryError}
                      formatFeatureSource={formatFeatureSource}
                      formatFeatureStatus={formatFeatureStatus}
                      isFeatureDiscoveryLoading={isFeatureDiscoveryLoading}
                      recommendedFeatures={recommendedFeatures}
                      refreshFeatureDiscovery={refreshFeatureDiscovery}
                      renderFeatureActions={renderFeatureActions}
                    />
                  </div>
                </div>
              ) : activeSection === 'agents-hub' ? (
                <AgentsPanel />
              ) : activeSection === 'computer-use' ? (
                <ComputerUsePanel />
              ) : activeSection === 'dream' ? (
                <DreamDashboard />
              ) : activeSection === 'swarm' ? (
                <SwarmPanel />
              ) : activeSection === 'deerflow' ? (
                <DeerFlowPanel />
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
            {activeSection !== 'studio' && activeSection !== 'chat' && <div className="space-y-4">
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

                 <div
                   className="dashboard-card p-4"
                   style={{
                      boxShadow: `0 0 35px rgba(0, 242, 255, ${liveThreadGlow})`,
                    }}
                 >
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
                  <button
                    onClick={() => {
                      setActiveSection('studio');
                      logActivity('Opened Studio for avatar video creation');
                    }}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left transition-all hover:border-white/20"
                  >
                    Avatar Studio
                  </button>
                </div>
              </div>

              <div className="dashboard-card p-4">
                <div className="flex items-center justify-between text-sm font-medium text-white/80">
                  <span>Activity</span>
                  <span className="text-[11px] text-white/40">
                    {activityLog.length} events
                  </span>
                </div>
                <ScrollArea className="mt-3 h-[220px] pr-2">
                  <div className="space-y-2">
                    {activityLog.map((item, i) => (
                      <div
                        key={`${item}-${i}`}
                        className="rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-xs text-white/70"
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
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

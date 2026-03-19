import { useState, useEffect, useRef } from 'react';
import {
  Check,
  ExternalLink,
  GitBranch,
  Globe,
  Link2,
  Menu,
  PictureInPicture2,
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
import { ChatThreadPanel } from './ChatThreadPanel';
import { Sandbox } from '@/components/Sandbox';
import { KnowledgeBaseSearch } from '@/components/KnowledgeBaseSearch';
import { DailyNewsDigest } from '@/components/DailyNewsDigest';
import { GmailTasksView } from '@/components/GmailTasksView';
import { DatabaseView } from '@/components/DatabaseView';
import AIModelSelector from '@/components/AIModelSelector';
import { YoutubePlayerCyberpunk } from '@/components/YoutubePlayerCyberpunk';
import { CreativeStudio } from '@/components/CreativeStudio';
import { ScrollArea } from '@/components/ui/scroll-area';
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

const DEFAULT_BROWSER_URL = 'https://example.com';

interface ProactiveFeature {
  id: string;
  name: string;
  description: string;
  source: 'github' | 'web' | 'youtube' | 'user_pattern';
  repositoryExample?: string;
  relevance: number;
  popularity: number;
  estimatedValue: number;
  implementationComplexity: 'low' | 'medium' | 'high';
  status:
    | 'discovered'
    | 'analyzed'
    | 'planned'
    | 'in_sandbox'
    | 'implemented'
    | 'rejected';
  tags: string[];
}

interface SystemConfigStatus {
  warnings: string[];
  integrations: {
    proactiveBaseUrl: string;
  };
  integrationChecks?: {
    proactive?: {
      reachable: boolean;
      error: string | null;
    };
    github?: {
      configured: boolean;
      valid: boolean | null;
      scopes: string[];
      error: string | null;
    };
    consciousness?: {
      isInitialized: boolean;
      replycaResolved: boolean;
      gimEnabled: boolean;
      remEnabled: boolean;
      gimCron: string;
      remCron: string;
      cycles: {
        gim: {
          totalRuns: number;
          successfulRuns: number;
          lastError: string | null;
        };
        rem: {
          totalRuns: number;
          successfulRuns: number;
          lastError: string | null;
        };
      };
    };
    repositoryDiscovery?: {
      isScheduled: boolean;
      isRunning: boolean;
      enabled: boolean;
      cron: string;
      maxReposPerCycle: number;
      totalRuns: number;
      successfulRuns: number;
      lastError: string | null;
    };
    shell?: {
      enabled: boolean;
      requiresAdminToken: boolean;
      activeRunId: string | null;
      queuedRunIds: string[];
      queueLength: number;
    };
  };
}

interface ConsciousnessState {
  scheduler: NonNullable<SystemConfigStatus['integrationChecks']>['consciousness'];
  storage: {
    available: boolean;
    error?: string;
    gim?: {
      exists: boolean;
      path: string;
      updatedAt: number | null;
      archiveCount: number;
      latestSessionAt: string | null;
      latestPreview: string | null;
    };
    rem?: {
      exists: boolean;
      path: string;
      updatedAt: number | null;
      summary: {
        atpEnergy: number | null;
        adenosine: number | null;
        painLevel: number | null;
        journalEntries: number;
        eventsBuffered: number;
        plasticityEvents: number;
        chemicals: Record<string, number>;
      } | null;
    };
  };
}

interface SandboxFeatureSummary {
  id: string;
  name: string;
  description: string;
  files: string[];
  sourceFeatureId?: string;
  status: 'draft' | 'testing' | 'approved' | 'rejected';
  testsPassed: number;
  testsFailed: number;
  addedAt: number;
  implementation?: {
    status: 'idle' | 'running' | 'succeeded' | 'failed';
    startedAt?: number;
    completedAt?: number;
    summary?: string;
    reasoning?: string;
    worktreePath?: string;
    changedFiles?: string[];
    lastError?: string;
    validation?: Array<{
      command: string;
      passed: boolean;
      output: string;
    }>;
  };
}

interface SandboxSummary {
  id: string;
  name: string;
  description: string;
  branchName: string;
  status: 'active' | 'testing' | 'merged' | 'archived';
  createdAt: number;
  createdBy: 'milla' | 'user';
  features: SandboxFeatureSummary[];
  readyForProduction: boolean;
}

interface SandboxReadiness {
  ready: boolean;
  reasons: string[];
  featuresApproved: number;
  featuresPending: number;
}

interface CollaborationSuggestion {
  feature_name: string;
  reasoning: string;
  code_snippet: string;
  pr_title: string;
}

interface CollaborationReport {
  generatedAt: number;
  repoPath: string;
  proactive: {
    discoveredCount: number;
    recommendedCount: number;
    topRecommendations: string[];
    scheduler: {
      cron: string;
      isScheduled: boolean;
      isRunning: boolean;
      lastRunAt: number | null;
      lastSuccessAt: number | null;
      lastError: string | null;
      totalRuns: number;
      successfulRuns: number;
    };
  };
  sarii: {
    success: boolean;
    suggestion: CollaborationSuggestion | null;
    syncedFeatureId: string | null;
    error: string | null;
  };
}

interface CollaborationSchedulerState {
  isInitialized: boolean;
  isScheduled: boolean;
  isRunning: boolean;
  settings: {
    enabled: boolean;
    cron: string;
    timezone: string;
  };
  lastRunAt: number | null;
  lastSuccessAt: number | null;
  lastError: string | null;
  totalRuns: number;
  successfulRuns: number;
  latestReport: CollaborationReport | null;
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
  const [activeSection, setActiveSection] = useState('hub');
  const [developerMode, setDeveloperMode] = useState(false);
  const [showSettings, setShowSettings] = useState(true);
  const [showVideoPanel, setShowVideoPanel] = useState(true);
  const [showBrowserPip, setShowBrowserPip] = useState(false);
  const [browserDraftUrl, setBrowserDraftUrl] = useState(DEFAULT_BROWSER_URL);
  const [browserUrl, setBrowserUrl] = useState(DEFAULT_BROWSER_URL);
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
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [isGoogleActionLoading, setIsGoogleActionLoading] = useState(false);
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
  const [consciousnessState, setConsciousnessState] =
    useState<ConsciousnessState | null>(null);
  const [isConsciousnessLoading, setIsConsciousnessLoading] = useState(false);
  const [triggeringCycle, setTriggeringCycle] = useState<'gim' | 'rem' | null>(
    null
  );
  const [collaborationScheduler, setCollaborationScheduler] =
    useState<CollaborationSchedulerState | null>(null);
  const [collaborationCronDraft, setCollaborationCronDraft] = useState(
    '0 8 * * *'
  );
  const [isCollaborationLoading, setIsCollaborationLoading] = useState(false);
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
    }
  }, [activeSection]);


  useEffect(() => {
    if (activeSection !== 'news') {
      return;
    }

    void (async () => {
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
      }
    })();
  }, [activeSection]);

  useEffect(() => {
    const fetchConnectionState = async () => {
      try {
        const response = await fetch('/api/oauth/authenticated');
        if (!response.ok) return false;
        const data = await response.json();
        const connected = Boolean(data.isAuthenticated ?? data.authenticated);
        setIsGoogleConnected(connected);
        return connected;
      } catch (error) {
        console.error('Failed to check Google connection state:', error);
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

  const normalizeBrowserUrl = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return DEFAULT_BROWSER_URL;
    }

    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
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
    }
  };

  const handleGoogleConnect = async () => {
    setIsGoogleActionLoading(true);

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
    } finally {
      setIsGoogleActionLoading(false);
    }
  };

  const handleGoogleDisconnect = async () => {
    setIsGoogleActionLoading(true);

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
    }
  };

  const refreshConsciousnessState = async () => {
    setIsConsciousnessLoading(true);
    try {
      const response = await fetch('/api/system/consciousness');
      if (!response.ok) {
        throw new Error('Unable to load consciousness state');
      }

      const data = await response.json();
      setConsciousnessState(data);
    } catch (error) {
      console.error('Failed to load consciousness state:', error);
    } finally {
      setIsConsciousnessLoading(false);
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
    } finally {
      setIsCollaborationLoading(false);
    }
  };

  const updateCollaborationScheduleFromDashboard = async (
    updates: Partial<CollaborationSchedulerState['settings']>
  ) => {
    setIsCollaborationLoading(true);
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
      logActivity('Collaboration schedule update failed');
    } finally {
      setIsCollaborationLoading(false);
    }
  };

  const triggerCollaborationCycleFromDashboard = async () => {
    setIsCollaborationLoading(true);
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
      logActivity('Collaboration cycle failed');
    } finally {
      setIsCollaborationLoading(false);
    }
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

  const renderConsciousnessPanel = () => (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl shadow-[0_0_40px_rgba(255,0,170,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-lg font-semibold text-white">
            Consciousness memory
          </h4>
          <p className="mt-2 text-sm text-white/65">
            Stored GIM monologues and REM bio-state from ReplycA, with manual cycle controls.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void triggerConsciousnessCycleFromDashboard('gim')}
            disabled={triggeringCycle !== null}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/85 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {triggeringCycle === 'gim' ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : null}
            Run GIM
          </button>
          <button
            onClick={() => void triggerConsciousnessCycleFromDashboard('rem')}
            disabled={triggeringCycle !== null}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/85 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {triggeringCycle === 'rem' ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : null}
            Run REM
          </button>
          <button
            onClick={() => void refreshConsciousnessState()}
            disabled={isConsciousnessLoading}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/85 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              className={`h-4 w-4 ${isConsciousnessLoading ? 'animate-spin' : ''}`}
            />
            Refresh
          </button>
        </div>
      </div>

      {!consciousnessState?.storage.available ? (
        <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {consciousnessState?.storage.error ||
            'ReplycA storage is not available yet.'}
        </div>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="text-xs uppercase tracking-[0.2em] text-white/45">
                GIM stream
              </div>
              <div className="text-xs text-white/45">
                {consciousnessState.storage.gim?.archiveCount ?? 0} archives
              </div>
            </div>
            <div className="mt-2 text-sm text-white/70">
              Saved {formatTimestamp(consciousnessState.storage.gim?.updatedAt ?? null)}
            </div>
            <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white/85">
              {consciousnessState.storage.gim?.latestPreview ||
                'No GIM monologue has been saved yet.'}
            </div>
            <div className="mt-3 text-xs text-white/45">
              {consciousnessState.storage.gim?.latestSessionAt
                ? `Latest session: ${consciousnessState.storage.gim.latestSessionAt}`
                : 'Waiting for first GIM session'}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-4">
            <div className="text-xs uppercase tracking-[0.2em] text-white/45">
              REM state
            </div>
            <div className="mt-2 text-sm text-white/70">
              Saved {formatTimestamp(consciousnessState.storage.rem?.updatedAt ?? null)}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-white/85">
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                ATP {consciousnessState.storage.rem?.summary?.atpEnergy?.toFixed(1) ?? 'n/a'}
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                Adenosine {consciousnessState.storage.rem?.summary?.adenosine?.toFixed(2) ?? 'n/a'}
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                Pain {consciousnessState.storage.rem?.summary?.painLevel?.toFixed(2) ?? 'n/a'}
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                Journal {consciousnessState.storage.rem?.summary?.journalEntries ?? 0}
              </div>
            </div>
            <div className="mt-3 text-xs text-white/45">
              {consciousnessState.storage.rem?.summary
                ? `${consciousnessState.storage.rem.summary.eventsBuffered} buffered events • ${consciousnessState.storage.rem.summary.plasticityEvents} plasticity entries`
                : 'No REM state saved yet.'}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderCollaborationPanel = () => (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl shadow-[0_0_40px_rgba(0,242,255,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-lg font-semibold text-white">
            Collaboration cycle
          </h4>
          <p className="mt-2 text-sm text-white/65">
            SARIi planner + proactive repository discovery + coding-agent handoff on a cron schedule.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void triggerCollaborationCycleFromDashboard()}
            disabled={isCollaborationLoading}
            className="inline-flex items-center gap-2 rounded-xl border border-[#00f2ff]/30 bg-[#00f2ff]/10 px-3 py-2 text-xs font-medium text-[#b8f8ff] transition hover:bg-[#00f2ff]/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Sparkles className="h-4 w-4" />
            {isCollaborationLoading ? 'Running...' : 'Run updates now'}
          </button>
          <button
            onClick={() => void refreshCollaborationScheduler()}
            disabled={isCollaborationLoading}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/85 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              className={`h-4 w-4 ${isCollaborationLoading ? 'animate-spin' : ''}`}
            />
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.2em] text-white/45">
            Schedule
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {collaborationScheduler?.isScheduled ? 'Scheduled' : 'Paused'}
          </div>
          <div className="mt-2 text-xs text-white/45">
            {collaborationScheduler?.settings.timezone || 'America/Chicago'} •{' '}
            {collaborationScheduler?.settings.cron || collaborationCronDraft}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.2em] text-white/45">
            Latest run
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {collaborationScheduler?.lastSuccessAt ? 'Healthy' : 'Pending'}
          </div>
          <div className="mt-2 text-xs text-white/45">
            {collaborationScheduler?.lastError ||
              `Last success ${formatTimestamp(collaborationScheduler?.lastSuccessAt ?? null)}`}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <input
          value={collaborationCronDraft}
          onChange={(event) => setCollaborationCronDraft(event.target.value)}
          className="min-w-[220px] flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-white outline-none transition focus:border-[#00f2ff]/30"
          placeholder="0 8 * * *"
        />
        <button
          onClick={() =>
            void updateCollaborationScheduleFromDashboard({
              enabled: true,
              cron: collaborationCronDraft,
            })
          }
          disabled={isCollaborationLoading}
          className="inline-flex items-center gap-2 rounded-xl border border-violet-400/20 bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-100 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Save cron
        </button>
        <button
          onClick={() =>
            void updateCollaborationScheduleFromDashboard({
              enabled: !(collaborationScheduler?.settings.enabled ?? true),
            })
          }
          disabled={isCollaborationLoading}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/85 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {(collaborationScheduler?.settings.enabled ?? true) ? 'Pause cycle' : 'Resume cycle'}
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-white/80">
        <div className="text-xs uppercase tracking-[0.2em] text-white/45">
          Collaboration path
        </div>
        <div className="mt-2">
          This cycle uses proactive repository discovery first, then asks SARIi&apos;s planner for the next high-value idea. Approved follow-up work can be sent into the coding-agent sandbox flow.
        </div>
      </div>

      {collaborationScheduler?.latestReport ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-4">
            <div className="text-xs uppercase tracking-[0.2em] text-white/45">
              Proactive summary
            </div>
            <div className="mt-2 text-sm text-white/85">
              {collaborationScheduler.latestReport.proactive.discoveredCount} discovered •{' '}
              {collaborationScheduler.latestReport.proactive.recommendedCount} recommended
            </div>
            <div className="mt-2 text-xs text-white/45">
              {collaborationScheduler.latestReport.proactive.topRecommendations.join(', ') ||
                'No top recommendations yet.'}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-4">
            <div className="text-xs uppercase tracking-[0.2em] text-white/45">
              SARIi recommendation
            </div>
            <div className="mt-2 text-sm text-white/85">
              {collaborationScheduler.latestReport.sarii.suggestion?.feature_name ||
                'No recommendation generated yet.'}
            </div>
            <div className="mt-2 text-xs text-white/55">
              {collaborationScheduler.latestReport.sarii.suggestion?.reasoning ||
                collaborationScheduler.latestReport.sarii.error ||
                'Waiting for planner output.'}
            </div>
            <div className="mt-3 text-xs text-white/45">
              {collaborationScheduler.latestReport.sarii.syncedFeatureId
                ? `Synced into proactive discovery as ${collaborationScheduler.latestReport.sarii.syncedFeatureId}`
                : collaborationScheduler.latestReport.sarii.success
                  ? 'Planner output is advisory only until it is synced into proactive discovery.'
                  : 'Planner output could not be synced yet.'}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

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
        : activeSection === 'hub'
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
              activeSection === 'studio' ? 'xl:grid-cols-1' : 'xl:grid-cols-[2fr_1fr]'
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
                  {renderConsciousnessPanel()}
                  {renderCollaborationPanel()}
                </div>
              ) : activeSection === 'news' ? (
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
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl shadow-[0_0_40px_rgba(0,242,255,0.08)]">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h4 className="text-lg font-semibold text-white">
                            Google sync
                          </h4>
                          <p className="mt-2 text-sm text-white/65">
                            Connect Google once to sync Gmail, Tasks, and
                            YouTube features from the dashboard.
                          </p>
                        </div>
                        <div
                          className={`mt-1 h-3 w-3 rounded-full ${
                            isGoogleConnected
                              ? 'bg-[#00f2ff] shadow-[0_0_18px_rgba(0,242,255,0.95)]'
                              : 'bg-white/20'
                          }`}
                          aria-hidden="true"
                        />
                      </div>

                      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/80">
                        {isGoogleConnected
                          ? 'Google is connected and ready to sync.'
                          : 'Google is not connected yet.'}
                      </div>

                      <div className="mt-5 flex flex-wrap gap-3">
                        <button
                          onClick={
                            isGoogleConnected
                              ? handleGoogleDisconnect
                              : handleGoogleConnect
                          }
                          disabled={isGoogleActionLoading}
                          className="inline-flex items-center gap-2 rounded-xl border border-[#00f2ff]/30 bg-[#00f2ff]/10 px-4 py-2 text-sm font-medium text-[#b8f8ff] transition hover:bg-[#00f2ff]/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isGoogleConnected ? (
                            <Unplug className="h-4 w-4" />
                          ) : (
                            <Link2 className="h-4 w-4" />
                          )}
                          {isGoogleActionLoading
                            ? 'Working...'
                            : isGoogleConnected
                              ? 'Disconnect Google'
                              : 'Connect Google'}
                        </button>

                        <button
                          onClick={refreshGoogleConnectionState}
                          disabled={isGoogleActionLoading}
                          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/85 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <RefreshCw className="h-4 w-4" />
                          Sync status
                        </button>

                        {isGoogleConnected && (
                          <button
                            onClick={() => {
                              setActiveSection('gmail');
                              logActivity('Opened Gmail & Tasks');
                            }}
                            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/85 transition hover:bg-white/10"
                          >
                            <ExternalLink className="h-4 w-4" />
                            Open Gmail & Tasks
                          </button>
                        )}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl shadow-[0_0_40px_rgba(255,0,170,0.08)]">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h4 className="text-lg font-semibold text-white">
                              Integration health
                            </h4>
                            <p className="mt-2 text-sm text-white/65">
                              Runtime status for GitHub, proactive services, and
                              self-healing config warnings.
                            </p>
                          </div>
                          <button
                            onClick={() => void refreshSystemConfigStatus()}
                            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/85 transition hover:bg-white/10"
                          >
                            <RefreshCw className="h-4 w-4" />
                            Refresh
                          </button>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                            <div className="text-xs uppercase tracking-[0.2em] text-white/45">
                              GitHub
                            </div>
                            <div className="mt-2 text-2xl font-semibold text-white">
                              {systemConfigStatus?.integrationChecks?.github?.valid
                                ? 'Connected'
                                : systemConfigStatus?.integrationChecks?.github?.configured
                                  ? 'Needs attention'
                                  : 'Not configured'}
                            </div>
                            <div className="mt-2 text-xs text-white/45">
                              {systemConfigStatus?.integrationChecks?.github?.error ||
                                systemConfigStatus?.integrationChecks?.github?.scopes
                                  ?.slice(0, 3)
                                  .join(', ') ||
                                'No GitHub scopes detected'}
                            </div>
                          </div>
                          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                            <div className="text-xs uppercase tracking-[0.2em] text-white/45">
                              Proactive
                            </div>
                            <div className="mt-2 text-2xl font-semibold text-white">
                              {systemConfigStatus?.integrationChecks?.proactive
                                ?.reachable
                                ? 'Reachable'
                                : 'Unavailable'}
                            </div>
                            <div className="mt-2 text-xs text-white/45">
                              {systemConfigStatus?.integrationChecks?.proactive
                                ?.error ||
                                systemConfigStatus?.integrations?.proactiveBaseUrl ||
                                'Proactive base URL unavailable'}
                            </div>
                          </div>
                          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                            <div className="text-xs uppercase tracking-[0.2em] text-white/45">
                              Consciousness
                            </div>
                            <div className="mt-2 text-2xl font-semibold text-white">
                              {systemConfigStatus?.integrationChecks?.consciousness
                                ?.replycaResolved
                                ? 'Scheduled'
                                : 'Blocked'}
                            </div>
                            <div className="mt-2 text-xs text-white/45">
                              {systemConfigStatus?.integrationChecks?.consciousness
                                ?.cycles?.gim?.lastError ||
                                systemConfigStatus?.integrationChecks
                                  ?.consciousness?.cycles?.rem?.lastError ||
                                `GIM ${systemConfigStatus?.integrationChecks?.consciousness?.gimCron || 'n/a'} • REM ${systemConfigStatus?.integrationChecks?.consciousness?.remCron || 'n/a'}`}
                            </div>
                          </div>
                          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                            <div className="text-xs uppercase tracking-[0.2em] text-white/45">
                              Repo discovery
                            </div>
                            <div className="mt-2 text-2xl font-semibold text-white">
                              {systemConfigStatus?.integrationChecks
                                ?.repositoryDiscovery?.isScheduled
                                ? 'Scheduled'
                                : 'Idle'}
                            </div>
                            <div className="mt-2 text-xs text-white/45">
                              {systemConfigStatus?.integrationChecks
                                ?.repositoryDiscovery?.lastError ||
                                `${systemConfigStatus?.integrationChecks?.repositoryDiscovery?.cron || 'n/a'} • ${systemConfigStatus?.integrationChecks?.repositoryDiscovery?.maxReposPerCycle || 0} repos/cycle`}
                            </div>
                          </div>
                        </div>

                        {systemConfigStatus?.warnings?.length ? (
                          <div className="mt-4 space-y-2">
                            {systemConfigStatus.warnings
                              .slice(0, 4)
                              .map((warning) => (
                                <div
                                  key={warning}
                                  className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100"
                                >
                                  {warning}
                                </div>
                              ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl shadow-[0_0_40px_rgba(255,0,170,0.08)]">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h4 className="text-lg font-semibold text-white">
                              Feature discovery
                            </h4>
                            <p className="mt-2 text-sm text-white/65">
                              See what the proactive system pulled in from GitHub
                              and which features it currently recommends.
                            </p>
                          </div>
                          <button
                            onClick={() => void refreshFeatureDiscovery()}
                            disabled={isFeatureDiscoveryLoading}
                            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/85 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <RefreshCw
                              className={`h-4 w-4 ${
                                isFeatureDiscoveryLoading
                                  ? 'animate-spin'
                                  : ''
                              }`}
                            />
                            Refresh
                          </button>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                            <div className="text-xs uppercase tracking-[0.2em] text-white/45">
                              Discovered
                            </div>
                            <div className="mt-2 text-2xl font-semibold text-white">
                              {discoveredFeatures.length}
                            </div>
                          </div>
                          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                            <div className="text-xs uppercase tracking-[0.2em] text-white/45">
                              Recommended
                            </div>
                            <div className="mt-2 text-2xl font-semibold text-white">
                              {recommendedFeatures.length}
                            </div>
                          </div>
                        </div>

                        {featureDiscoveryError ? (
                          <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                            {featureDiscoveryError}
                          </div>
                        ) : null}

                        <div className="mt-5 space-y-5">
                          <div>
                            <div className="flex items-center justify-between">
                              <h5 className="text-sm font-medium text-white/85">
                                Top recommendations
                              </h5>
                              <span className="text-xs text-white/40">
                                Ready to review
                              </span>
                            </div>

                            <div className="mt-3 space-y-3">
                              {recommendedFeatures.length > 0 ? (
                                recommendedFeatures.map((feature) => (
                                  <div
                                    key={`recommended-${feature.id}`}
                                    className="rounded-xl border border-[#ff00aa]/15 bg-[#ff00aa]/5 px-4 py-3"
                                  >
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-sm font-semibold text-white">
                                        {feature.name}
                                      </span>
                                      <span className="rounded-full border border-[#ff00aa]/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[#ff9dda]">
                                        {formatFeatureStatus(feature.status)}
                                      </span>
                                      <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/55">
                                        {formatFeatureSource(feature.source)}
                                      </span>
                                    </div>
                                    <p className="mt-2 text-sm text-white/70">
                                      {feature.description}
                                    </p>
                                    <div className="mt-2 text-xs text-white/45">
                                      Relevance {feature.relevance}/10 · Value{' '}
                                      {feature.estimatedValue}/10
                                      {feature.repositoryExample
                                        ? ` · Inspired by ${feature.repositoryExample}`
                                        : ''}
                                    </div>
                                    {renderFeatureActions(feature, 'pink')}
                                  </div>
                                ))
                              ) : (
                                <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/55">
                                  No recommended features yet.
                                </div>
                              )}
                            </div>
                          </div>

                          <div>
                            <div className="flex items-center justify-between">
                              <h5 className="text-sm font-medium text-white/85">
                                Recently discovered
                              </h5>
                              <span className="text-xs text-white/40">
                                Showing top 5
                              </span>
                            </div>

                            <div className="mt-3 space-y-3">
                              {discoveredFeatures.slice(0, 5).map((feature) => (
                                <div
                                  key={`discovered-${feature.id}`}
                                  className="rounded-xl border border-white/10 bg-black/20 px-4 py-3"
                                >
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-semibold text-white">
                                      {feature.name}
                                    </span>
                                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/55">
                                      {formatFeatureStatus(feature.status)}
                                    </span>
                                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/55">
                                      {feature.implementationComplexity}
                                    </span>
                                  </div>
                                   <div className="mt-2 text-xs text-white/45">
                                     Popularity {feature.popularity}/10 ·
                                     Relevance {feature.relevance}/10
                                     {feature.repositoryExample
                                       ? ` · ${feature.repositoryExample}`
                                       : ''}
                                   </div>
                                   {feature.tags.length > 0 ? (
                                     <div className="mt-2 flex flex-wrap gap-2">
                                      {feature.tags.map((tag) => (
                                        <span
                                          key={`${feature.id}-${tag}`}
                                          className="rounded-full border border-[#00f2ff]/20 bg-[#00f2ff]/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[#9ef6ff]"
                                        >
                                          {tag}
                                        </span>
                                       ))}
                                     </div>
                                   ) : null}
                                   {renderFeatureActions(feature, 'cyan')}
                                 </div>
                               ))}

                              {discoveredFeatures.length === 0 &&
                              !isFeatureDiscoveryLoading &&
                              !featureDiscoveryError ? (
                                <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/55">
                                  No discovered features are stored yet.
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
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
                    onClick={() => setShowBrowserPip(!showBrowserPip)}
                    className={`rounded-xl border px-3 py-2 text-left transition-all ${
                      showBrowserPip
                        ? 'border-violet-400/40 bg-violet-500/10 text-violet-200'
                        : 'border-white/10 bg-white/5 hover:border-white/20'
                    }`}
                  >
                    Browser PiP
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

      {showBrowserPip && (
        <div className="fixed bottom-8 right-6 z-[95] w-[420px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-3xl border border-white/10 bg-[#0c021a]/70 shadow-[0_0_45px_rgba(124,58,237,0.18)] backdrop-blur-2xl">
          <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.04] px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium text-white/85">
              <PictureInPicture2 className="h-4 w-4 text-violet-300" />
              Browser PiP
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.open(browserUrl, '_blank', 'noopener,noreferrer')}
                className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/65 transition hover:bg-white/10 hover:text-white"
                title="Open in a full tab"
              >
                <ExternalLink className="h-4 w-4" />
              </button>
              <button
                onClick={() => setShowBrowserPip(false)}
                className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/65 transition hover:bg-white/10 hover:text-white"
                title="Close PiP browser"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="space-y-3 p-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <input
                  value={browserDraftUrl}
                  onChange={(event) => setBrowserDraftUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      setBrowserUrl(normalizeBrowserUrl(browserDraftUrl));
                    }
                  }}
                  placeholder="https://example.com"
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-10 pr-3 text-sm text-white outline-none transition focus:border-violet-400/40"
                />
              </div>
              <button
                onClick={() => setBrowserUrl(normalizeBrowserUrl(browserDraftUrl))}
                className="rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-100 transition hover:bg-violet-500/20"
              >
                Go
              </button>
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/40">
              <iframe
                src={browserUrl}
                title="Browser PiP"
                className="h-[260px] w-full bg-white"
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>

            <p className="text-xs text-white/50">
              This mini-browser works best for sites that allow iframe embedding.
              Some pages will block PiP previews and should be opened in a full tab.
            </p>
          </div>
        </div>
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

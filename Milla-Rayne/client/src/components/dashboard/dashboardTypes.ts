import type { FusionTelemetrySnapshot } from '@shared/swarm';

export type { FusionTelemetrySnapshot };

export interface ProactiveFeature {
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

export interface SystemConfigStatus {
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
    localModel?: {
      enabled: boolean;
      preferLocal: boolean;
      configured: boolean;
      host: string;
      requestedModel: string;
      available: boolean;
      activeModel: string | null;
    };
  };
}

export interface ConsciousnessState {
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

export interface SandboxFeatureSummary {
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

export interface SandboxSummary {
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

export interface SandboxReadiness {
  ready: boolean;
  reasons: string[];
  featuresApproved: number;
  featuresPending: number;
}

export interface CollaborationSuggestion {
  feature_name: string;
  reasoning: string;
  code_snippet: string;
  pr_title: string;
}

export interface CollaborationReport {
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

export interface CollaborationSchedulerState {
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

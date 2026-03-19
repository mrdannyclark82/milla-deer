import cron, { type ScheduledTask } from 'node-cron';
import { promises as fs } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { runRepositoryDiscoveryCycle, getRepositoryDiscoverySchedulerStatus } from './repositoryDiscoveryScheduler';
import {
  getDiscoveredFeatures,
  getTopFeatureRecommendations,
  upsertDiscoveredFeature,
} from './featureDiscoveryService';

const execFileAsync = promisify(execFile);

interface CollaborationSettings {
  enabled: boolean;
  cron: string;
  timezone: string;
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
    scheduler: ReturnType<typeof getRepositoryDiscoverySchedulerStatus>;
  };
  sarii: {
    success: boolean;
    suggestion: CollaborationSuggestion | null;
    syncedFeatureId: string | null;
    error: string | null;
  };
}

const DEFAULT_SETTINGS: CollaborationSettings = {
  enabled: true,
  cron: '0 8 * * *',
  timezone: 'America/Chicago',
};

const STATE_FILE = path.join(
  process.cwd(),
  'memory',
  'collaboration_cycle.json'
);

let settings: CollaborationSettings = { ...DEFAULT_SETTINGS };
let scheduledTask: ScheduledTask | null = null;
let isInitialized = false;
let isRunning = false;
let lastRunAt: number | null = null;
let lastSuccessAt: number | null = null;
let lastError: string | null = null;
let totalRuns = 0;
let successfulRuns = 0;
let latestReport: CollaborationReport | null = null;

async function loadState(): Promise<void> {
  try {
    const raw = await fs.readFile(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    settings = {
      enabled:
        typeof parsed.settings?.enabled === 'boolean'
          ? parsed.settings.enabled
          : DEFAULT_SETTINGS.enabled,
      cron: parsed.settings?.cron || DEFAULT_SETTINGS.cron,
      timezone: parsed.settings?.timezone || DEFAULT_SETTINGS.timezone,
    };
    latestReport = parsed.latestReport || null;
    lastRunAt = parsed.lastRunAt || null;
    lastSuccessAt = parsed.lastSuccessAt || null;
    lastError = parsed.lastError || null;
    totalRuns = parsed.totalRuns || 0;
    successfulRuns = parsed.successfulRuns || 0;
  } catch {
    settings = { ...DEFAULT_SETTINGS };
  }
}

async function saveState(): Promise<void> {
  await fs.writeFile(
    STATE_FILE,
    JSON.stringify(
      {
        settings,
        latestReport,
        lastRunAt,
        lastSuccessAt,
        lastError,
        totalRuns,
        successfulRuns,
      },
      null,
      2
    )
  );
}

function resolveRepoRoot(): string {
  return path.resolve(process.cwd(), '..');
}

function resolveSariiScriptPath(): string {
  return path.join(resolveRepoRoot(), 'SARIi', 'milla_auto.py');
}

async function runSariiPlanner(): Promise<CollaborationReport['sarii']> {
  const repoRoot = resolveRepoRoot();
  const scriptPath = resolveSariiScriptPath();

  try {
    const { stdout } = await execFileAsync(
      'python3',
      [
        scriptPath,
        '--json',
        '--no-execute',
        '--repo-path',
        repoRoot,
        '--project-label',
        'Milla-Deer',
      ],
      {
        cwd: path.dirname(scriptPath),
        timeout: 120000,
        maxBuffer: 1024 * 1024,
      }
    );

    const trimmed = stdout.trim();
    const jsonStart = trimmed.indexOf('{');
    const parsed = JSON.parse(jsonStart >= 0 ? trimmed.slice(jsonStart) : trimmed);

    return {
      success: true,
      suggestion: parsed,
      syncedFeatureId: null,
      error: null,
    };
  } catch (error) {
    return {
      success: false,
      suggestion: null,
      syncedFeatureId: null,
      error: error instanceof Error ? error.message : 'Unknown SARIi planner error',
    };
  }
}

function estimateSuggestionComplexity(
  suggestion: CollaborationSuggestion
): 'low' | 'medium' | 'high' {
  const combinedText = `${suggestion.feature_name} ${suggestion.reasoning} ${suggestion.code_snippet}`.toLowerCase();

  if (
    combinedText.includes('fallback') ||
    combinedText.includes('report') ||
    combinedText.includes('schedule')
  ) {
    return 'low';
  }

  if (
    combinedText.includes('android') ||
    combinedText.includes('executorch') ||
    combinedText.includes('inference') ||
    combinedText.includes('pipeline')
  ) {
    return 'high';
  }

  return 'medium';
}

async function syncSariiSuggestion(
  sarii: CollaborationReport['sarii']
): Promise<CollaborationReport['sarii']> {
  if (!sarii.success || !sarii.suggestion) {
    return sarii;
  }

  try {
    const syncedFeature = await upsertDiscoveredFeature({
      name: sarii.suggestion.feature_name,
      description: `${sarii.suggestion.reasoning} (Suggested by the collaboration cycle planner: ${sarii.suggestion.pr_title})`,
      source: 'user_pattern',
      repositoryExample: 'SARIi collaboration planner',
      popularity: 6,
      relevance: 9,
      implementationComplexity: estimateSuggestionComplexity(sarii.suggestion),
      estimatedValue: 8,
      status: 'discovered',
      tags: ['collaboration', 'planner', 'sarii'],
    });

    return {
      ...sarii,
      syncedFeatureId: syncedFeature.id,
    };
  } catch (error) {
    return {
      ...sarii,
      success: false,
      syncedFeatureId: null,
      error:
        error instanceof Error
          ? error.message
          : 'Unable to sync SARIi recommendation into feature discovery',
    };
  }
}

function scheduleTask(): void {
  scheduledTask?.stop();
  scheduledTask = null;

  if (!settings.enabled) {
    return;
  }

  if (!cron.validate(settings.cron)) {
    lastError = `Invalid collaboration cron expression: ${settings.cron}`;
    return;
  }

  scheduledTask = cron.schedule(
    settings.cron,
    async () => {
      await runCollaborationCycle();
    },
    {
      timezone: settings.timezone,
    }
  );
}

export async function runCollaborationCycle(): Promise<CollaborationReport | null> {
  if (isRunning) {
    return latestReport;
  }

  isRunning = true;
  totalRuns += 1;
  lastRunAt = Date.now();
  lastError = null;

  try {
    await runRepositoryDiscoveryCycle();
    const syncedSarii = await syncSariiSuggestion(await runSariiPlanner());
    const discovered = getDiscoveredFeatures();
    const recommended = getTopFeatureRecommendations(3);

    latestReport = {
      generatedAt: Date.now(),
      repoPath: resolveRepoRoot(),
      proactive: {
        discoveredCount: discovered.length,
        recommendedCount: recommended.length,
        topRecommendations: recommended.map((feature) => feature.name),
        scheduler: getRepositoryDiscoverySchedulerStatus(),
      },
      sarii: syncedSarii,
    };

    successfulRuns += 1;
    lastSuccessAt = Date.now();
    await saveState();
    return latestReport;
  } catch (error) {
    lastError =
      error instanceof Error ? error.message : 'Unknown collaboration cycle error';
    await saveState();
    return latestReport;
  } finally {
    isRunning = false;
  }
}

export async function initializeCollaborationScheduler(): Promise<void> {
  if (isInitialized) {
    return;
  }

  await loadState();
  scheduleTask();
  isInitialized = true;
}

export async function updateCollaborationSchedule(
  updates: Partial<CollaborationSettings>
): Promise<void> {
  settings = {
    ...settings,
    ...updates,
  };

  scheduleTask();
  await saveState();
}

export function getCollaborationSchedulerStatus() {
  return {
    isInitialized,
    isScheduled: Boolean(scheduledTask),
    isRunning,
    settings,
    lastRunAt,
    lastSuccessAt,
    lastError,
    totalRuns,
    successfulRuns,
    latestReport,
  };
}

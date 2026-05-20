import cron, { type ScheduledTask } from 'node-cron';
import { config } from './config';
import {
  discoverFromGitHub,
  discoverFromUserPatterns,
} from './featureDiscoveryService';
import { getInteractionPatterns } from './userInteractionAnalyticsService';

let scheduledTask: ScheduledTask | null = null;
let isRunning = false;
let lastRunAt: number | null = null;
let lastSuccessAt: number | null = null;
let lastError: string | null = null;
let totalRuns = 0;
let successfulRuns = 0;

export async function runRepositoryDiscoveryCycle(): Promise<void> {
  if (isRunning) {
    console.log('[Repository Discovery Scheduler] Cycle already in progress');
    return;
  }

  isRunning = true;
  totalRuns += 1;
  lastRunAt = Date.now();
  lastError = null;
  console.log('[Repository Discovery Scheduler] Starting discovery cycle');

  try {
    const patterns = getInteractionPatterns();
    const githubFeatures = await discoverFromGitHub(
      config.repositoryDiscovery.maxReposPerCycle
    );
    const patternFeatures = await discoverFromUserPatterns(patterns);
    successfulRuns += 1;
    lastSuccessAt = Date.now();

    console.log(
      `[Repository Discovery Scheduler] Completed: ${githubFeatures.length} GitHub features, ${patternFeatures.length} pattern features`
    );
  } catch (error) {
    lastError =
      error instanceof Error ? error.message : 'Unknown discovery error';
    console.error(
      '[Repository Discovery Scheduler] Discovery cycle failed:',
      error
    );
  } finally {
    isRunning = false;
  }
}

export function initializeRepositoryDiscoveryScheduler(): void {
  if (scheduledTask) {
    return;
  }

  if (!config.repositoryDiscovery.enabled) {
    console.log('[Repository Discovery Scheduler] Disabled by config');
    return;
  }

  if (!cron.validate(config.repositoryDiscovery.cron)) {
    console.error(
      `[Repository Discovery Scheduler] Invalid cron expression: ${config.repositoryDiscovery.cron}`
    );
    return;
  }

  console.log(
    `[Repository Discovery Scheduler] Scheduling discovery: ${config.repositoryDiscovery.cron}`
  );

  scheduledTask = cron.schedule(config.repositoryDiscovery.cron, async () => {
    await runRepositoryDiscoveryCycle();
  });

  setTimeout(() => {
    void runRepositoryDiscoveryCycle();
  }, config.repositoryDiscovery.initialRunDelayMs);
}

export function stopRepositoryDiscoveryScheduler(): void {
  scheduledTask?.stop();
  scheduledTask = null;
}

export function getRepositoryDiscoverySchedulerStatus() {
  return {
    isScheduled: Boolean(scheduledTask),
    isRunning,
    cron: config.repositoryDiscovery.cron,
    enabled: config.repositoryDiscovery.enabled,
    maxReposPerCycle: config.repositoryDiscovery.maxReposPerCycle,
    lastRunAt,
    lastSuccessAt,
    lastError,
    totalRuns,
    successfulRuns,
  };
}

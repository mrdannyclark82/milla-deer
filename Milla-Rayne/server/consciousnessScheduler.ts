import { promisify } from 'util';
import { execFile } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cron, { type ScheduledTask } from 'node-cron';
import { config } from './config';

const execFileAsync = promisify(execFile);
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

type ConsciousnessCycle = 'gim' | 'rem';

interface CycleStatus {
  lastRunAt: number | null;
  lastSuccessAt: number | null;
  lastError: string | null;
  totalRuns: number;
  successfulRuns: number;
}

let gimTask: ScheduledTask | null = null;
let remTask: ScheduledTask | null = null;
let isInitialized = false;

const cycleStatus: Record<ConsciousnessCycle, CycleStatus> = {
  gim: {
    lastRunAt: null,
    lastSuccessAt: null,
    lastError: null,
    totalRuns: 0,
    successfulRuns: 0,
  },
  rem: {
    lastRunAt: null,
    lastSuccessAt: null,
    lastError: null,
    totalRuns: 0,
    successfulRuns: 0,
  },
};

function resolveReplycaRoot(): string | null {
  const candidates = [
    config.consciousness.replycaRoot,
    path.resolve(process.cwd(), 'ReplycA'),
    path.resolve(process.cwd(), '../ReplycA'),
    path.resolve(MODULE_DIR, '../ReplycA'),
    path.resolve(MODULE_DIR, '../../ReplycA'),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function runCycle(cycle: ConsciousnessCycle): Promise<boolean> {
  const status = cycleStatus[cycle];
  status.totalRuns += 1;
  status.lastRunAt = Date.now();
  status.lastError = null;

  const replycaRoot = resolveReplycaRoot();
  if (!replycaRoot) {
    status.lastError = 'ReplycA root could not be resolved';
    console.error(`[Consciousness Scheduler] ${status.lastError}`);
    return false;
  }

  const scriptPath = path.join(replycaRoot, 'run_cycle.py');
  if (!existsSync(scriptPath)) {
    status.lastError = `Missing ReplycA cycle runner at ${scriptPath}`;
    console.error(`[Consciousness Scheduler] ${status.lastError}`);
    return false;
  }

  try {
    const { stdout, stderr } = await execFileAsync(
      config.consciousness.pythonExecutable,
      [scriptPath, cycle],
      {
        cwd: replycaRoot,
        timeout: config.consciousness.executionTimeoutMs,
        maxBuffer: 1024 * 1024,
      }
    );

    if (stderr?.trim()) {
      console.warn(
        `[Consciousness Scheduler] ${cycle.toUpperCase()} stderr: ${stderr.trim()}`
      );
    }

    const rawOutput = stdout.trim();
    let payload: { success?: boolean; message?: string } | null = null;
    if (rawOutput) {
      const lastLine = rawOutput.split('\n').at(-1) || rawOutput;
      payload = JSON.parse(lastLine);
    }

    if (!payload?.success) {
      status.lastError =
        payload?.message || `${cycle.toUpperCase()} cycle failed without output`;
      console.error(
        `[Consciousness Scheduler] ${cycle.toUpperCase()} cycle failed: ${status.lastError}`
      );
      return false;
    }

    status.successfulRuns += 1;
    status.lastSuccessAt = Date.now();
    console.log(
      `[Consciousness Scheduler] ${cycle.toUpperCase()} cycle complete: ${payload.message || 'ok'}`
    );
    return true;
  } catch (error) {
    status.lastError =
      error instanceof Error ? error.message : 'Unknown scheduler error';
    console.error(
      `[Consciousness Scheduler] ${cycle.toUpperCase()} cycle error:`,
      error
    );
    return false;
  }
}

function scheduleCycle(
  cycle: ConsciousnessCycle,
  enabled: boolean,
  cronExpression: string
): ScheduledTask | null {
  if (!enabled) {
    console.log(
      `[Consciousness Scheduler] ${cycle.toUpperCase()} cycle disabled by config`
    );
    return null;
  }

  if (!cron.validate(cronExpression)) {
    console.error(
      `[Consciousness Scheduler] Invalid ${cycle.toUpperCase()} cron expression: ${cronExpression}`
    );
    return null;
  }

  console.log(
    `[Consciousness Scheduler] Scheduling ${cycle.toUpperCase()} cycle: ${cronExpression}`
  );

  return cron.schedule(cronExpression, async () => {
    await runCycle(cycle);
  });
}

export function initializeConsciousnessScheduler(): void {
  if (isInitialized) {
    return;
  }

  gimTask = scheduleCycle(
    'gim',
    config.consciousness.enableGimCycle,
    config.consciousness.gimCron
  );
  remTask = scheduleCycle(
    'rem',
    config.consciousness.enableRemCycle,
    config.consciousness.remCron
  );

  isInitialized = true;
}

export function stopConsciousnessScheduler(): void {
  gimTask?.stop();
  remTask?.stop();
  gimTask = null;
  remTask = null;
  isInitialized = false;
}

export async function triggerConsciousnessCycle(
  cycle: ConsciousnessCycle
): Promise<boolean> {
  return runCycle(cycle);
}

export function getConsciousnessSchedulerStatus() {
  const replycaRoot = resolveReplycaRoot();
  return {
    isInitialized,
    replycaRoot,
    replycaResolved: Boolean(replycaRoot),
    pythonExecutable: config.consciousness.pythonExecutable,
    gimCron: config.consciousness.gimCron,
    remCron: config.consciousness.remCron,
    gimEnabled: config.consciousness.enableGimCycle,
    remEnabled: config.consciousness.enableRemCycle,
    cycles: cycleStatus,
  };
}

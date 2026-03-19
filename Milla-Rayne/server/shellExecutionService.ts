import { EventEmitter } from 'events';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { config } from './config';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, '..', '..');

export interface AllowedShellCommand {
  id: string;
  label: string;
  description: string;
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
}

export type ShellCommandRunStatus =
  | 'queued'
  | 'running'
  | 'cancelling'
  | 'completed'
  | 'failed'
  | 'timed_out'
  | 'cancelled'
  | 'rejected';

export interface ShellCommandRunRecord {
  runId: string;
  commandId: string;
  label: string;
  command: string;
  status: ShellCommandRunStatus;
  startedAt: number;
  finishedAt: number | null;
  durationMs: number | null;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error: string | null;
}

export interface ShellRunEvent {
  type: 'snapshot' | 'stdout' | 'stderr' | 'status';
  run: ShellCommandRunRecord;
}

export interface ShellRunnerSummary {
  enabled: boolean;
  requiresAdminToken: boolean;
  activeRunId: string | null;
  queuedRunIds: string[];
  queueLength: number;
  availableCommands: Array<
    Pick<AllowedShellCommand, 'id' | 'label' | 'description'> & { cwd: string }
  >;
}

export interface ShellRunnerStatus extends ShellRunnerSummary {
  activeRun: ShellCommandRunRecord | null;
  queuedRuns: ShellCommandRunRecord[];
  recentRuns: ShellCommandRunRecord[];
}

const MAX_OUTPUT_CHARS = 12000;
const MAX_RECENT_RUNS = 10;

const allowedCommands: AllowedShellCommand[] = [
  {
    id: 'repo-pwd',
    label: 'Repository path',
    description: 'Show the current repository working directory.',
    command: 'pwd',
    args: [],
    cwd: REPO_ROOT,
    timeoutMs: 30 * 1000,
  },
  {
    id: 'repo-list',
    label: 'Repository listing',
    description: 'List top-level repository files without paging.',
    command: 'ls',
    args: ['-la'],
    cwd: REPO_ROOT,
    timeoutMs: 30 * 1000,
  },
  {
    id: 'repo-tree',
    label: 'Repository tree',
    description:
      'Show a compact repository tree up to two levels deep, skipping .git and node_modules.',
    command: 'find',
    args: [
      '.',
      '-maxdepth',
      '2',
      '-mindepth',
      '1',
      '-not',
      '-path',
      './.git*',
      '-not',
      '-path',
      './node_modules*',
      '-printf',
      '%y %P\n',
    ],
    cwd: REPO_ROOT,
    timeoutMs: 60 * 1000,
  },
  {
    id: 'android-list',
    label: 'Android directory',
    description: 'List files in the Android workspace directory.',
    command: 'ls',
    args: ['-la'],
    cwd: path.join(REPO_ROOT, 'android'),
    timeoutMs: 30 * 1000,
  },
  {
    id: 'workspace-check',
    label: 'Workspace check',
    description: 'Run the workspace TypeScript smoke check.',
    command: 'npm',
    args: ['run', 'check'],
    cwd: REPO_ROOT,
    timeoutMs: 10 * 60 * 1000,
  },
  {
    id: 'workspace-lint',
    label: 'Workspace lint',
    description: 'Run the workspace lint task.',
    command: 'npm',
    args: ['run', 'lint'],
    cwd: REPO_ROOT,
    timeoutMs: 10 * 60 * 1000,
  },
  {
    id: 'workspace-build',
    label: 'Workspace build',
    description: 'Run the workspace build.',
    command: 'npm',
    args: ['run', 'build'],
    cwd: REPO_ROOT,
    timeoutMs: 15 * 60 * 1000,
  },
  {
    id: 'workspace-test',
    label: 'Workspace test',
    description: 'Run the current workspace smoke test suite.',
    command: 'npm',
    args: ['test'],
    cwd: REPO_ROOT,
    timeoutMs: 15 * 60 * 1000,
  },
  {
    id: 'git-status',
    label: 'Git status',
    description: 'Show the current git status without paging.',
    command: 'git',
    args: ['--no-pager', 'status', '--short'],
    cwd: REPO_ROOT,
    timeoutMs: 60 * 1000,
  },
  {
    id: 'git-diff-stat',
    label: 'Git diff stat',
    description: 'Show a summarized git diff stat without paging.',
    command: 'git',
    args: ['--no-pager', 'diff', '--stat'],
    cwd: REPO_ROOT,
    timeoutMs: 60 * 1000,
  },
  {
    id: 'adb-devices',
    label: 'ADB devices',
    description: 'List attached Android devices through adb.',
    command: 'adb',
    args: ['devices', '-l'],
    cwd: REPO_ROOT,
    timeoutMs: 60 * 1000,
  },
  {
    id: 'adb-device-info',
    label: 'ADB device info',
    description: 'Read basic manufacturer, model, and Android version from the connected device.',
    command: 'adb',
    args: [
      'shell',
      'sh',
      '-c',
      'printf "manufacturer="; getprop ro.product.manufacturer; printf "model="; getprop ro.product.model; printf "android="; getprop ro.build.version.release',
    ],
    cwd: REPO_ROOT,
    timeoutMs: 60 * 1000,
  },
  {
    id: 'adb-network-info',
    label: 'ADB network info',
    description: 'Show network interfaces from the connected Android device.',
    command: 'adb',
    args: ['shell', 'ip', 'addr'],
    cwd: REPO_ROOT,
    timeoutMs: 60 * 1000,
  },
  {
    id: 'host-network-interfaces',
    label: 'Host network interfaces',
    description: 'Show network interfaces on the host machine.',
    command: 'ip',
    args: ['addr'],
    cwd: REPO_ROOT,
    timeoutMs: 60 * 1000,
  },
  {
    id: 'host-network-routes',
    label: 'Host network routes',
    description: 'Show the current host routing table.',
    command: 'ip',
    args: ['route'],
    cwd: REPO_ROOT,
    timeoutMs: 60 * 1000,
  },
  {
    id: 'host-listening-ports',
    label: 'Host listening ports',
    description: 'Show listening TCP ports on the host machine.',
    command: 'ss',
    args: ['-ltn'],
    cwd: REPO_ROOT,
    timeoutMs: 60 * 1000,
  },
];

let activeRun: ShellCommandRunRecord | null = null;
let activeProcess: ChildProcessWithoutNullStreams | null = null;
const queuedRuns: ShellCommandRunRecord[] = [];
const recentRuns: ShellCommandRunRecord[] = [];
const runIndex = new Map<string, ShellCommandRunRecord>();
const shellEvents = new EventEmitter();
shellEvents.setMaxListeners(100);

function cloneRun(run: ShellCommandRunRecord): ShellCommandRunRecord {
  return { ...run };
}

function trimOutput(value: string): string {
  if (value.length <= MAX_OUTPUT_CHARS) {
    return value;
  }

  return value.slice(0, MAX_OUTPUT_CHARS) + '\n...[output truncated]';
}

function rememberRun(run: ShellCommandRunRecord) {
  recentRuns.unshift(cloneRun(run));
  if (recentRuns.length > MAX_RECENT_RUNS) {
    recentRuns.length = MAX_RECENT_RUNS;
  }
}

function emitRunEvent(type: ShellRunEvent['type'], run: ShellCommandRunRecord) {
  shellEvents.emit(`run:${run.runId}`, {
    type,
    run: cloneRun(run),
  } satisfies ShellRunEvent);
}

function finalizeRun(run: ShellCommandRunRecord) {
  if (activeRun?.runId === run.runId) {
    activeRun = null;
    activeProcess = null;
  }

  run.stdout = trimOutput(run.stdout);
  run.stderr = trimOutput(run.stderr);
  runIndex.set(run.runId, cloneRun(run));
  rememberRun(run);
  emitRunEvent('status', run);
}

function buildRejectedRun(commandId: string, label: string, command: string, error: string) {
  const run: ShellCommandRunRecord = {
    runId: randomUUID(),
    commandId,
    label,
    command,
    status: 'rejected',
    startedAt: Date.now(),
    finishedAt: Date.now(),
    durationMs: 0,
    exitCode: null,
    stdout: '',
    stderr: '',
    error,
  };
  runIndex.set(run.runId, cloneRun(run));
  rememberRun(run);
  emitRunEvent('status', run);
  return run;
}

function startNextQueuedRun() {
  if (activeRun || queuedRuns.length === 0) {
    return;
  }

  const run = queuedRuns.shift();
  if (!run) {
    return;
  }

  const definition = allowedCommands.find((command) => command.id === run.commandId);
  if (!definition) {
    const rejected = buildRejectedRun(
      run.commandId,
      run.label,
      run.command,
      `Command "${run.commandId}" is no longer in the allowlist.`
    );
    runIndex.set(rejected.runId, cloneRun(rejected));
    startNextQueuedRun();
    return;
  }

  activeRun = run;
  run.status = 'running';
  runIndex.set(run.runId, cloneRun(run));
  emitRunEvent('status', run);

  const child = spawn(definition.command, definition.args, {
    cwd: definition.cwd,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
  activeProcess = child;

  let timedOut = false;
  let settled = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    run.status = 'timed_out';
    run.error = `Command timed out after ${definition.timeoutMs}ms.`;
    runIndex.set(run.runId, cloneRun(run));
    emitRunEvent('status', run);
    child.kill('SIGTERM');
  }, definition.timeoutMs);

  child.stdout.on('data', (chunk) => {
    run.stdout += chunk.toString();
    runIndex.set(run.runId, cloneRun(run));
    emitRunEvent('stdout', run);
  });

  child.stderr.on('data', (chunk) => {
    run.stderr += chunk.toString();
    runIndex.set(run.runId, cloneRun(run));
    emitRunEvent('stderr', run);
  });

  child.on('error', (error) => {
    if (settled) {
      return;
    }
    settled = true;
    clearTimeout(timeout);
    run.status = 'failed';
    run.error = error.message;
    run.finishedAt = Date.now();
    run.durationMs = run.finishedAt - run.startedAt;
    finalizeRun(run);
    startNextQueuedRun();
  });

  child.on('close', (code) => {
    if (settled) {
      return;
    }
    settled = true;
    clearTimeout(timeout);
    run.exitCode = code;
    run.finishedAt = Date.now();
    run.durationMs = run.finishedAt - run.startedAt;

    if (timedOut) {
      run.status = 'timed_out';
    } else if (run.status === 'cancelling') {
      run.status = 'cancelled';
      run.error = run.error || 'Command cancelled by user.';
    } else if (code === 0) {
      run.status = 'completed';
    } else {
      run.status = 'failed';
      run.error = run.error || `Command exited with code ${code}.`;
    }

    finalizeRun(run);
    startNextQueuedRun();
  });
}

export function getShellRunnerSummary(): ShellRunnerSummary {
  return {
    enabled: config.shell.enabled,
    requiresAdminToken: false,
    activeRunId: activeRun?.runId || null,
    queuedRunIds: queuedRuns.map((run) => run.runId),
    queueLength: queuedRuns.length,
    availableCommands: allowedCommands.map((command) => ({
      id: command.id,
      label: command.label,
      description: command.description,
      cwd: command.cwd,
    })),
  };
}

export function getShellRunnerStatus(): ShellRunnerStatus {
  return {
    ...getShellRunnerSummary(),
    activeRun: activeRun ? cloneRun(activeRun) : null,
    queuedRuns: queuedRuns.map(cloneRun),
    recentRuns: recentRuns.map(cloneRun),
  };
}

export function getShellRun(runId: string): ShellCommandRunRecord | null {
  const run = runIndex.get(runId);
  return run ? cloneRun(run) : null;
}

export function subscribeToShellRun(
  runId: string,
  listener: (event: ShellRunEvent) => void
): () => void {
  const channel = `run:${runId}`;
  shellEvents.on(channel, listener);
  return () => {
    shellEvents.off(channel, listener);
  };
}

export async function enqueueAllowedShellCommand(
  commandId: string
): Promise<ShellCommandRunRecord> {
  const definition = allowedCommands.find((command) => command.id === commandId);

  if (!config.shell.enabled) {
    return buildRejectedRun(
      commandId,
      definition?.label || commandId,
      definition ? `${definition.command} ${definition.args.join(' ')}` : commandId,
      'Shell runner is disabled. Set ENABLE_SHELL_RUNNER=true to enable it.'
    );
  }

  if (!definition) {
    return buildRejectedRun(
      commandId,
      commandId,
      commandId,
      `Command "${commandId}" is not in the allowlist.`
    );
  }

  const run: ShellCommandRunRecord = {
    runId: randomUUID(),
    commandId: definition.id,
    label: definition.label,
    command: `${definition.command} ${definition.args.join(' ')}`,
    status: activeRun ? 'queued' : 'queued',
    startedAt: Date.now(),
    finishedAt: null,
    durationMs: null,
    exitCode: null,
    stdout: '',
    stderr: '',
    error: null,
  };

  queuedRuns.push(run);
  runIndex.set(run.runId, cloneRun(run));
  emitRunEvent('status', run);
  startNextQueuedRun();

  return getShellRun(run.runId) || cloneRun(run);
}

export async function cancelShellCommand(
  runId?: string
): Promise<ShellCommandRunRecord | null> {
  if (runId && activeRun?.runId === runId) {
    activeRun.status = 'cancelling';
    activeRun.error = 'Cancellation requested by user.';
    runIndex.set(activeRun.runId, cloneRun(activeRun));
    emitRunEvent('status', activeRun);
    activeProcess?.kill('SIGTERM');
    return cloneRun(activeRun);
  }

  if (!runId && activeRun) {
    activeRun.status = 'cancelling';
    activeRun.error = 'Cancellation requested by user.';
    runIndex.set(activeRun.runId, cloneRun(activeRun));
    emitRunEvent('status', activeRun);
    activeProcess?.kill('SIGTERM');
    return cloneRun(activeRun);
  }

  const queuedIndex = queuedRuns.findIndex((run) => run.runId === runId);
  if (queuedIndex >= 0) {
    const [queuedRun] = queuedRuns.splice(queuedIndex, 1);
    queuedRun.status = 'cancelled';
    queuedRun.error = 'Queued command cancelled before execution.';
    queuedRun.finishedAt = Date.now();
    queuedRun.durationMs = queuedRun.finishedAt - queuedRun.startedAt;
    runIndex.set(queuedRun.runId, cloneRun(queuedRun));
    rememberRun(queuedRun);
    emitRunEvent('status', queuedRun);
    return cloneRun(queuedRun);
  }

  return null;
}

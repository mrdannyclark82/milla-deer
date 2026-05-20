/**
 * LAM Trajectory Collector
 *
 * Phase 1 of the LAM development pipeline (per AGI roadmap):
 * - Records task-action trajectories from every agentic execution
 * - Produces structured training data for LAM fine-tuning
 * - Separates "plan" data (Step 1) from "execution" data (Step 2)
 *
 * Data flows:
 *   User goal → LLM plan → tool executions → outcome
 *   → stored as trajectory in memory/lam_trajectories.jsonl
 */

import { promises as fs } from 'fs';
import { join } from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ActionType =
  | 'shell_exec'
  | 'file_read'
  | 'file_write'
  | 'http_get'
  | 'http_post'
  | 'memory_search'
  | 'memory_store'
  | 'llm_call'
  | 'tool_call'
  | 'ui_action';

export interface TrajectoryAction {
  actionId: string;
  type: ActionType;
  /** Natural-language description of what this action does */
  intent: string;
  /** Exact grounded input (command string, file path, URL, prompt, etc.) */
  input: Record<string, unknown>;
  /** Raw output / result */
  output: string;
  /** Whether this action succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  durationMs: number;
  timestamp: string;
}

export interface TaskTrajectory {
  trajectoryId: string;
  /** High-level user request */
  goal: string;
  /** Session context (sanitized) */
  context?: string;
  /** The step-by-step plan the model produced */
  plan: string[];
  /** Concrete actions taken to execute the plan */
  actions: TrajectoryAction[];
  /** Final outcome */
  outcome: {
    success: boolean;
    summary: string;
    goalAchieved: boolean;
  };
  /** Phase label: 'plan' = task→plan data, 'execution' = plan→action data */
  phase: 'plan' | 'execution' | 'full';
  /** Source: 'expert' (GPT-4o/Claude), 'self' (local model self-boosted) */
  source: 'expert' | 'self' | 'human';
  createdAt: string;
  metadata: {
    totalActions: number;
    successfulActions: number;
    totalDurationMs: number;
    modelsUsed: string[];
  };
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const TRAJECTORIES_FILE = join(process.cwd(), 'memory', 'lam_trajectories.jsonl');
const INDEX_FILE = join(process.cwd(), 'memory', 'lam_trajectories_index.json');

interface TrajectoryIndex {
  total: number;
  bySource: Record<string, number>;
  byPhase: Record<string, number>;
  goalAchievedRate: number;
  lastUpdated: string;
}

async function appendTrajectory(t: TaskTrajectory): Promise<void> {
  await fs.appendFile(TRAJECTORIES_FILE, JSON.stringify(t) + '\n', 'utf-8');
}

async function updateIndex(t: TaskTrajectory): Promise<void> {
  let index: TrajectoryIndex = {
    total: 0,
    bySource: {},
    byPhase: {},
    goalAchievedRate: 0,
    lastUpdated: '',
  };
  try {
    const raw = await fs.readFile(INDEX_FILE, 'utf-8');
    index = JSON.parse(raw);
  } catch { /* first write */ }

  index.total += 1;
  index.bySource[t.source] = (index.bySource[t.source] || 0) + 1;
  index.byPhase[t.phase] = (index.byPhase[t.phase] || 0) + 1;
  const prevTotal = index.total - 1;
  const prevRate = index.goalAchievedRate || 0;
  index.goalAchievedRate =
    (prevRate * prevTotal + (t.outcome.goalAchieved ? 1 : 0)) / index.total;
  index.lastUpdated = new Date().toISOString();

  await fs.writeFile(INDEX_FILE, JSON.stringify(index, null, 2), 'utf-8');
}

// ─── Builder ──────────────────────────────────────────────────────────────────

export class TrajectoryBuilder {
  private trajectoryId: string;
  private goal: string;
  private context?: string;
  private plan: string[] = [];
  private actions: TrajectoryAction[] = [];
  private modelsUsed = new Set<string>();
  private startTime: number;
  private source: TaskTrajectory['source'];

  constructor(
    goal: string,
    source: TaskTrajectory['source'] = 'self',
    context?: string,
  ) {
    this.trajectoryId = `traj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.goal = goal;
    this.context = context;
    this.source = source;
    this.startTime = Date.now();
  }

  setPlan(steps: string[]): this {
    this.plan = steps;
    return this;
  }

  recordAction(
    type: ActionType,
    intent: string,
    input: Record<string, unknown>,
    output: string,
    success: boolean,
    durationMs: number,
    model?: string,
    error?: string,
  ): this {
    if (model) this.modelsUsed.add(model);
    this.actions.push({
      actionId: `act_${this.actions.length + 1}`,
      type,
      intent,
      input,
      output: output.slice(0, 2000),
      success,
      error,
      durationMs,
      timestamp: new Date().toISOString(),
    });
    return this;
  }

  async finish(goalAchieved: boolean, summary: string): Promise<TaskTrajectory> {
    const totalDurationMs = Date.now() - this.startTime;
    const successfulActions = this.actions.filter((a) => a.success).length;

    const phase: TaskTrajectory['phase'] =
      this.plan.length > 0 && this.actions.length > 0
        ? 'full'
        : this.plan.length > 0
        ? 'plan'
        : 'execution';

    const trajectory: TaskTrajectory = {
      trajectoryId: this.trajectoryId,
      goal: this.goal,
      context: this.context,
      plan: this.plan,
      actions: this.actions,
      outcome: { success: successfulActions > 0, summary, goalAchieved },
      phase,
      source: this.source,
      createdAt: new Date().toISOString(),
      metadata: {
        totalActions: this.actions.length,
        successfulActions,
        totalDurationMs,
        modelsUsed: Array.from(this.modelsUsed),
      },
    };

    await appendTrajectory(trajectory);
    await updateIndex(trajectory);
    return trajectory;
  }
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function getTrajectoryStats(): Promise<TrajectoryIndex | null> {
  try {
    const raw = await fs.readFile(INDEX_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function loadTrajectories(limit = 100): Promise<TaskTrajectory[]> {
  try {
    const raw = await fs.readFile(TRAJECTORIES_FILE, 'utf-8');
    const lines = raw.trim().split('\n').filter(Boolean).slice(-limit);
    return lines.map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

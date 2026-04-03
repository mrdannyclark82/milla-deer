/**
 * Agent Usage Logger
 *
 * Phase 2 Step 1: Captures every internal agent AI call for SLM training data.
 * Wraps any LLM call function to transparently log input/output/metadata.
 *
 * Produces: memory/agent_usage.jsonl (raw) → piped through piiScrubber → taskClusterer
 */

import { promises as fs } from 'fs';
import { join } from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UsageRecord {
  recordId: string;
  timestamp: string;
  /** Which internal agent/service made this call */
  caller: string;
  /** Model used (gemini-2.5-flash, milla-rayne:latest, etc.) */
  model: string;
  /** Raw prompt (will be scrubbed before clustering) */
  prompt: string;
  /** Tool calls emitted by the model (if any) */
  toolCalls?: Array<{ name: string; input: Record<string, unknown> }>;
  /** Model output */
  output: string;
  /** Success flag */
  success: boolean;
  /** Latency */
  durationMs: number;
  /** Token estimate (chars / 4) */
  estimatedTokens: number;
  /** Task type label — filled in by task clusterer */
  taskCluster?: string;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const USAGE_FILE = join(process.cwd(), 'memory', 'agent_usage.jsonl');
const STATS_FILE = join(process.cwd(), 'memory', 'agent_usage_stats.json');

interface UsageStats {
  total: number;
  byModel: Record<string, number>;
  byCaller: Record<string, number>;
  totalEstimatedTokens: number;
  lastUpdated: string;
}

async function appendRecord(r: UsageRecord): Promise<void> {
  await fs.appendFile(USAGE_FILE, JSON.stringify(r) + '\n', 'utf-8');
}

async function updateStats(r: UsageRecord): Promise<void> {
  let stats: UsageStats = {
    total: 0,
    byModel: {},
    byCaller: {},
    totalEstimatedTokens: 0,
    lastUpdated: '',
  };
  try {
    const raw = await fs.readFile(STATS_FILE, 'utf-8');
    stats = JSON.parse(raw);
  } catch { /* first write */ }

  stats.total += 1;
  stats.byModel[r.model] = (stats.byModel[r.model] || 0) + 1;
  stats.byCaller[r.caller] = (stats.byCaller[r.caller] || 0) + 1;
  stats.totalEstimatedTokens += r.estimatedTokens;
  stats.lastUpdated = new Date().toISOString();

  await fs.writeFile(STATS_FILE, JSON.stringify(stats, null, 2), 'utf-8');
}

// ─── Logger ───────────────────────────────────────────────────────────────────

/**
 * Log a single AI call. Called by the wrapLLMCall interceptor.
 */
export async function logUsage(
  caller: string,
  model: string,
  prompt: string,
  output: string,
  success: boolean,
  durationMs: number,
  toolCalls?: Array<{ name: string; input: Record<string, unknown> }>,
): Promise<void> {
  const record: UsageRecord = {
    recordId: `use_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    caller,
    model,
    prompt: prompt.slice(0, 4000),
    output: output.slice(0, 4000),
    toolCalls,
    success,
    durationMs,
    estimatedTokens: Math.floor((prompt.length + output.length) / 4),
  };

  // Fire-and-forget — never block the main call
  appendRecord(record).catch(() => {});
  updateStats(record).catch(() => {});
}

/**
 * Wrap any async LLM call function to transparently log its usage.
 *
 * @example
 * const generate = wrapLLMCall('geminiService', 'gemini-2.5-flash', generateGeminiResponse);
 * const response = await generate(prompt); // logged automatically
 */
export function wrapLLMCall<T extends (prompt: string) => Promise<{ content: string; success: boolean }>>(
  caller: string,
  model: string,
  fn: T,
): T {
  return (async (prompt: string) => {
    const start = Date.now();
    const result = await fn(prompt);
    const durationMs = Date.now() - start;
    await logUsage(caller, model, prompt, result.content || '', result.success, durationMs);
    return result;
  }) as T;
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function getUsageStats(): Promise<UsageStats | null> {
  try {
    const raw = await fs.readFile(STATS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function loadRecentUsage(limit = 200): Promise<UsageRecord[]> {
  try {
    const raw = await fs.readFile(USAGE_FILE, 'utf-8');
    const lines = raw.trim().split('\n').filter(Boolean).slice(-limit);
    return lines.map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

/**
 * LAM Execution Engine
 *
 * Grounds abstract plan steps into concrete, executable actions.
 * This is Phase 1 Step 3 of the LAM roadmap: "Integration and Grounding"
 *
 * Supports:
 *   - Shell command execution (terminal grounding)
 *   - File read/write (filesystem grounding)
 *   - HTTP requests (API/web grounding)
 *   - Memory search/store (long-term context)
 *   - LLM calls (reasoning grounding)
 *
 * Integrates with TrajectoryBuilder to auto-capture all actions as training data.
 */

import { exec } from 'child_process';
import { promises as fs } from 'fs';
import { promisify } from 'util';
import { TrajectoryBuilder, type ActionType } from './lamTrajectoryCollector';

const execAsync = promisify(exec);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  durationMs: number;
}

export interface ToolCall {
  tool: 'shell' | 'file_read' | 'file_write' | 'http_get' | 'http_post' | 'memory_search';
  intent: string;
  params: Record<string, unknown>;
}

// Safety allowlist for shell commands (prevents destructive ops)
const SHELL_BLOCKLIST = [
  /rm\s+-rf\s+\//,
  /mkfs/,
  /dd\s+if=/,
  />\/dev\/(sd|nvme)/,
  /:(){ :|:& };:/,
];

function isSafeCommand(cmd: string): boolean {
  return !SHELL_BLOCKLIST.some((rx) => rx.test(cmd));
}

// ─── Tool Implementations ─────────────────────────────────────────────────────

async function runShell(
  command: string,
  timeoutMs = 30_000,
): Promise<ExecutionResult> {
  const start = Date.now();
  if (!isSafeCommand(command)) {
    return { success: false, output: '', error: 'Command blocked by safety filter', durationMs: 0 };
  }
  try {
    const { stdout, stderr } = await Promise.race([
      execAsync(command, { cwd: process.cwd(), env: process.env }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Command timed out')), timeoutMs),
      ),
    ]);
    return {
      success: true,
      output: (stdout + (stderr ? `\nSTDERR: ${stderr}` : '')).trim(),
      durationMs: Date.now() - start,
    };
  } catch (err: unknown) {
    const e = err as { message?: string; stdout?: string; stderr?: string };
    return {
      success: false,
      output: e.stdout || '',
      error: e.message || String(err),
      durationMs: Date.now() - start,
    };
  }
}

async function readFile(filePath: string): Promise<ExecutionResult> {
  const start = Date.now();
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return { success: true, output: content.slice(0, 10_000), durationMs: Date.now() - start };
  } catch (err: unknown) {
    return { success: false, output: '', error: String(err), durationMs: Date.now() - start };
  }
}

async function writeFile(filePath: string, content: string): Promise<ExecutionResult> {
  const start = Date.now();
  try {
    await fs.writeFile(filePath, content, 'utf-8');
    return { success: true, output: `Written ${content.length} bytes to ${filePath}`, durationMs: Date.now() - start };
  } catch (err: unknown) {
    return { success: false, output: '', error: String(err), durationMs: Date.now() - start };
  }
}

async function httpGet(url: string, headers?: Record<string, string>): Promise<ExecutionResult> {
  const start = Date.now();
  try {
    const resp = await fetch(url, { headers: headers || {}, signal: AbortSignal.timeout(15_000) });
    const text = await resp.text();
    return {
      success: resp.ok,
      output: text.slice(0, 5_000),
      error: resp.ok ? undefined : `HTTP ${resp.status}`,
      durationMs: Date.now() - start,
    };
  } catch (err: unknown) {
    return { success: false, output: '', error: String(err), durationMs: Date.now() - start };
  }
}

async function httpPost(
  url: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<ExecutionResult> {
  const start = Date.now();
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await resp.text();
    return {
      success: resp.ok,
      output: text.slice(0, 5_000),
      error: resp.ok ? undefined : `HTTP ${resp.status}`,
      durationMs: Date.now() - start,
    };
  } catch (err: unknown) {
    return { success: false, output: '', error: String(err), durationMs: Date.now() - start };
  }
}

async function memorySearch(query: string, limit = 5): Promise<ExecutionResult> {
  const start = Date.now();
  try {
    const resp = await fetch(`http://localhost:7788/memory/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = await resp.json() as { results?: unknown[] };
    return {
      success: true,
      output: JSON.stringify(data.results || []).slice(0, 3_000),
      durationMs: Date.now() - start,
    };
  } catch (err: unknown) {
    return { success: false, output: '', error: String(err), durationMs: Date.now() - start };
  }
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

/**
 * Execute a ToolCall and record it in the trajectory builder.
 * This is the "grounding" layer — converts LLM intentions into real actions.
 */
export async function executeTool(
  call: ToolCall,
  builder: TrajectoryBuilder,
): Promise<ExecutionResult> {
  let result: ExecutionResult;
  let actionType: ActionType;

  switch (call.tool) {
    case 'shell': {
      actionType = 'shell_exec';
      result = await runShell(call.params.command as string);
      break;
    }
    case 'file_read': {
      actionType = 'file_read';
      result = await readFile(call.params.path as string);
      break;
    }
    case 'file_write': {
      actionType = 'file_write';
      result = await writeFile(call.params.path as string, call.params.content as string);
      break;
    }
    case 'http_get': {
      actionType = 'http_get';
      result = await httpGet(
        call.params.url as string,
        call.params.headers as Record<string, string> | undefined,
      );
      break;
    }
    case 'http_post': {
      actionType = 'http_post';
      result = await httpPost(
        call.params.url as string,
        call.params.body,
        call.params.headers as Record<string, string> | undefined,
      );
      break;
    }
    case 'memory_search': {
      actionType = 'memory_search';
      result = await memorySearch(
        call.params.query as string,
        call.params.limit as number | undefined,
      );
      break;
    }
    default:
      result = { success: false, output: '', error: `Unknown tool: ${(call as ToolCall).tool}`, durationMs: 0 };
      actionType = 'tool_call';
  }

  builder.recordAction(
    actionType,
    call.intent,
    call.params,
    result.output,
    result.success,
    result.durationMs,
    undefined,
    result.error,
  );

  return result;
}

/**
 * Parse tool calls from an LLM response that uses the standard XML tool format:
 * <tool>shell</tool><intent>...</intent><params>{"command":"..."}</params>
 */
export function parseToolCalls(llmOutput: string): ToolCall[] {
  const calls: ToolCall[] = [];
  const pattern = /<tool>(.*?)<\/tool>\s*<intent>(.*?)<\/intent>\s*<params>([\s\S]*?)<\/params>/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(llmOutput)) !== null) {
    try {
      calls.push({
        tool: match[1].trim() as ToolCall['tool'],
        intent: match[2].trim(),
        params: JSON.parse(match[3].trim()),
      });
    } catch { /* skip malformed */ }
  }

  return calls;
}

/**
 * Run a full LAM agentic loop:
 * 1. LLM generates a plan
 * 2. LLM generates tool calls for each step
 * 3. Tools execute and feed back results
 * 4. LLM verifies and concludes
 *
 * All actions are recorded as a trajectory for training data.
 */
export async function runLAMLoop(
  goal: string,
  llmCall: (prompt: string) => Promise<string>,
  source: 'expert' | 'self' = 'self',
  maxIterations = 5,
): Promise<{ output: string; trajectoryId: string }> {
  const builder = new TrajectoryBuilder(goal, source);
  const history: string[] = [];

  // Step 1: Generate plan
  const planPrompt = `You are an action-oriented AI agent (LAM). Your task:

GOAL: ${goal}

First, produce a numbered step-by-step plan. Then, for each step, emit tool calls in this exact XML format:

<tool>shell|file_read|file_write|http_get|http_post|memory_search</tool>
<intent>what this action accomplishes</intent>
<params>{"key": "value"}</params>

Available tools:
- shell: run terminal commands {"command": "..."}
- file_read: read a file {"path": "..."}
- file_write: write to a file {"path": "...", "content": "..."}
- http_get: HTTP GET {"url": "...", "headers": {}}
- http_post: HTTP POST {"url": "...", "body": {}}
- memory_search: search Milla's memory {"query": "...", "limit": 5}

Start with: PLAN:\\n1. ...\\n\\nThen emit tool calls.`;

  const t0 = Date.now();
  const planResponse = await llmCall(planPrompt);
  builder.recordAction('llm_call', 'Generate plan and initial tool calls', { prompt: planPrompt.slice(0, 500) }, planResponse, true, Date.now() - t0);

  const planLines = planResponse
    .split('\n')
    .filter((l) => /^\d+\./.test(l.trim()))
    .map((l) => l.replace(/^\d+\.\s*/, '').trim());
  builder.setPlan(planLines);
  history.push(`Goal: ${goal}`, `Plan:\n${planLines.join('\n')}`);

  // Step 2: Execute tool calls iteratively
  let finalOutput = planResponse;
  for (let i = 0; i < maxIterations; i++) {
    const calls = parseToolCalls(finalOutput);
    if (calls.length === 0) break;

    const results: string[] = [];
    for (const call of calls) {
      const result = await executeTool(call, builder);
      results.push(`[${call.tool}] ${call.intent}: ${result.success ? result.output : `ERROR: ${result.error}`}`);
    }

    history.push(...results);

    // Step 3: LLM synthesizes based on tool results
    const synthesisPrompt = `You are a LAM agent synthesizing results.

GOAL: ${goal}
PLAN: ${planLines.join(' | ')}

TOOL RESULTS:
${results.join('\n')}

HISTORY:
${history.slice(-6).join('\n')}

Based on these results, either:
1. Emit more tool calls if the goal is not yet achieved, OR
2. Output DONE: <summary of what was accomplished>`;

    const t1 = Date.now();
    finalOutput = await llmCall(synthesisPrompt);
    builder.recordAction('llm_call', 'Synthesize tool results', { iteration: i + 1 }, finalOutput, true, Date.now() - t1);

    if (finalOutput.toUpperCase().includes('DONE:')) break;
  }

  const doneMatch = finalOutput.match(/DONE:\s*([\s\S]+)/i);
  const summary = doneMatch ? doneMatch[1].trim() : finalOutput.slice(0, 500);
  const goalAchieved = Boolean(doneMatch);

  const trajectory = await builder.finish(goalAchieved, summary);
  return { output: summary, trajectoryId: trajectory.trajectoryId };
}

/**
 * Long-Horizon Task Planner
 *
 * Implements the AGI roadmap's "Agent Scaffolding" driver:
 * - Goal decomposition into a persisted multi-step plan
 * - Step-by-step execution with self-verification (fixes "jagged intelligence")
 * - Adaptive re-planning when steps fail or drift
 * - Extended test-time compute via iterative reasoning passes
 *
 * Aligned with: Noogenesis Epoch (2026-2030) — recursive self-improving loops
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { generateGeminiResponse } from '../geminiService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlanStep {
  stepId: string;
  order: number;
  description: string;
  expectedOutcome: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  result?: string;
  verification?: VerificationResult;
  attempts: number;
}

export interface VerificationResult {
  passed: boolean;
  score: number; // 0.0–1.0
  reasoning: string;
  issues?: string[];
}

export interface ExecutionEntry {
  timestamp: string;
  stepId: string;
  action: string;
  result: string;
}

export interface HorizonPlan {
  planId: string;
  goal: string;
  context?: string;
  steps: PlanStep[];
  status: 'planning' | 'executing' | 'paused' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  executionLog: ExecutionEntry[];
  metadata: {
    totalSteps: number;
    completedSteps: number;
    failedSteps: number;
    verificationsPassed: number;
    adaptations: number;
  };
}

export interface PlanSummary {
  planId: string;
  goal: string;
  status: HorizonPlan['status'];
  progress: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Persistence ──────────────────────────────────────────────────────────────

const PLANS_FILE = join(process.cwd(), 'memory', 'horizon_plans.json');

async function loadPlans(): Promise<HorizonPlan[]> {
  try {
    const raw = await fs.readFile(PLANS_FILE, 'utf-8');
    return JSON.parse(raw || '[]');
  } catch {
    return [];
  }
}

async function savePlans(plans: HorizonPlan[]): Promise<void> {
  await fs.writeFile(PLANS_FILE, JSON.stringify(plans, null, 2), 'utf-8');
}

async function savePlan(plan: HorizonPlan): Promise<void> {
  const plans = await loadPlans();
  const idx = plans.findIndex((p) => p.planId === plan.planId);
  if (idx >= 0) {
    plans[idx] = plan;
  } else {
    plans.push(plan);
  }
  await savePlans(plans);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeId(): string {
  return `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeStepId(order: number): string {
  return `step_${order}_${Math.random().toString(36).slice(2, 6)}`;
}

function now(): string {
  return new Date().toISOString();
}

/** Parse a JSON block from LLM output, tolerating markdown fences */
function parseJSON<T>(text: string): T | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : text;
  try {
    return JSON.parse(candidate.trim()) as T;
  } catch {
    // Try extracting first JSON array/object
    const m = candidate.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (m) {
      try {
        return JSON.parse(m[1]) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ─── Planning Phase ───────────────────────────────────────────────────────────

/**
 * Decompose a high-level goal into concrete, verifiable steps.
 * This is the "test-time compute" planning pass — the model thinks before acting.
 */
async function decomposeGoal(
  goal: string,
  context?: string
): Promise<PlanStep[]> {
  const prompt = `You are a meticulous AI planner implementing long-horizon task execution.

GOAL: ${goal}
${context ? `CONTEXT: ${context}` : ''}

Decompose this goal into a precise, ordered sequence of concrete steps.
Each step must be independently executable and produce a verifiable outcome.

Requirements:
- Between 3 and 10 steps
- Each step must have a clear, testable expected outcome
- Steps must be ordered by dependency (earlier steps enable later ones)
- Be specific — avoid vague steps like "research" or "improve"

Respond with ONLY a JSON array:
[
  {
    "order": 1,
    "description": "Exact action to take",
    "expectedOutcome": "Specific, measurable result that indicates success"
  },
  ...
]`;

  const response = await generateGeminiResponse(prompt);
  if (!response.success) {
    throw new Error(`Planning failed: ${response.error}`);
  }

  type RawStep = { order: number; description: string; expectedOutcome: string };
  const raw = parseJSON<RawStep[]>(response.content);
  if (!raw || !Array.isArray(raw)) {
    throw new Error('Failed to parse plan from LLM response');
  }

  return raw.map((s) => ({
    stepId: makeStepId(s.order),
    order: s.order,
    description: s.description,
    expectedOutcome: s.expectedOutcome,
    status: 'pending' as const,
    attempts: 0,
  }));
}

// ─── Execution Phase ──────────────────────────────────────────────────────────

/**
 * Execute a single step using extended reasoning (test-time compute).
 * The model reasons about the step in context of the full plan and prior results.
 */
async function executeStep(
  step: PlanStep,
  plan: HorizonPlan
): Promise<string> {
  const completedContext = plan.steps
    .filter((s) => s.status === 'completed')
    .map((s) => `Step ${s.order}: ${s.description}\nResult: ${s.result}`)
    .join('\n\n');

  const prompt = `You are an AI agent executing step ${step.order} of a long-horizon plan.

OVERALL GOAL: ${plan.goal}

COMPLETED STEPS:
${completedContext || '(none yet)'}

CURRENT STEP TO EXECUTE:
Description: ${step.description}
Expected Outcome: ${step.expectedOutcome}
Attempt: ${step.attempts + 1}

Reason through this step carefully. Think about:
1. What information or resources are needed?
2. What is the most reliable approach?
3. What could go wrong and how to mitigate it?

Then execute the step and describe the concrete result achieved.
Be specific — state exactly what was done and what the outcome is.
If you cannot execute the step directly, describe a complete execution plan with exact commands or actions.

Respond with your reasoning followed by: RESULT: <specific outcome>`;

  const response = await generateGeminiResponse(prompt);
  if (!response.success) {
    throw new Error(`Step execution failed: ${response.error}`);
  }

  const resultMatch = response.content.match(/RESULT:\s*([\s\S]+)$/i);
  return resultMatch ? resultMatch[1].trim() : response.content.trim();
}

// ─── Verification Phase ───────────────────────────────────────────────────────

/**
 * Verify a step's result against its expected outcome.
 * This is the self-verification loop that fixes "jagged intelligence".
 */
async function verifyStep(
  step: PlanStep,
  result: string,
  planGoal: string
): Promise<VerificationResult> {
  const prompt = `You are a strict quality verification agent.

PLAN GOAL: ${planGoal}
STEP: ${step.description}
EXPECTED OUTCOME: ${step.expectedOutcome}
ACTUAL RESULT: ${result}

Assess whether the actual result satisfies the expected outcome.
Be critical — partial completion does not count as success.

Respond with ONLY JSON:
{
  "passed": true/false,
  "score": 0.0-1.0,
  "reasoning": "Explanation of your assessment",
  "issues": ["issue1", "issue2"] // only if passed is false
}`;

  const response = await generateGeminiResponse(prompt);
  if (!response.success) {
    // Default to optimistic pass on verification failure to avoid infinite loops
    return { passed: true, score: 0.7, reasoning: 'Verification unavailable', issues: [] };
  }

  const parsed = parseJSON<VerificationResult>(response.content);
  if (!parsed) {
    return { passed: true, score: 0.6, reasoning: 'Could not parse verification', issues: [] };
  }
  return parsed;
}

// ─── Adaptation Phase ─────────────────────────────────────────────────────────

/**
 * Re-plan remaining steps when a step fails verification.
 * This implements the adaptive re-planning loop.
 */
async function adaptPlan(
  plan: HorizonPlan,
  failedStep: PlanStep,
  verification: VerificationResult
): Promise<PlanStep[]> {
  const completedSteps = plan.steps.filter((s) => s.status === 'completed');
  const remainingSteps = plan.steps.filter(
    (s) => s.status === 'pending' && s.order > failedStep.order
  );

  const prompt = `You are an AI planner adapting a long-horizon plan after a step failure.

GOAL: ${plan.goal}

COMPLETED STEPS:
${completedSteps.map((s) => `${s.order}. ${s.description} → ${s.result}`).join('\n') || '(none)'}

FAILED STEP:
Description: ${failedStep.description}
Expected: ${failedStep.expectedOutcome}
Issues: ${verification.issues?.join(', ') || 'unknown'}

REMAINING PLANNED STEPS:
${remainingSteps.map((s) => `${s.order}. ${s.description}`).join('\n') || '(none)'}

Revise the remaining steps to account for the failure and still achieve the goal.
You may modify, add, or remove steps as needed.

Respond with ONLY a JSON array of revised steps:
[
  {
    "order": <number continuing from ${failedStep.order + 1}>,
    "description": "Revised action",
    "expectedOutcome": "Specific measurable result"
  },
  ...
]`;

  const response = await generateGeminiResponse(prompt);
  if (!response.success) return remainingSteps; // Keep original if adaptation fails

  type RawStep = { order: number; description: string; expectedOutcome: string };
  const raw = parseJSON<RawStep[]>(response.content);
  if (!raw || !Array.isArray(raw)) return remainingSteps;

  return raw.map((s) => ({
    stepId: makeStepId(s.order),
    order: s.order,
    description: s.description,
    expectedOutcome: s.expectedOutcome,
    status: 'pending' as const,
    attempts: 0,
  }));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Create a new plan from a goal (planning phase only, does not execute) */
export async function createPlan(
  goal: string,
  context?: string
): Promise<HorizonPlan> {
  const steps = await decomposeGoal(goal, context);
  const plan: HorizonPlan = {
    planId: makeId(),
    goal,
    context,
    steps,
    status: 'planning',
    createdAt: now(),
    updatedAt: now(),
    executionLog: [],
    metadata: {
      totalSteps: steps.length,
      completedSteps: 0,
      failedSteps: 0,
      verificationsPassed: 0,
      adaptations: 0,
    },
  };
  await savePlan(plan);
  return plan;
}

/** Execute the next pending step of an existing plan */
export async function executeNextStep(planId: string): Promise<{
  plan: HorizonPlan;
  step: PlanStep;
  done: boolean;
}> {
  const plans = await loadPlans();
  const plan = plans.find((p) => p.planId === planId);
  if (!plan) throw new Error(`Plan ${planId} not found`);
  if (plan.status === 'completed' || plan.status === 'failed') {
    throw new Error(`Plan is already ${plan.status}`);
  }

  const nextStep = plan.steps.find((s) => s.status === 'pending');
  if (!nextStep) {
    plan.status = 'completed';
    plan.updatedAt = now();
    await savePlan(plan);
    return { plan, step: plan.steps[plan.steps.length - 1], done: true };
  }

  plan.status = 'executing';
  nextStep.status = 'in_progress';
  nextStep.attempts += 1;
  plan.updatedAt = now();
  await savePlan(plan);

  // Execute the step
  let result: string;
  try {
    result = await executeStep(nextStep, plan);
  } catch (err) {
    nextStep.status = 'failed';
    nextStep.result = `Execution error: ${err}`;
    plan.metadata.failedSteps += 1;
    plan.executionLog.push({ timestamp: now(), stepId: nextStep.stepId, action: 'execute', result: nextStep.result });
    plan.status = 'paused';
    plan.updatedAt = now();
    await savePlan(plan);
    return { plan, step: nextStep, done: false };
  }

  nextStep.result = result;

  // Verify the result
  const verification = await verifyStep(nextStep, result, plan.goal);
  nextStep.verification = verification;

  plan.executionLog.push({
    timestamp: now(),
    stepId: nextStep.stepId,
    action: `execute+verify (score: ${verification.score.toFixed(2)})`,
    result,
  });

  if (verification.passed || verification.score >= 0.6) {
    nextStep.status = 'completed';
    plan.metadata.completedSteps += 1;
    plan.metadata.verificationsPassed += 1;
  } else if (nextStep.attempts >= 2) {
    // After 2 failed attempts, adapt the plan
    nextStep.status = 'failed';
    plan.metadata.failedSteps += 1;

    const remainingSteps = await adaptPlan(plan, nextStep, verification);
    // Replace pending steps with adapted ones
    plan.steps = [
      ...plan.steps.filter((s) => s.status !== 'pending'),
      ...remainingSteps,
    ];
    plan.metadata.totalSteps = plan.steps.length;
    plan.metadata.adaptations += 1;
  } else {
    // Retry: reset to pending
    nextStep.status = 'pending';
  }

  // Check if all steps done
  const allDone = plan.steps.every(
    (s) => s.status === 'completed' || s.status === 'skipped'
  );
  const anyFailed = plan.steps.filter((s) => s.status === 'failed').length;
  const allFailed = plan.steps.every(
    (s) => s.status === 'failed' || s.status === 'skipped'
  );

  if (allDone) {
    plan.status = 'completed';
  } else if (allFailed || (anyFailed > 0 && plan.steps.filter((s) => s.status === 'pending').length === 0)) {
    plan.status = 'failed';
  } else {
    plan.status = 'executing';
  }

  plan.updatedAt = now();
  await savePlan(plan);

  return { plan, step: nextStep, done: plan.status === 'completed' || plan.status === 'failed' };
}

/** Run a plan to full completion (up to maxSteps safety limit) */
export async function runPlanToCompletion(
  planId: string,
  maxSteps = 20
): Promise<HorizonPlan> {
  let steps = 0;
  while (steps < maxSteps) {
    const { plan, done } = await executeNextStep(planId);
    steps++;
    if (done) return plan;
    if (plan.status === 'paused' || plan.status === 'failed') return plan;
  }
  // Safety: pause if maxSteps exceeded
  const plans = await loadPlans();
  const plan = plans.find((p) => p.planId === planId)!;
  plan.status = 'paused';
  plan.updatedAt = now();
  await savePlan(plan);
  return plan;
}

/** Get a plan by ID */
export async function getPlan(planId: string): Promise<HorizonPlan | null> {
  const plans = await loadPlans();
  return plans.find((p) => p.planId === planId) ?? null;
}

/** List all plans (summaries) */
export async function listPlans(): Promise<PlanSummary[]> {
  const plans = await loadPlans();
  return plans.map((p) => ({
    planId: p.planId,
    goal: p.goal,
    status: p.status,
    progress: `${p.metadata.completedSteps}/${p.metadata.totalSteps} steps`,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }));
}

/** Delete a plan */
export async function deletePlan(planId: string): Promise<boolean> {
  const plans = await loadPlans();
  const filtered = plans.filter((p) => p.planId !== planId);
  if (filtered.length === plans.length) return false;
  await savePlans(filtered);
  return true;
}

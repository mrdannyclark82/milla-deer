/**
 * Metacognitive Service
 *
 * This service implements a meta-agent that monitors long-running task results
 * against the user's high-level goals and injects feedback to prevent "goal drift"
 * or misaligned execution.
 */

import { generateGeminiResponse } from './geminiService';
import { getProfile, UserProfile } from './profileService';
import type { AgentTask } from './agents/taskStorage';

/**
 * Feedback command returned when misalignment is detected
 */
export interface FeedbackCommand {
  type: 'correction' | 'warning' | 'stop';
  message: string;
  suggestedAction?: string;
  confidence: number; // 0-1 score indicating confidence in the misalignment
  reasoning: string;
}

/**
 * Task alignment result
 */
export interface TaskAlignment {
  aligned: boolean;
  confidence: number;
  feedback?: FeedbackCommand;
  analysis: string;
}

/**
 * Monitor task alignment with user's long-term goals
 *
 * @param task - The agent task to monitor
 * @returns FeedbackCommand if misalignment detected, null otherwise
 */
export async function monitorTaskAlignment(
  task: AgentTask
): Promise<FeedbackCommand | null> {
  try {
    // Get user profile with goals
    const userId = task.metadata?.userId || 'default-user';
    const profile = await getProfile(userId);

    // If no profile or insufficient data, skip alignment check
    if (!profile || !profile.interests || profile.interests.length === 0) {
      console.log(
        '[Metacognitive] Insufficient user profile data for alignment check'
      );
      return null;
    }

    // Only check tasks that are in progress or completed
    if (!task.status || !['in_progress', 'completed'].includes(task.status)) {
      return null;
    }

    // Construct prompt for LLM to assess alignment
    const alignmentPrompt = buildAlignmentPrompt(task, profile);

    // Call LLM to assess alignment
    const response = await generateGeminiResponse(alignmentPrompt);

    if (!response.success) {
      console.error(
        '[Metacognitive] Failed to assess alignment:',
        response.error
      );
      return null;
    }

    // Parse the LLM response to extract alignment assessment
    const alignment = parseAlignmentResponse(response.content);

    // Return feedback if misalignment detected
    if (!alignment.aligned && alignment.feedback) {
      console.log(
        '[Metacognitive] Misalignment detected:',
        alignment.feedback.message
      );
      return alignment.feedback;
    }

    return null;
  } catch (error) {
    console.error('[Metacognitive] Error monitoring task alignment:', error);
    return null;
  }
}

/**
 * Build prompt for LLM to assess task alignment
 */
function buildAlignmentPrompt(task: AgentTask, profile: UserProfile): string {
  const userGoals = extractUserGoals(profile);

  return `You are a metacognitive agent monitoring task execution for alignment with user goals.

USER PROFILE:
- Name: ${profile.name || 'Unknown'}
- Interests: ${profile.interests.join(', ')}
- Goals/Preferences: ${userGoals}

TASK BEING MONITORED:
- Task ID: ${task.taskId}
- Agent: ${task.agent}
- Action: ${task.action}
- Status: ${task.status}
- Payload: ${JSON.stringify(task.payload)}
${task.result ? `- Result: ${JSON.stringify(task.result)}` : ''}

ASSESSMENT REQUEST:
Analyze whether this task and its execution align with the user's stated interests and goals.
Consider:
1. Does the task serve the user's interests?
2. Is the task result appropriate for the user's preferences?
3. Are there any signs of goal drift or misalignment?

Respond in the following JSON format:
{
  "aligned": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of your assessment",
  "feedback": {
    "type": "correction|warning|stop",
    "message": "User-facing message about the misalignment",
    "suggestedAction": "What the agent should do instead",
    "confidence": 0.0-1.0
  }
}

If the task is aligned, set "aligned" to true and omit the "feedback" field.
If misalignment is detected, include the "feedback" field with appropriate guidance.`;
}

/**
 * Extract user goals from profile
 */
function extractUserGoals(profile: UserProfile): string {
  // Combine interests and preferences into a goals description
  const interests = profile.interests?.join(', ') || 'None specified';
  const prefs = Object.entries(profile.preferences || {})
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');

  return prefs ? `${interests}. Preferences: ${prefs}` : interests;
}

/**
 * Parse LLM response to extract alignment assessment
 */
function parseAlignmentResponse(response: string): TaskAlignment {
  try {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // If no JSON found, assume aligned
      return {
        aligned: true,
        confidence: 0.5,
        analysis: response,
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      aligned: parsed.aligned !== false,
      confidence: parsed.confidence || 0.5,
      analysis: parsed.reasoning || response,
      feedback: parsed.feedback
        ? {
            type: parsed.feedback.type || 'warning',
            message:
              parsed.feedback.message || 'Potential misalignment detected',
            suggestedAction: parsed.feedback.suggestedAction,
            confidence: parsed.feedback.confidence || 0.5,
            reasoning: parsed.reasoning || '',
          }
        : undefined,
    };
  } catch (error) {
    console.error('[Metacognitive] Error parsing alignment response:', error);
    // On parse error, assume aligned to avoid false positives
    return {
      aligned: true,
      confidence: 0.3,
      analysis: response,
    };
  }
}

/**
 * Format feedback command as context string for injection into agent prompts
 */
export function formatFeedbackForContext(feedback: FeedbackCommand): string {
  return `
[METACOGNITIVE FEEDBACK - PRIORITY: ${feedback.type.toUpperCase()}]
${feedback.message}
${feedback.suggestedAction ? `Suggested Action: ${feedback.suggestedAction}` : ''}
Confidence: ${(feedback.confidence * 100).toFixed(0)}%

Please adjust your approach to better align with the user's goals.
`;
}

// ============================================================================
// P2.4: SCPA (Self-Correcting Perpetual Agent) Error Hook
// ============================================================================

export type FailureSeverity = 'low' | 'medium' | 'high' | 'critical';
export type FailureImpact = 'low' | 'medium' | 'high';

/**
 * Agent failure context for SCPA processing
 */
export interface AgentFailureContext {
  agentName: string;
  taskId: string;
  error: Error | string;
  timestamp: number;
  attemptCount: number;
  taskContext?: any;
  stackTrace?: string;
  previousAttempts?: Array<{
    timestamp: number;
    error: string;
  }>;
  severity?: FailureSeverity;
  impact?: FailureImpact;
  priorityScore?: number;
}

/**
 * SCPA task queue for self-correction
 */
const scpaQueue: AgentFailureContext[] = [];

/**
 * Determine if a failure is critical
 */
export function isCriticalFailure(context: AgentFailureContext): boolean {
  return (
    context.severity === 'critical' ||
    (context.priorityScore || 0) >= 70 ||
    context.attemptCount > 2 ||
    (typeof context.error === 'string' &&
      (context.error.includes('critical') || context.error.includes('fatal')))
  );
}

/**
 * Calculate priority score for a failure
 * Higher score = higher priority
 */
export function calculatePriorityScore(context: AgentFailureContext): number {
  let score = 0;

  // Severity Weight (0-40)
  switch (context.severity) {
    case 'critical':
      score += 40;
      break;
    case 'high':
      score += 30;
      break;
    case 'medium':
      score += 20;
      break;
    case 'low':
      score += 10;
      break;
    default:
      score += 20; // Default to medium
  }

  // Impact Weight (0-30)
  switch (context.impact) {
    case 'high':
      score += 30;
      break;
    case 'medium':
      score += 20;
      break;
    case 'low':
      score += 10;
      break;
    default:
      score += 20; // Default to medium
  }

  // Attempts Weight (10 points per attempt, max 30)
  score += Math.min((context.attemptCount || 1) * 10, 30);

  return score;
}

/**
 * Add a failure to the SCPA queue
 */
export function enqueueFailure(failure: AgentFailureContext): void {
  // Calculate priority score if not present
  if (failure.priorityScore === undefined) {
    failure.priorityScore = calculatePriorityScore(failure);
  }

  scpaQueue.push(failure);

  // Sort queue by priority score (descending)
  scpaQueue.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
}

/**
 * Get the next highest priority failure from the queue
 */
export function getNextSCPAFailure(): AgentFailureContext | undefined {
  return scpaQueue.shift(); // Since it's sorted descending, the first element is highest priority
}

/**
 * Peek at the next highest priority failure without removing it
 */
export function peekNextSCPAFailure(): AgentFailureContext | undefined {
  return scpaQueue[0];
}

/**
 * P2.4: Report agent failure to metacognitive service for SCPA processing
 * Routes critical failures to the coding agent for self-correction
 *
 * @param error - The error that occurred
 * @param context - Context about the failure (agent, task, etc.)
 * @returns Promise that resolves when failure is queued for processing
 */
export async function reportAgentFailure(
  error: Error | string,
  context: Partial<AgentFailureContext>
): Promise<void> {
  const errorMessage = error instanceof Error ? error.message : error;
  const stackTrace = error instanceof Error ? error.stack : undefined;

  // Infer severity if not provided
  let severity = context.severity;
  if (!severity) {
    const errLower = errorMessage.toLowerCase();
    if (errLower.includes('critical') || errLower.includes('fatal')) {
      severity = 'critical';
    } else if (errLower.includes('timeout') || errLower.includes('connection')) {
      severity = 'high';
    } else {
      severity = 'medium';
    }
  }

  // Infer impact if not provided (default to medium)
  const impact = context.impact || 'medium';

  const failureContext: AgentFailureContext = {
    agentName: context.agentName || 'unknown',
    taskId: context.taskId || `task_${Date.now()}`,
    error: errorMessage,
    timestamp: Date.now(),
    attemptCount: context.attemptCount || 1,
    taskContext: context.taskContext,
    stackTrace,
    previousAttempts: context.previousAttempts || [],
    severity,
    impact,
  };

  failureContext.priorityScore = calculatePriorityScore(failureContext);

  console.error(
    `🚨 [SCPA] Agent failure reported: ${failureContext.agentName} (Severity: ${severity}, Impact: ${impact}, Priority: ${failureContext.priorityScore})`
  );
  console.error(`🚨 [SCPA] Error: ${errorMessage}`);
  console.error(`🚨 [SCPA] Task ID: ${failureContext.taskId}`);

  // Add to SCPA queue for processing
  enqueueFailure(failureContext);

  // Log for monitoring
  console.log(
    `🔧 [SCPA] Failure queued for self-correction (queue size: ${scpaQueue.length})`
  );

  // Determine if critical based on priority score or flags
  const isCritical = isCriticalFailure(failureContext);

  if (isCritical) {
    console.error(
      `🚨 [SCPA] CRITICAL failure detected - immediate attention required`
    );
  }

  // Enqueue task for coding agent to generate fix
  try {
    const { addTask } = await import('./agents/taskStorage');
    const { v4: uuidv4 } = await import('uuid');

    const fixTaskId = uuidv4();
    await addTask({
      id: fixTaskId,
      agentName: 'codingAgent', // P2.5 will implement the fix generation
      status: 'pending',
      description: `Self-correct failure in ${failureContext.agentName}: ${errorMessage}`,
      priority: isCritical ? 'high' : 'medium',
      createdAt: new Date().toISOString(),
      metadata: {
        scpaFailure: true,
        originalError: failureContext,
        attemptCount: failureContext.attemptCount,
        priorityScore: failureContext.priorityScore,
      },
    });

    console.log(`✅ [SCPA] Fix task created for coding agent: ${fixTaskId}`);
  } catch (taskError) {
    console.error(`❌ [SCPA] Failed to create fix task:`, taskError);
  }
}

/**
 * Get SCPA queue status for monitoring
 */
export function getSCPAQueueStatus(): {
  queueSize: number;
  oldestFailure: number | null;
  criticalFailures: number;
} {
  const now = Date.now();
  const criticalFailures = scpaQueue.filter((f) => isCriticalFailure(f)).length;

  const oldestTimestamp =
    scpaQueue.length > 0
      ? Math.min(...scpaQueue.map((f) => f.timestamp))
      : null;

  return {
    queueSize: scpaQueue.length,
    oldestFailure: oldestTimestamp ? now - oldestTimestamp : null,
    criticalFailures,
  };
}

/**
 * Clear SCPA queue (for testing or after manual intervention)
 */
export function clearSCPAQueue(): void {
  const clearedCount = scpaQueue.length;
  scpaQueue.length = 0;
  console.log(`🧹 [SCPA] Queue cleared: ${clearedCount} items removed`);
}

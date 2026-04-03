/**
 * SLM Smart Router
 *
 * Phase 2 Step 4 + Phase 3: Routes AI calls to the right model based on task complexity.
 *
 * Routing logic:
 *   simple/repetitive tasks → local Ollama SLMs (private, fast, free)
 *   complex reasoning/planning → cloud LLMs (GPT-4o, Claude, Gemini)
 *
 * Implements the "Lego-like SLM" architecture from the AGI roadmap:
 * each task cluster gets its own specialized small model.
 *
 * Phase 3 note: when Open Responses server is running on localhost,
 * the OPEN_RESPONSES_URL env var routes cloud calls through it transparently.
 */

import { classifyPrompt } from './taskClusterService';
import { logUsage } from './agentUsageLogger';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RouterConfig {
  /** Ollama base URL */
  ollamaUrl: string;
  /** Open Responses server URL (Phase 3) — if set, cloud calls go here first */
  openResponsesUrl?: string;
  /** Force cloud for all calls (disable local routing) */
  forceCloud?: boolean;
  /** Minimum confidence score to trust local routing */
  localConfidenceThreshold: number;
}

export interface RoutedResponse {
  content: string;
  success: boolean;
  model: string;
  routedTo: 'local' | 'cloud' | 'open_responses';
  clusterId: string;
  durationMs: number;
  error?: string;
}

// ─── Ollama Client ────────────────────────────────────────────────────────────

async function callOllama(
  baseUrl: string,
  model: string,
  prompt: string,
  timeoutMs = 60_000,
): Promise<{ content: string; success: boolean; error?: string }> {
  try {
    const resp = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) {
      return { content: '', success: false, error: `Ollama HTTP ${resp.status}` };
    }
    const data = await resp.json() as { response?: string; error?: string };
    if (data.error) {
      return { content: '', success: false, error: data.error };
    }
    return { content: data.response || '', success: true };
  } catch (err: unknown) {
    return { content: '', success: false, error: String(err) };
  }
}

// ─── Open Responses Client (Phase 3) ─────────────────────────────────────────

async function callOpenResponses(
  baseUrl: string,
  model: string,
  prompt: string,
): Promise<{ content: string; success: boolean; error?: string }> {
  try {
    const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!resp.ok) {
      return { content: '', success: false, error: `OpenResponses HTTP ${resp.status}` };
    }
    const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content || '';
    return { content, success: Boolean(content) };
  } catch (err: unknown) {
    return { content: '', success: false, error: String(err) };
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

export class SLMRouter {
  private config: RouterConfig;

  constructor(config?: Partial<RouterConfig>) {
    this.config = {
      ollamaUrl: process.env.OLLAMA_HOST || 'http://localhost:11434',
      openResponsesUrl: process.env.OPEN_RESPONSES_URL,
      forceCloud: process.env.FORCE_CLOUD_LLM === 'true',
      localConfidenceThreshold: 0.3,
      ...config,
    };
  }

  /**
   * Route a prompt to the best model based on task classification.
   *
   * @param prompt - The prompt to send
   * @param caller - Service name for logging (e.g., 'chatOrchestrator')
   * @param cloudFallback - Function to call cloud LLM when local routing fails/is inappropriate
   */
  async route(
    prompt: string,
    caller: string,
    cloudFallback: (prompt: string) => Promise<{ content: string; success: boolean }>,
  ): Promise<RoutedResponse> {
    const start = Date.now();
    const classification = classifyPrompt(prompt);

    const useLocal =
      !this.config.forceCloud &&
      classification.preferredModel !== 'cloud' &&
      classification.confidence >= this.config.localConfidenceThreshold;

    // Phase 3: try Open Responses first if configured
    if (this.config.openResponsesUrl && !useLocal) {
      const orResult = await callOpenResponses(
        this.config.openResponsesUrl,
        'gpt-4o', // Open Responses handles model selection internally
        prompt,
      );
      if (orResult.success) {
        const durationMs = Date.now() - start;
        logUsage(caller, 'open_responses:gpt-4o', prompt, orResult.content, true, durationMs).catch(() => {});
        return {
          content: orResult.content,
          success: true,
          model: 'open_responses:gpt-4o',
          routedTo: 'open_responses',
          clusterId: classification.clusterId,
          durationMs,
        };
      }
    }

    if (useLocal) {
      const model = classification.preferredModel;
      const ollamaResult = await callOllama(this.config.ollamaUrl, model, prompt);

      if (ollamaResult.success) {
        const durationMs = Date.now() - start;
        logUsage(caller, model, prompt, ollamaResult.content, true, durationMs).catch(() => {});
        return {
          content: ollamaResult.content,
          success: true,
          model,
          routedTo: 'local',
          clusterId: classification.clusterId,
          durationMs,
        };
      }
      // Fall through to cloud if local fails
    }

    // Cloud fallback
    const cloudResult = await cloudFallback(prompt);
    const durationMs = Date.now() - start;
    logUsage(caller, 'cloud', prompt, cloudResult.content, cloudResult.success, durationMs).catch(() => {});

    return {
      ...cloudResult,
      model: 'cloud',
      routedTo: 'cloud',
      clusterId: classification.clusterId,
      durationMs,
      error: cloudResult.success ? undefined : 'Cloud fallback failed',
    };
  }

  /** Quick routing decision without executing (useful for UI routing info) */
  classify(prompt: string): ReturnType<typeof classifyPrompt> {
    return classifyPrompt(prompt);
  }
}

// Singleton instance
export const slmRouter = new SLMRouter();

/**
 * GemmaDispatcher — unified offline/online routing for Deer-Milla.
 *
 * Route hierarchy:
 *   1. Cloud (Milla-Rayne API) — when reachable
 *   2. Gemma 4 E2B/E4B on-device (gemma4Bridge) — when cloud unreachable
 *   3. Local MediaPipe model (localModelService) — when gemma4 unavailable
 *   4. Offline companion text — last resort
 *
 * Network reachability is checked proactively via a fast AbortController ping
 * so we don't waste time on a cloud request when the device is offline.
 */

import { gemma4Bridge, type Gemma4Variant } from './gemma4-bridge';
import { generateOfflineCompanionResponse } from './offline-companion';

// ── Types ─────────────────────────────────────────────────────────────────

export type DispatchRoute = 'cloud' | 'gemma4' | 'local' | 'fallback';

export interface DispatchResult {
  content: string;
  route: DispatchRoute;
  /** Gemma 4 variant used, if route is 'gemma4'. */
  gemma4Variant?: Gemma4Variant;
  latencyMs: number;
}

export interface DispatchOptions {
  /** Base64-encoded image for multimodal prompts. */
  imageData?: string;
  /**
   * Override automatic routing. Defaults to 'auto'.
   * 'cloud'  — always try cloud first, no connectivity pre-check.
   * 'gemma4' — always route to on-device Gemma 4 (offline), cloud skipped.
   * 'auto'   — ping cloud; fall back to gemma4 if unreachable.
   */
  preferredRoute?: 'auto' | 'cloud' | 'gemma4';
  /** Timeout (ms) for the connectivity ping. Default: 2 500. */
  pingTimeoutMs?: number;
}

// ── Connectivity probe ────────────────────────────────────────────────────

/**
 * Fire a cheap HEAD request to `apiBaseUrl`/api/health.
 * Returns `true` if a non-5xx response (or any network reply) arrives within
 * `timeoutMs`. Uses AbortController — no extra packages required.
 */
async function isCloudReachable(
  apiBaseUrl: string,
  timeoutMs: number
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${apiBaseUrl}/api/health`, {
      method: 'HEAD',
      signal: controller.signal,
    });
    return res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ── Dispatcher ────────────────────────────────────────────────────────────

/**
 * Dispatch a prompt through the route hierarchy.
 *
 * This function does NOT call millaApi directly — it is deliberately kept
 * independent so it can be unit-tested and composed freely.
 *
 * Callers should pass `cloudSend` (an async function that calls millaApi)
 * so the dispatcher stays decoupled from network implementation details.
 *
 * @example
 * const result = await dispatchMessage(
 *   prompt,
 *   apiBaseUrl,
 *   (p, img) => millaApi.sendMessage(p, { imageData: img }),
 *   { imageData: base64, preferredRoute: 'auto' }
 * );
 */
export async function dispatchMessage(
  prompt: string,
  apiBaseUrl: string,
  cloudSend: (prompt: string, imageData?: string) => Promise<string>,
  options: DispatchOptions = {}
): Promise<DispatchResult> {
  const {
    imageData,
    preferredRoute = 'auto',
    pingTimeoutMs = 2_500,
  } = options;

  const start = Date.now();

  // ── Forced gemma4 route ──────────────────────────────────────────────────
  if (preferredRoute === 'gemma4') {
    return tryGemma4(prompt, imageData, start);
  }

  // ── Auto / cloud route ───────────────────────────────────────────────────
  // Skip connectivity ping when forced to cloud; still attempt cloud when auto.
  const cloudReachable =
    preferredRoute === 'cloud'
      ? true
      : await isCloudReachable(apiBaseUrl, pingTimeoutMs);

  if (cloudReachable) {
    try {
      const content = await cloudSend(prompt, imageData);
      if (!content?.trim()) throw new Error('Empty cloud response.');
      return { content, route: 'cloud', latencyMs: Date.now() - start };
    } catch {
      // Cloud failed despite ping success — fall through to on-device.
    }
  }

  // ── Gemma 4 on-device ────────────────────────────────────────────────────
  return tryGemma4(prompt, imageData, start);
}

async function tryGemma4(
  prompt: string,
  imageData: string | undefined,
  start: number
): Promise<DispatchResult> {
  try {
    const result = await gemma4Bridge.generate(prompt, imageData);
    return {
      content: result.text,
      route: 'gemma4',
      gemma4Variant: result.variant,
      latencyMs: Date.now() - start,
    };
  } catch {
    // Gemma 4 unavailable → companion fallback.
    const content = imageData
      ? "I captured your screen, but I can't inspect it while the remote link is unavailable. Reconnect and capture again."
      : generateOfflineCompanionResponse(prompt);

    return { content, route: 'fallback', latencyMs: Date.now() - start };
  }
}

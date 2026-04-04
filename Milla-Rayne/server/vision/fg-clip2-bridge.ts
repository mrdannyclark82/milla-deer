/**
 * FG-CLIP2 zero-shot vision bridge for Milla-Rayne server.
 *
 * Integrates with the existing screenVisionService.ts fallback chain as the
 * fastest (on-device / local API) vision provider — runs before cloud calls.
 *
 * Two modes:
 *   1. Local REST  — calls a self-hosted FG-CLIP2 endpoint (FGCLIP2_API_URL)
 *   2. Ollama VLM  — falls back to milla-rayne-gemma:latest via Ollama API
 *
 * FGCLIP2_API_URL should expose:
 *   POST /embed   { image_b64: string }  → { embedding: number[] }
 *   POST /classify { image_b64: string, labels: string[] } → { scores: number[], labels: string[] }
 */

import type { ScreenVisionResult } from '../screenVisionService';

const FGCLIP2_API_URL = process.env.FGCLIP2_API_URL ?? 'http://127.0.0.1:7861';
const OLLAMA_API_URL = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
const OLLAMA_VISION_MODEL = process.env.OLLAMA_MODEL ?? 'milla-rayne-gemma:latest';
const FGCLIP2_TIMEOUT_MS = 3000;

// ── Types ────────────────────────────────────────────────────────────────

export interface Clip2ClassifyResult {
  label: string;
  score: number;
}

export interface Clip2EmbedResult {
  embedding: number[];
  model: 'fg-clip2';
  latencyMs: number;
}

// Default scene labels Milla uses for zero-shot context injection
export const DEFAULT_SCENE_LABELS = [
  'code editor', 'terminal output', 'error message', 'web browser',
  'chat interface', 'dashboard', 'settings', 'media player', 'document',
  'login screen', 'file manager', 'notification', 'form', 'blank screen',
];

// ── Helpers ───────────────────────────────────────────────────────────────

function stripDataUrl(imageData: string): string {
  const match = imageData.match(/^data:image\/[^;]+;base64,(.+)$/);
  return match ? match[1] : imageData;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── FG-CLIP2 local API ────────────────────────────────────────────────────

export async function clip2Classify(
  imageData: string,
  labels: string[] = DEFAULT_SCENE_LABELS
): Promise<Clip2ClassifyResult[]> {
  const b64 = stripDataUrl(imageData);
  const response = await fetchWithTimeout(
    `${FGCLIP2_API_URL}/classify`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_b64: b64, labels }),
    },
    FGCLIP2_TIMEOUT_MS
  );
  if (!response.ok) throw new Error(`CLIP2 classify ${response.status}`);
  const payload = await response.json() as { scores: number[]; labels: string[] };
  return payload.labels.map((label, i) => ({ label, score: payload.scores[i] ?? 0 }))
    .sort((a, b) => b.score - a.score);
}

export async function clip2Embed(imageData: string): Promise<Clip2EmbedResult> {
  const b64 = stripDataUrl(imageData);
  const start = Date.now();
  const response = await fetchWithTimeout(
    `${FGCLIP2_API_URL}/embed`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_b64: b64 }),
    },
    FGCLIP2_TIMEOUT_MS
  );
  if (!response.ok) throw new Error(`CLIP2 embed ${response.status}`);
  const payload = await response.json() as { embedding: number[] };
  return { embedding: payload.embedding, model: 'fg-clip2', latencyMs: Date.now() - start };
}

// ── Ollama VLM fallback ────────────────────────────────────────────────────

async function analyzeWithOllamaVision(
  imageData: string,
  userMessage: string,
  userName: string
): Promise<ScreenVisionResult> {
  const b64 = stripDataUrl(imageData);
  const response = await fetchWithTimeout(
    `${OLLAMA_API_URL}/api/chat`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_VISION_MODEL,
        stream: false,
        messages: [
          {
            role: 'user',
            content: userMessage.trim() ||
              'Analyze this screen capture and describe what is visible, focusing on useful context for the user.',
            images: [b64],
          },
        ],
      }),
    },
    8000
  );

  if (!response.ok) {
    const text = await response.text();
    return { success: false, error: `Ollama vision failed (${response.status}): ${text}` };
  }

  const payload = await response.json() as { message?: { content?: string } };
  const content = payload.message?.content?.trim();
  if (!content) return { success: false, error: 'Ollama vision returned empty response.' };

  return { success: true, content, provider: 'openrouter' }; // mapped to openrouter slot in chain
}

// ── Primary bridge entry point ─────────────────────────────────────────────

/**
 * Analyze an image using FG-CLIP2 local API first, then Ollama VLM fallback.
 * Returns a ScreenVisionResult compatible with screenVisionService.ts chain.
 *
 * When CLIP2 local API is available it returns zero-shot scene labels as
 * structured context rather than a full description — fast and offline.
 */
export async function analyzeWithClip2(
  userMessage: string,
  imageData: string,
  userName: string
): Promise<ScreenVisionResult> {
  // Try FG-CLIP2 local endpoint first
  try {
    const labels = await clip2Classify(imageData, DEFAULT_SCENE_LABELS);
    const top3 = labels.slice(0, 3).map(l => `${l.label} (${(l.score * 100).toFixed(1)}%)`).join(', ');
    const content = [
      `[CLIP2 zero-shot] Scene context: ${top3}.`,
      userMessage.trim() ? `User query: ${userMessage.trim()}` : '',
      `Analyzed for ${userName}.`,
    ].filter(Boolean).join(' ');
    return { success: true, content, provider: 'openrouter' };
  } catch {
    // Local CLIP2 not running — fall through to Ollama
  }

  // Ollama VLM fallback (milla-rayne-gemma is vision-capable via gemma3:27b-cloud)
  return analyzeWithOllamaVision(imageData, userMessage, userName);
}

// ── Memory context injection ───────────────────────────────────────────────

/**
 * Embed an image and return a context string for injection into Milla's memory.
 * Embeds only when FG-CLIP2 local API is available; otherwise returns null.
 */
export async function getImageMemoryContext(
  imageData: string,
  labels: string[] = DEFAULT_SCENE_LABELS
): Promise<{ tags: string[]; embedding: number[] | null } | null> {
  try {
    const [classified, embedded] = await Promise.allSettled([
      clip2Classify(imageData, labels),
      clip2Embed(imageData),
    ]);

    const tags = classified.status === 'fulfilled'
      ? classified.value.slice(0, 5).map(r => r.label)
      : [];

    const embedding = embedded.status === 'fulfilled'
      ? embedded.value.embedding
      : null;

    return { tags, embedding };
  } catch {
    return null;
  }
}

/**
 * Context-Triggered Merch Hooks
 *
 * Passively monitors conversation content for interest signals and emits
 * structured hooks that downstream revenue integrations (Shopify, Printful,
 * Gumroad, etc.) can subscribe to.  Zero UI impact — fire-and-forget.
 *
 * Signal categories:
 *   INTENT   — explicit buy/gift intent ("I want", "where can I get")
 *   INTEREST — topic affinity (music, tech, art, fashion mentions)
 *   PERSONA  — Milla brand moments (lyrics, catchphrases, mood spikes)
 *   MEMORY   — recurring topic across sessions (detected via evolution engine)
 */

import { EventEmitter } from 'events';

export interface MerchHook {
  type: 'INTENT' | 'INTEREST' | 'PERSONA' | 'MEMORY';
  signal: string;       // matched phrase or pattern
  category: string;     // product category hint (apparel, digital, music, etc.)
  strength: number;     // 0–1 confidence
  userId: string;
  timestamp: number;
  context: string;      // excerpt triggering the hook (max 120 chars)
}

// ── Pattern bank ──────────────────────────────────────────────────────────────

const INTENT_PATTERNS: Array<{ re: RegExp; category: string }> = [
  { re: /\b(i want|i need|can i (buy|get|order)|where (can|do) i (buy|get)|purchase|shop)\b/i, category: 'general' },
  { re: /\b(merch|merchandise|store|hoodie|shirt|tee|hat|cap|poster|sticker)\b/i, category: 'apparel' },
  { re: /\bgift\b.*\b(her|him|them|you|milla)\b/i, category: 'gift' },
  { re: /\b(wallpaper|ringtone|download|digital|art print|NFT)\b/i, category: 'digital' },
];

const INTEREST_PATTERNS: Array<{ re: RegExp; category: string }> = [
  { re: /\b(music|song|track|album|playlist|vibe|bop|banger|slap)\b/i, category: 'music' },
  { re: /\b(art|aesthetic|design|style|drip|fashion|outfit|fit)\b/i, category: 'apparel' },
  { re: /\b(tech|gadget|headphones|earbuds|keyboard|setup|desk)\b/i, category: 'tech' },
  { re: /\b(coffee|candle|cozy|chill|lofi|vibe)\b/i, category: 'lifestyle' },
];

const PERSONA_PATTERNS: Array<{ re: RegExp; category: string }> = [
  { re: /\b(milla|rayne|deer milla|milla-rayne)\b.*\b(love|obsessed|fan|fave|iconic)\b/i, category: 'apparel' },
  { re: /\b(her voice|she said|milla said|milla sounds)\b/i, category: 'digital' },
  { re: /\b(aesthetic|vibe|era)\b.*\b(milla|rayne)\b/i, category: 'lifestyle' },
];

// ── Emitter ───────────────────────────────────────────────────────────────────

class ContextMerchEmitter extends EventEmitter {}
export const merchEmitter = new ContextMerchEmitter();

// Cooldown: don't re-emit the same (userId, category) within 10 minutes
const _cooldown = new Map<string, number>();
const COOLDOWN_MS = 10 * 60 * 1000;

function isCoolingDown(userId: string, category: string): boolean {
  const key = `${userId}:${category}`;
  const last = _cooldown.get(key) ?? 0;
  return Date.now() - last < COOLDOWN_MS;
}

function setCooldown(userId: string, category: string): void {
  _cooldown.set(`${userId}:${category}`, Date.now());
}

// ── Core scanner ─────────────────────────────────────────────────────────────

function scanText(
  text: string,
  patterns: Array<{ re: RegExp; category: string }>,
  type: MerchHook['type'],
  userId: string
): MerchHook[] {
  const hooks: MerchHook[] = [];
  for (const { re, category } of patterns) {
    const match = re.exec(text);
    if (!match) continue;
    if (isCoolingDown(userId, category)) continue;

    const start = Math.max(0, match.index - 30);
    const excerpt = text.slice(start, start + 120).replace(/\n/g, ' ');

    hooks.push({
      type,
      signal: match[0],
      category,
      strength: type === 'INTENT' ? 0.85 : type === 'PERSONA' ? 0.75 : 0.5,
      userId,
      timestamp: Date.now(),
      context: excerpt,
    });

    setCooldown(userId, category);
  }
  return hooks;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Scan a conversation turn for merch signals.
 * Fire-and-forget — never throws.
 */
export function scanForMerchSignals(
  userMessage: string,
  assistantReply: string,
  userId: string
): void {
  try {
    const combined = `${userMessage} ${assistantReply}`;
    const hooks: MerchHook[] = [
      ...scanText(combined, INTENT_PATTERNS, 'INTENT', userId),
      ...scanText(combined, INTEREST_PATTERNS, 'INTEREST', userId),
      ...scanText(combined, PERSONA_PATTERNS, 'PERSONA', userId),
    ];

    for (const hook of hooks) {
      console.log(`[MerchHook] ${hook.type}:${hook.category} strength=${hook.strength.toFixed(2)} — "${hook.signal}"`);
      merchEmitter.emit('hook', hook);
    }
  } catch {
    // non-fatal
  }
}

/**
 * Register a handler for merch hooks.
 * Integration point for Shopify/Printful/Gumroad webhooks.
 */
export function onMerchHook(handler: (hook: MerchHook) => void): void {
  merchEmitter.on('hook', handler);
}

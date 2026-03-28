/**
 * Tool Event Bag — request-scoped tool call collector.
 *
 * Uses AsyncLocalStorage so any code that runs within a `withToolBag()` context
 * can call `captureToolEvent()` without threading a reference through every
 * function signature. The bag is read back in chat.routes.ts after
 * generateAIResponse() returns, then written into the assistant message metadata
 * and the session hot-context.
 */

import { AsyncLocalStorage } from 'async_hooks';

export interface ToolEvent {
  /** Tool / service name (e.g. "gmail_list", "mcp:run_command", "gcal_list") */
  name: string;
  /** MCP server ID when applicable */
  serverId?: string;
  /** Arguments passed to the tool (sanitised — no secrets) */
  args: Record<string, unknown>;
  /** Human-readable result summary (max 400 chars) */
  result: string;
  /** ISO timestamp */
  ts: string;
  /** Wall-clock duration if measured */
  durationMs?: number;
}

const _storage = new AsyncLocalStorage<ToolEvent[]>();

/**
 * Run `fn` inside a tool bag context.
 * Returns the function result plus all captured tool events.
 */
export async function withToolBag<T>(
  fn: () => Promise<T>
): Promise<{ value: T; toolEvents: ToolEvent[] }> {
  const bag: ToolEvent[] = [];
  const value = await _storage.run(bag, fn);
  return { value, toolEvents: bag };
}

/**
 * Record a tool call from anywhere inside a `withToolBag()` context.
 * Safe to call outside a bag — events are silently dropped.
 */
export function captureToolEvent(event: Omit<ToolEvent, 'ts'>): void {
  const bag = _storage.getStore();
  if (!bag) return;
  bag.push({
    ...event,
    ts: new Date().toISOString(),
    result: event.result.slice(0, 400),
  });
}

/**
 * Format a ToolEvent[] into a natural-language paragraph Milla can read.
 * Used in hot context and memory broker.
 */
export function formatToolEvents(events: ToolEvent[]): string {
  if (events.length === 0) return '';
  const lines = events.map((e) => {
    const argSummary = Object.entries(e.args)
      .slice(0, 3)
      .map(([k, v]) => `${k}=${JSON.stringify(v).slice(0, 60)}`)
      .join(', ');
    return `• [${e.name}]${argSummary ? ` (${argSummary})` : ''} → ${e.result}`;
  });
  return lines.join('\n');
}

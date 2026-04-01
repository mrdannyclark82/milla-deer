/**
 * AgentRouter Service
 *
 * Reads server/config/agentRouter.json and provides Milla with a
 * dispatch mechanism: after confidence scoring, she checks this table
 * and either handles the request herself or forwards to a specialist agent.
 */

import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(__dirname, '../config/agentRouter.json');

export interface AgentRoute {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  timeoutSec: number;
  description?: string;
  triggers?: string[];
  auth?: { type: 'bearer' | 'apiKey'; token: string } | null;
}

export interface AgentRouterConfig {
  defaultIntent: string;
  routingTable: Record<string, AgentRoute>;
}

let _config: AgentRouterConfig | null = null;

function loadConfig(): AgentRouterConfig {
  if (_config) return _config;
  if (!existsSync(CONFIG_PATH)) {
    console.warn('[AgentRouter] Config not found — using fallback only');
    return { defaultIntent: 'fallback', routingTable: {} };
  }
  _config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as AgentRouterConfig;
  console.log(`[AgentRouter] Loaded ${Object.keys(_config.routingTable).length} routes`);
  return _config;
}

/** Reload config from disk (hot-reload without restart) */
export function reloadAgentRouter(): void {
  _config = null;
  loadConfig();
}

/** Find the best intent match for a given message */
export function resolveIntent(message: string): string {
  const config = loadConfig();
  const lower = message.toLowerCase();

  for (const [intent, route] of Object.entries(config.routingTable)) {
    if (intent === config.defaultIntent) continue;
    if (route.triggers?.some(trigger => lower.includes(trigger))) {
      return intent;
    }
  }
  return config.defaultIntent;
}

/** Get the route for a specific intent */
export function getRoute(intent: string): AgentRoute | null {
  const config = loadConfig();
  return config.routingTable[intent] ?? config.routingTable[config.defaultIntent] ?? null;
}

/**
 * Dispatch a task to the appropriate specialist agent.
 * Returns the agent's response text, or null if dispatch failed.
 */
export async function dispatchToAgent(
  intent: string,
  payload: Record<string, unknown>
): Promise<string | null> {
  const route = getRoute(intent);
  if (!route || intent === 'fallback') return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), (route.timeoutSec ?? 60) * 1000);

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (route.auth?.type === 'bearer') {
      headers['Authorization'] = `Bearer ${route.auth.token}`;
    }
    // Internal service key — bypasses requireAuth on intake routes
    const internalKey = process.env.INTERNAL_API_KEY;
    if (internalKey) {
      headers['x-internal-key'] = internalKey;
    }

    const res = await fetch(route.url, {
      method: route.method,
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error(`[AgentRouter] ${intent} → ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json() as Record<string, unknown>;
    // Normalize common response shapes
    return (
      (data.content as string) ??
      (data.reply as string) ??
      (data.response as string) ??
      JSON.stringify(data)
    );
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.error(`[AgentRouter] ${intent} timed out after ${route.timeoutSec}s`);
    } else {
      console.error(`[AgentRouter] ${intent} dispatch error:`, err.message);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** List all available routes (for /api/agents/routes endpoint) */
export function listRoutes(): Record<string, { url: string; description?: string }> {
  const config = loadConfig();
  return Object.fromEntries(
    Object.entries(config.routingTable).map(([k, v]) => [k, { url: v.url, description: v.description }])
  );
}

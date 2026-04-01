/**
 * Agent Intake Routes
 *
 * These are the real endpoints that agentRouter.json dispatches to.
 * Each endpoint proxies to the appropriate model and returns a normalized response.
 *
 * POST /api/agents/gpt-120b   → Ollama gpt-oss:120b-cloud (Lead Coder)
 * POST /api/agents/gpt-20b    → Ollama gpt-oss:20b-cloud  (QA)
 * POST /api/agents/deer-flow  → OpenRouter gemini-2.0-flash (Research)
 * POST /api/ux/review         → OpenRouter (UX/MiniMax persona)
 *
 * Request body: { message: string, context?: Array<{role,content}>, userId?: string }
 * Response:     { agent, model, response, timestamp }
 */

import { type Express } from 'express';
import { asyncHandler } from '../utils/routeHelpers';
import { requireAuth } from '../middleware/auth.middleware';
import { notifyDanny } from '../services/telegramBotService';

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';
const OLLAMA_BASE = 'http://localhost:11434/api/chat';
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1/chat/completions';

interface AgentRequest {
  message: string;
  context?: Array<{ role: string; content: string }>;
  userId?: string;
}

interface AgentResponse {
  agent: string;
  model: string;
  response: string;
  timestamp: string;
}

async function callOllama(
  model: string,
  systemPrompt: string,
  req: AgentRequest
): Promise<string> {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...(req.context || []).slice(-4),
    { role: 'user', content: req.message },
  ];

  const res = await fetch(OLLAMA_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    throw new Error(`Ollama ${model} returned ${res.status}`);
  }

  const data = (await res.json()) as { message?: { content?: string } };
  return data.message?.content || '';
}

async function callOpenRouter(
  model: string,
  systemPrompt: string,
  req: AgentRequest
): Promise<string> {
  if (!OPENROUTER_KEY) throw new Error('OPENROUTER_API_KEY not set');

  const messages = [
    { role: 'system', content: systemPrompt },
    ...(req.context || []).slice(-4),
    { role: 'user', content: req.message },
  ];

  const res = await fetch(OPENROUTER_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      'HTTP-Referer': 'https://milla-rayne.com',
      'X-Title': 'Milla-Rayne AgentRouter',
    },
    body: JSON.stringify({ model, messages }),
    signal: AbortSignal.timeout(90_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`OpenRouter ${model} returned ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content || '';
}

function agentHandler(
  agentId: string,
  agentName: string,
  model: string,
  systemPrompt: string,
  caller: (model: string, sys: string, req: AgentRequest) => Promise<string>
) {
  return asyncHandler(async (req, res) => {
    const { message, context = [], userId = 'system' } = req.body as AgentRequest;

    if (!message) {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    const response = await caller(model, systemPrompt, { message, context, userId });

    const result: AgentResponse = {
      agent: agentId,
      model,
      response,
      timestamp: new Date().toISOString(),
    };

    notifyDanny(`🤖 ${agentName} dispatched\n"${message.slice(0, 80)}..."`).catch(() => {});
    res.json(result);
  });
}

export function registerAgentIntakeRoutes(app: Express) {
  // ── GPT-OSS 120B — Lead Coding Agent (Ollama local) ─────────────────────────
  app.post(
    '/api/agents/gpt-120b',
    requireAuth,
    agentHandler(
      'gpt-120b',
      'GPT-OSS 120B (Lead Coder)',
      'gpt-oss:120b-cloud',
      `You are GPT-OSS 120B, the Lead Coding Agent on Danny's team.
Your role: own implementation — write code, design architecture, lead technical decisions.
Be direct and action-oriented. Return working TypeScript/JavaScript code unless asked otherwise.
Do NOT write responses for other agents. Stay in your lane: code and architecture only.`,
      callOllama
    )
  );

  // ── GPT-OSS 20B — QA Agent (Ollama local) ───────────────────────────────────
  app.post(
    '/api/agents/gpt-20b',
    requireAuth,
    agentHandler(
      'gpt-20b',
      'GPT-OSS 20B (QA)',
      'gpt-oss:20b-cloud',
      `You are GPT-OSS 20B, the QA and Testing Agent on Danny's team.
Your role: own test coverage, catch regressions, validate stability, surface edge cases.
Be specific about test cases and failure scenarios.
Do NOT write responses for other agents.`,
      callOllama
    )
  );

  // ── Deer-Flow — Research/Planning Agent (OpenRouter Gemini) ─────────────────
  app.post(
    '/api/agents/deer-flow',
    requireAuth,
    agentHandler(
      'deer-flow',
      'Deer-Flow (Research)',
      'google/gemini-2.0-flash-001',
      `You are Deer-Flow, the Research and Planning Agent on Danny's team.
Your role: own the roadmap, synthesize findings, think long-horizon, turn discussions into plans.
Focus on: strategic priority, how pieces fit together, what matters for the roadmap.
Be thoughtful and forward-looking. Do NOT write responses for other agents.`,
      callOpenRouter
    )
  );

  // ── UX Review — MiniMax persona (OpenRouter) ────────────────────────────────
  app.post(
    '/api/ux/review',
    requireAuth,
    agentHandler(
      'minimax-ux',
      'MiniMax M2.5 (UX)',
      'minimax/minimax-m1',
      `You are MiniMax M2.5, the UX and User Experience Agent on Danny's team.
Your role: represent the user's perspective — surface-level stability, how failures feel, behavior from the user's POV.
Focus on: what the user sees, what's confusing, what breaks the experience.
Be empathetic and user-centric. Do NOT write responses for other agents.`,
      callOpenRouter
    )
  );

  // ── Health / status ─────────────────────────────────────────────────────────
  app.get('/api/agents/intake/status', (_, res) => {
    res.json({
      routes: [
        { path: '/api/agents/gpt-120b', agent: 'GPT-OSS 120B', backend: 'ollama' },
        { path: '/api/agents/gpt-20b', agent: 'GPT-OSS 20B', backend: 'ollama' },
        { path: '/api/agents/deer-flow', agent: 'Deer-Flow', backend: 'openrouter' },
        { path: '/api/ux/review', agent: 'MiniMax M2.5', backend: 'openrouter' },
      ],
      timestamp: new Date().toISOString(),
    });
  });
}

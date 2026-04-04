import { type Express } from 'express';
import { registerAuthRoutes } from './auth.routes';
import { registerChatRoutes } from './chat.routes';
import { registerAgentRoutes } from './agent.routes';
import { registerMediaRoutes } from './media.routes';
import { registerSystemRoutes } from './system.routes';
import { registerMemoryRoutes } from './memory.routes';
import { registerMonitoringRoutes } from './monitoring.routes';
import { registerSandboxRoutes } from './sandbox.routes';
import { registerGoogleRoutes } from './google.routes';
import { registerGoogleTtsRoutes } from './google-tts.routes';
import { registerTTSRoutes } from './tts.routes';
import { registerPersonalTaskRoutes } from './personalTask.routes';
import { registerMerchRoutes } from './merch.routes';
import { registerCyclesRoutes } from './cycles.routes';
import { registerVisionRoutes } from './vision.routes';
import { registerPrivacyRoutes } from './privacy.routes';
import { registerLAMRoutes } from './lam.routes';
import { registerAxiomRoutes } from './axiom.routes';
import { registerSkillsRoutes } from './skills.routes';
import { registerExecutionRoutes } from './execution.routes';
import {
  startTelegramPolling,
  isTelegramConfigured,
} from '../services/telegramBotService';
import { discoverNewSounds, listSounds, pickSoundForContext } from '../services/soundEffectsService';
import { registerCopilotRoutes } from './copilot.routes';
import { registerAgentIntakeRoutes } from './agents.intake.routes';
import { listRoutes, reloadAgentRouter } from '../services/agentRouterService';

/**
 * Main router that aggregates all modular routes
 */
export async function registerModularRoutes(app: Express) {
  // Authentication routes
  registerAuthRoutes(app);

  // Chat and AI routes
  registerChatRoutes(app);

  // Agent and Task routes
  registerAgentRoutes(app);

  // Media and Analysis routes
  registerMediaRoutes(app);

  // Memory and Messaging routes
  registerMemoryRoutes(app);

  // Monitoring and System routes
  registerSystemRoutes(app);
  registerMonitoringRoutes(app);

  // Sandbox and Google routes
  registerSandboxRoutes(app);
  registerGoogleRoutes(app);
  registerGoogleTtsRoutes(app);
  registerTTSRoutes(app);
  registerPersonalTaskRoutes(app);

  // Merch routes
  registerMerchRoutes(app);

  // GIM/REM cycles + Gmail + Telegram REST routes
  registerCyclesRoutes(app);

  // Vision analysis + pixel grounding routes
  registerVisionRoutes(app);

  // Privacy policy static page
  registerPrivacyRoutes(app);

  // LAM (Large Action Model) execution + SLM routing + training data pipeline
  registerLAMRoutes(app);

  // Axiom dashboard — git, files, system, logs, cast, cron, briefs, swarm, model
  registerAxiomRoutes(app);

  // Skills registry — list, get, build prompt/tools for FE dev, BE dev, computer use, MCP creator, file access
  registerSkillsRoutes(app);

  // Code execution (Python, Node.js, bash) + Computer Use (screenshot, click, type, scroll, …)
  registerExecutionRoutes(app);

  // TV control routes (Vizio SmartCast + Google Cast + YouTube)
  const { registerTvRoutes } = await import('./tv.routes');
  registerTvRoutes(app);

  // RAG search + manual indexing routes
  const { registerRagRoutes } = await import('./rag.routes');
  registerRagRoutes(app);

  // Milla mood lighting (Monster RGB strip)
  const lightingRouter = (await import('./lighting.routes')).default;
  app.use('/api/lighting', lightingRouter);

  // Start Telegram long-polling if token is configured
  if (isTelegramConfigured()) {
    startTelegramPolling();
  }

  // Copilot review intake — Milla can POST here to get code/arch review
  registerCopilotRoutes(app);

  // Agent intake routes — real endpoints agentRouter.json dispatches to
  registerAgentIntakeRoutes(app);

  // AgentRouter — list available routes, hot-reload config
  app.get('/api/agents/routes', (_req, res) => res.json({ routes: listRoutes() }));
  app.post('/api/agents/reload', (_req, res) => { reloadAgentRouter(); res.json({ ok: true }); });

  // Discover any new ElevenLabs sound effects dropped into voice/sounds/
  discoverNewSounds();

  // Sound effects API — Milla picks contextual sounds, client plays them
  app.get('/api/sounds', (_req, res) => {
    res.json({ sounds: listSounds() });
  });
  app.get('/api/sounds/pick', (req, res) => {
    const context = String(req.query.context || '');
    const sound = pickSoundForContext(context);
    res.json({ sound: sound ?? null });
  });

  return app;
}

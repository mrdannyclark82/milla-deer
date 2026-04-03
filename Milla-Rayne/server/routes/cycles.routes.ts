import { Router, type Express } from 'express';
import {
  getConsciousnessSchedulerStatus,
  triggerConsciousnessCycle,
  getLatestMonologue,
} from '../consciousnessScheduler';
import {
  getTelegramStatus,
  isTelegramConfigured,
} from '../services/telegramBotService';
import {
  composeEmail,
  isGmailConfigured,
} from '../services/gmailComposeService';
import { asyncHandler } from '../utils/routeHelpers';

export function registerCyclesRoutes(app: Express) {
  const router = Router();

  // ── GIM/REM scheduler status ──────────────────────────────────────────────

  router.get(
    '/cycles/status',
    asyncHandler(async (_req, res) => {
      const status = getConsciousnessSchedulerStatus();
      const snippet = getLatestMonologue(200);
      res.json({ ...status, monologueSnippet: snippet });
    })
  );

  router.post(
    '/cycles/:cycle/trigger',
    asyncHandler(async (req, res) => {
      const cycle = req.params.cycle as 'gim' | 'rem';
      if (cycle !== 'gim' && cycle !== 'rem') {
        res.status(400).json({ error: 'Cycle must be "gim" or "rem"' });
        return;
      }
      const result = await triggerConsciousnessCycle(cycle);
      res.json({ triggered: cycle, result });
    })
  );

  router.get(
    '/cycles/monologue',
    asyncHandler(async (_req, res) => {
      const text = getLatestMonologue(2000);
      res.json({ monologue: text });
    })
  );

  // ── Gmail compose ─────────────────────────────────────────────────────────

  router.post(
    '/gmail/compose',
    asyncHandler(async (req, res) => {
      const { to, subject, body } = req.body as {
        to: string;
        subject: string;
        body: string;
      };
      if (!to || !subject || !body) {
        res.status(400).json({ error: 'to, subject, and body are required' });
        return;
      }
      const result = await composeEmail({ to, subject, body });
      res.json(result);
    })
  );

  router.get(
    '/gmail/status',
    asyncHandler(async (_req, res) => {
      res.json({ configured: isGmailConfigured() });
    })
  );

  // ── Telegram status ───────────────────────────────────────────────────────

  router.get(
    '/telegram/status',
    asyncHandler(async (_req, res) => {
      const status = getTelegramStatus();
      res.json(status);
    })
  );

  app.use('/api', router);
}

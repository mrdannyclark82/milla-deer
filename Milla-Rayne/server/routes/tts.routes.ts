import { Router, type Express, Request, Response } from 'express';
import {
  generateCoquiSpeech,
  getCoquiSpeechCacheStats,
} from '../api/coquiService';
import { generateElevenLabsSpeech } from '../api/elevenLabsService';
import { generatePiperSpeech, isPiperAvailable } from '../api/kokoroService';
import { cacheMiddleware } from '../middleware/caching';
import { asyncHandler } from '../utils/routeHelpers';

/**
 * Text-to-Speech Routes
 */
export function registerTTSRoutes(app: Express) {
  const router = Router();

  /**
   * POST /api/tts/speak
   * Unified TTS endpoint — tries ElevenLabs → OpenAI → Coqui in priority order.
   * Falls back gracefully; client handles browser synthesis when all return null.
   */
  router.post(
    '/tts/speak',
    asyncHandler(async (req: Request, res: Response) => {
      const { text } = req.body as { text?: string };
      if (!text?.trim()) {
        return res.status(400).json({ error: 'text is required' });
      }

      const truncated = text.slice(0, 4096); // hard cap

      // Priority chain: Piper (local Milla voice) → ElevenLabs → Coqui → browser fallback
      const audioUrl =
        (await generatePiperSpeech(truncated)) ??
        (await generateElevenLabsSpeech(truncated)) ??
        (await generateCoquiSpeech(truncated));

      if (!audioUrl) {
        // No server TTS available — tell client to use browser speech
        return res.json({ audioUrl: null, fallback: 'browser' });
      }

      return res.json({ audioUrl });
    })
  );

  /**
   * GET /api/coqui/stats
   * Get cache statistics
   */
  router.get(
    '/coqui/stats',
    cacheMiddleware(30),
    asyncHandler(async (req: Request, res: Response) => {
      const stats = getCoquiSpeechCacheStats();
      res.json({
        success: true,
        stats,
      });
    })
  );

  /**
   * GET /api/tts/status
   * Returns which TTS providers are currently available.
   */
  router.get(
    '/tts/status',
    asyncHandler(async (_req: Request, res: Response) => {
      const piperOnline = await isPiperAvailable();
      const elevenLabsConfigured = !!process.env.ELEVENLABS_API_KEY;
      const active = piperOnline ? 'piper' : elevenLabsConfigured ? 'elevenlabs' : 'browser';
      res.json({
        active,
        providers: {
          piper: piperOnline,
          elevenlabs: elevenLabsConfigured,
          browser: true,
        },
      });
    })
  );

  // Mount routes under /api
  app.use('/api', router);
}

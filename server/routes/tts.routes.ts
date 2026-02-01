import { Router, type Express, Request, Response } from 'express';
import { generateCoquiSpeech, getCoquiSpeechCacheStats } from '../api/coquiService';
import { asyncHandler } from '../utils/routeHelpers';

/**
 * Text-to-Speech Routes
 */
export function registerTTSRoutes(app: Express) {
  const router = Router();

  /**
   * POST /api/coqui/tts
   * Generate speech using Coqui TTS
   */
  router.post('/coqui/tts', asyncHandler(async (req: Request, res: Response) => {
    const { text, voiceId } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    // Call Coqui service
    const audioUrl = await generateCoquiSpeech(text, voiceId);

    if (!audioUrl) {
      return res.status(500).json({
        error: 'Failed to generate speech. Ensure Coqui TTS server is running and configured.'
      });
    }

    res.json({
      success: true,
      audioUrl,
    });
  }));

  /**
   * GET /api/coqui/stats
   * Get cache statistics
   */
  router.get('/coqui/stats', asyncHandler(async (req: Request, res: Response) => {
    const stats = getCoquiSpeechCacheStats();
    res.json({
      success: true,
      stats,
    });
  }));

  // Mount routes under /api
  app.use('/api', router);
}

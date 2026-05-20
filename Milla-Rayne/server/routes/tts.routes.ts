import { Router, type Express, Request, Response } from 'express';
import {
  generateCoquiSpeech,
  getCoquiSpeechCacheStats,
} from '../api/coquiService';
import { generateElevenLabsSpeech } from '../api/elevenLabsService';
import { cacheMiddleware } from '../middleware/caching';
import { asyncHandler } from '../utils/routeHelpers';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// OpenAI TTS client — only initialised when OPENAI_API_KEY is set
let openaiTTS: OpenAI | null = null;
function getOpenAITTS() {
  if (!openaiTTS && process.env.OPENAI_API_KEY) {
    openaiTTS = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiTTS;
}

async function generateOpenAISpeech(text: string): Promise<string | null> {
  const client = getOpenAITTS();
  if (!client) return null;
  try {
    const audioDir = path.resolve(process.cwd(), 'client', 'public', 'audio');
    if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });
    const hash = crypto.createHash('sha256').update(`openai:nova:${text}`).digest('hex');
    const filePath = path.join(audioDir, `${hash}.mp3`);
    if (!fs.existsSync(filePath)) {
      const mp3 = await client.audio.speech.create({
        model: 'tts-1',
        voice: 'nova',
        input: text,
      });
      const buffer = Buffer.from(await mp3.arrayBuffer());
      fs.writeFileSync(filePath, buffer);
    }
    return `/audio/${hash}.mp3`;
  } catch {
    return null;
  }
}

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

      // Priority chain
      const audioUrl =
        (await generateElevenLabsSpeech(truncated)) ??
        (await generateOpenAISpeech(truncated)) ??
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

  // Mount routes under /api
  app.use('/api', router);
}

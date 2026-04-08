import { Router, type Express, Request, Response } from 'express';
import { getSpeechCacheStats } from '../api/elevenLabsService';
import { asyncHandler } from '../utils/routeHelpers';
import fetch from 'node-fetch';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const DEFAULT_VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? '21m00Tcm4TlvDq8ikWAM';

export function registerElevenLabsRoutes(app: Express) {
  const router = Router();

  // Stream audio bytes directly back so the client can call response.blob()
  router.post(
    '/elevenlabs/tts',
    asyncHandler(async (req: Request, res: Response) => {
      const { text, voiceName } = req.body;
      if (!text) return res.status(400).json({ error: 'text is required' });
      if (!ELEVENLABS_API_KEY) return res.status(503).json({ error: 'ElevenLabs not configured' });

      const voiceId = voiceName ?? DEFAULT_VOICE_ID;

      const upstream = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          method: 'POST',
          headers: {
            Accept: 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': ELEVENLABS_API_KEY,
          },
          body: JSON.stringify({
            text,
            model_id: 'eleven_turbo_v2_5',
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          }),
        }
      );

      if (!upstream.ok) {
        console.error(`[ElevenLabs] ${upstream.status} ${upstream.statusText}`);
        return res.status(502).json({ error: 'ElevenLabs TTS failed', status: upstream.status });
      }

      res.setHeader('Content-Type', 'audio/mpeg');
      upstream.body!.pipe(res);
    })
  );

  router.get('/elevenlabs/stats', asyncHandler(async (_req, res) => {
    res.json(getSpeechCacheStats());
  }));

  app.use('/api', router);
}

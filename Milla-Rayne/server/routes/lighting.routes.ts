import { Router, Request, Response } from 'express';
import { millaLighting, MOOD_PROFILES, detectMoodFromText, type MillaMood } from '../services/millaLightingService';

const router = Router();

/** GET /api/lighting/status — current mood + available profiles */
router.get('/status', (_req: Request, res: Response) => {
  res.json({
    currentMood: millaLighting.getCurrentMood(),
    moods: Object.keys(MOOD_PROFILES),
    profiles: MOOD_PROFILES,
  });
});

/** POST /api/lighting/mood — set mood manually */
router.post('/mood', async (req: Request, res: Response) => {
  const { mood } = req.body as { mood?: MillaMood };
  if (!mood || !(mood in MOOD_PROFILES)) {
    return res.status(400).json({ error: `Invalid mood. Valid: ${Object.keys(MOOD_PROFILES).join(', ')}` });
  }
  await millaLighting.setMood(mood);
  res.json({ ok: true, mood });
});

/** POST /api/lighting/detect — detect mood from text and apply */
router.post('/detect', async (req: Request, res: Response) => {
  const { text } = req.body as { text?: string };
  if (!text) return res.status(400).json({ error: 'text required' });
  const mood = detectMoodFromText(text);
  await millaLighting.setMood(mood);
  res.json({ ok: true, mood });
});

/** POST /api/lighting/toggle — enable/disable */
router.post('/toggle', (req: Request, res: Response) => {
  const { enabled } = req.body as { enabled?: boolean };
  millaLighting.setEnabled(enabled ?? true);
  res.json({ ok: true, enabled });
});

/** POST /api/lighting/discover — scan network for the strip */
router.post('/discover', async (_req: Request, res: Response) => {
  const ip = await millaLighting.discoverDevice();
  res.json({ found: !!ip, ip });
});

export default router;

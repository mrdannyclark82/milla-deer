import { Router } from 'express';
import {
  executeTvCommand,
  startVisioPairing,
  completeVisioPairing,
  getYoutubeTVPairingCode,
  type TvCommand,
} from '../services/tvControlService.js';

const router = Router();

// POST /api/tv/command — direct command
// Body: { command: TvCommand, payload?: { query?, videoId?, volume? } }
router.post('/command', async (req, res) => {
  const { command, payload } = req.body as {
    command: TvCommand;
    payload?: { query?: string; videoId?: string; volume?: number };
  };
  if (!command) {
    res.status(400).json({ success: false, message: 'command is required' });
    return;
  }
  const result = await executeTvCommand(command, payload);
  res.json(result);
});

// POST /api/tv/pair/start — show PIN on Vizio TV
router.post('/pair/start', async (_req, res) => {
  const result = await startVisioPairing();
  res.json(result);
});

// POST /api/tv/pair/complete — enter PIN + pairing token
// Body: { pin: string, pairingToken: string }
router.post('/pair/complete', async (req, res) => {
  const { pin, pairingToken } = req.body as { pin: string; pairingToken: string };
  if (!pin || !pairingToken) {
    res.status(400).json({ success: false, message: 'pin and pairingToken required' });
    return;
  }
  const result = await completeVisioPairing(pin, pairingToken);
  res.json(result);
});

// GET /api/tv/youtube-pair — get pairing code to link Milla with YouTube on TV
router.get('/youtube-pair', async (_req, res) => {
  const result = await getYoutubeTVPairingCode();
  if (!result) {
    res.status(500).json({ success: false, message: 'Failed to generate YouTube TV pairing code' });
    return;
  }
  res.json({
    success: true,
    code: result.code,
    url: result.url,
    instructions: `On your Vizio TV open YouTube → Settings → Link with TV code → enter: ${result.code}`,
  });
});

export default router;

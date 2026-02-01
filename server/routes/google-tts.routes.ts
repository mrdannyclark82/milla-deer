import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { generateGoogleCloudSpeech } from '../api/googleTtsService';
import { asyncHandler } from '../utils/routeHelpers';

export function registerGoogleTtsRoutes(app: any) {
  const router = Router();

  router.post('/google/tts', asyncHandler(async (req, res) => {
    const { text, voiceName, config } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const audioUrl = await generateGoogleCloudSpeech(
      text,
      voiceName,
      config
    );

    if (!audioUrl) {
      return res.status(500).json({ error: 'Failed to generate speech' });
    }

    // Resolve file path from the public URL
    // The URL is like /audio/filename.mp3
    // The file is in client/public/audio/filename.mp3
    const relativePath = audioUrl.replace('/audio/', '');
    const audioFilePath = path.resolve(process.cwd(), 'client', 'public', 'audio', relativePath);

    if (!fs.existsSync(audioFilePath)) {
        return res.status(500).json({ error: 'Generated audio file not found' });
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    const stream = fs.createReadStream(audioFilePath);
    stream.pipe(res);
  }));

  app.use('/api', router);
}

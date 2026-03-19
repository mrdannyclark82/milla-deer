import { Router, type Express } from 'express';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { analyzeVideo, generateVideoInsights } from '../gemini';
import {
  analyzeYouTubeVideo,
  isValidYouTubeUrl,
} from '../youtubeAnalysisService';
import {
  getMoodBackground,
  getCachedMoodBackgrounds,
  pregenerateAllMoodBackgrounds,
} from '../moodBackgroundService';
import { generateImage, formatImageResponse } from '../imageService';
import { generateImageWithPollinations } from '../pollinationsImageService';
import { dispatchAIResponse } from '../aiDispatcherService';
import { upload } from '../middleware/upload.middleware';
import { asyncHandler } from '../utils/routeHelpers';

/**
 * Media and Analysis Routes
 */
export function registerMediaRoutes(app: Express) {
  const router = Router();
  const aspectRatioToSize = (
    aspectRatio?: string
  ): { width: number; height: number } => {
    switch (aspectRatio) {
      case '16:9':
        return { width: 1280, height: 720 };
      case '9:16':
        return { width: 720, height: 1280 };
      case '4:3':
        return { width: 1024, height: 768 };
      case '3:4':
        return { width: 768, height: 1024 };
      case '1:1':
      default:
        return { width: 1024, height: 1024 };
      }
  };
  const contactIconPath = path.resolve(
    import.meta.dirname,
    '..',
    '..',
    '..',
    'milla_deer.jpg'
  );
  const welcomeVideoPath = path.resolve(
    import.meta.dirname,
    '..',
    '..',
    '..',
    'Welcome_Milla.mp4'
  );
  const workingVideoPath = path.resolve(
    import.meta.dirname,
    '..',
    '..',
    '..',
    'Milla_working.mp4'
  );
  const loopVideoPath = path.resolve(
    import.meta.dirname,
    '..',
    '..',
    '..',
    'milla_loop.mp4'
  );
  const mediaVideoPath = path.resolve(
    import.meta.dirname,
    '..',
    '..',
    '..',
    'milla_media.mp4'
  );
  const studioVideoPath = path.resolve(
    import.meta.dirname,
    '..',
    '..',
    '..',
    'milla_studio.mp4'
  );

  router.get(
    '/assets/contact-icon',
    asyncHandler(async (_req, res) => {
      if (!fs.existsSync(contactIconPath)) {
        return res.status(404).json({ error: 'Contact image not found' });
      }

      res.sendFile(contactIconPath);
    })
  );

  router.get(
    '/assets/welcome-video',
    asyncHandler(async (_req, res) => {
      if (!fs.existsSync(welcomeVideoPath)) {
        return res.status(404).json({ error: 'Welcome video not found' });
      }

      res.sendFile(welcomeVideoPath);
    })
  );

  router.get(
    '/assets/working-video',
    asyncHandler(async (_req, res) => {
      if (!fs.existsSync(workingVideoPath)) {
        return res.status(404).json({ error: 'Working video not found' });
      }

      res.sendFile(workingVideoPath);
    })
  );

  router.get(
    '/assets/loop-video',
    asyncHandler(async (_req, res) => {
      if (!fs.existsSync(loopVideoPath)) {
        return res.status(404).json({ error: 'Loop video not found' });
      }

      res.sendFile(loopVideoPath);
    })
  );

  router.get(
    '/assets/media-video',
    asyncHandler(async (_req, res) => {
      if (!fs.existsSync(mediaVideoPath)) {
        return res.status(404).json({ error: 'Media video not found' });
      }

      res.sendFile(mediaVideoPath);
    })
  );

  router.get(
    '/assets/studio-video',
    asyncHandler(async (_req, res) => {
      if (!fs.existsSync(studioVideoPath)) {
        return res.status(404).json({ error: 'Studio video not found' });
      }

      res.sendFile(studioVideoPath);
    })
  );

  // Video analysis from file upload
  router.post(
    '/analyze-video',
    upload.single('video'),
    asyncHandler(async (req, res) => {
      if (!req.file) {
        return res.status(400).json({ error: 'No video file provided' });
      }

      const videoBuffer = req.file.buffer;
      const mimeType = req.file.mimetype;

      const analysis = await analyzeVideo(videoBuffer, mimeType);
      const insights = await generateVideoInsights(analysis);

      res.json({
        ...analysis,
        insights,
      });
    })
  );

  // YouTube video analysis
  router.post(
    '/analyze-youtube',
    asyncHandler(async (req, res) => {
      const { url } = req.body;

      if (!url) {
        return res.status(400).json({ error: 'YouTube URL is required' });
      }

      if (!isValidYouTubeUrl(url)) {
        return res.status(400).json({ error: 'Invalid YouTube URL provided' });
      }

      // Pass AI service for intelligent analysis
      const aiService = {
        generateResponse: async (prompt: string, options: any) => {
          return await dispatchAIResponse(
            prompt,
            { userId: null, conversationHistory: [], userName: 'System' },
            options
          );
        },
      };

      const analysis = await analyzeYouTubeVideo(url, aiService);

      res.json({
        success: true,
        analysis,
        message: `Successfully analyzed "${analysis.videoInfo.title}"!`,
      });
    })
  );

  // Active Listening
  router.post(
    '/active-listening/start',
    asyncHandler(async (req, res) => {
      const { videoId, videoContext } = req.body;

      if (!videoId || !videoContext) {
        return res
          .status(400)
          .json({ error: 'Video ID and context are required' });
      }

      const { startActiveListening } =
        await import('../activeListeningService');
      const result = await startActiveListening(videoId, videoContext);

      res.json({
        success: true,
        message: 'Active listening started',
        videoId,
        insightCount: result.insightCount,
        pausePoints: result.pausePoints,
      });
    })
  );

  router.post(
    '/active-listening/stop',
    asyncHandler(async (req, res) => {
      const { stopActiveListening } = await import('../activeListeningService');
      stopActiveListening();

      res.json({ success: true, message: 'Active listening stopped' });
    })
  );

  // Image Generation
  router.post(
    '/image/generate',
    asyncHandler(async (req, res) => {
      const { prompt, aspectRatio, model } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
      }

      let imageResult;

      if (model) {
        const size = aspectRatioToSize(aspectRatio);
        imageResult = await generateImageWithPollinations(prompt, {
          width: size.width,
          height: size.height,
          model,
        });
        if (!imageResult.success) {
          console.warn(
            'Studio image generation via Pollinations failed, falling back:',
            imageResult.error
          );
          imageResult = await generateImage(prompt);
        }
      } else {
        imageResult = await generateImage(prompt);
        if (!imageResult.success) {
          console.warn(
            'Default image backend failed, falling back to Pollinations:',
            imageResult.error
          );
          imageResult = await generateImageWithPollinations(prompt, {
            width: 1024,
            height: 1024,
            model: 'flux',
          });
        }
      }

      res.json({
        success: imageResult.success,
        imageUrl: imageResult.imageUrl,
        error: imageResult.error,
        response: formatImageResponse(
          prompt,
          imageResult.success,
          imageResult.imageUrl,
          imageResult.error
        ),
      });
    })
  );

  // Scene Mood Backgrounds
  router.get(
    '/scene/mood-background/:mood',
    asyncHandler(async (req, res) => {
      const mood = req.params.mood as string;
      const forceRegenerate = req.query.regenerate === 'true';

      const validMoods = [
        'calm',
        'energetic',
        'romantic',
        'mysterious',
        'playful',
      ];
      if (!validMoods.includes(mood)) {
        return res.status(400).json({
          error: `Invalid mood. Must be one of: ${validMoods.join(', ')}`,
        });
      }

      const result = await getMoodBackground(mood as any, forceRegenerate);

      if (result.success) {
        res.json({
          success: true,
          imageUrl: result.imageUrl,
          mood,
          cached: result.cached,
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error || 'Failed to generate mood background',
        });
      }
    })
  );

  router.get(
    '/scene/mood-backgrounds',
    asyncHandler(async (req, res) => {
      const cached = getCachedMoodBackgrounds();
      res.json({ success: true, backgrounds: cached });
    })
  );

  router.post(
    '/scene/mood-backgrounds/pregenerate',
    asyncHandler(async (req, res) => {
      pregenerateAllMoodBackgrounds().catch((err) =>
        console.error('Background pregeneration error:', err)
      );
      res.json({ success: true, message: 'Background pregeneration started' });
    })
  );

  // Mount routes
  app.use('/api', router);
}

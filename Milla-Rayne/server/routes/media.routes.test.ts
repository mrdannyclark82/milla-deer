import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { registerMediaRoutes } from './media.routes';
import * as youtubeAnalysis from '../youtubeAnalysisService';
import * as moodBackground from '../moodBackgroundService';
import * as pollinationsImageService from '../pollinationsImageService';
import * as imageService from '../imageService';

vi.mock('../gemini');
vi.mock('../youtubeAnalysisService');
vi.mock('../moodBackgroundService');
vi.mock('../aiDispatcherService');
vi.mock('../pollinationsImageService');
vi.mock('../imageService');

describe('Media Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    registerMediaRoutes(app);
    vi.clearAllMocks();
  });

  describe('POST /api/analyze-youtube', () => {
    it('should analyze a youtube video', async () => {
      vi.spyOn(youtubeAnalysis, 'isValidYouTubeUrl').mockReturnValue(true);
      vi.spyOn(youtubeAnalysis, 'analyzeYouTubeVideo').mockResolvedValue({
        videoInfo: { title: 'Test Video' },
      } as any);

      const response = await request(app)
        .post('/api/analyze-youtube')
        .send({ url: 'https://youtube.com/watch?v=123' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Test Video');
    });

    it('should return 400 for invalid url', async () => {
      vi.spyOn(youtubeAnalysis, 'isValidYouTubeUrl').mockReturnValue(false);
      const response = await request(app)
        .post('/api/analyze-youtube')
        .send({ url: 'invalid' });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/scene/mood-backgrounds', () => {
    it('should return cached backgrounds', async () => {
      vi.spyOn(moodBackground, 'getCachedMoodBackgrounds').mockReturnValue([
        'bg1.jpg',
      ]);
      const response = await request(app).get('/api/scene/mood-backgrounds');

      expect(response.status).toBe(200);
      expect(response.body.backgrounds).toContain('bg1.jpg');
    });
  });

  describe('GET /api/assets/contact-icon', () => {
    it('should serve the configured contact icon when present', async () => {
      const response = await request(app).get('/api/assets/contact-icon');

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/assets/avatar videos', () => {
    it('should serve the loop avatar video when present', async () => {
      const response = await request(app).get('/api/assets/loop-video');

      expect(response.status).toBe(200);
    });

    it('should serve the media avatar video when present', async () => {
      const response = await request(app).get('/api/assets/media-video');

      expect(response.status).toBe(200);
    });

    it('should serve the studio avatar video when present', async () => {
      const response = await request(app).get('/api/assets/studio-video');

      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/image/generate', () => {
    it('should use pollinations when a studio model is requested', async () => {
      vi.spyOn(
        pollinationsImageService,
        'generateImageWithPollinations'
      ).mockResolvedValue({
        success: true,
        imageUrl: 'https://image.pollinations.ai/test.png',
      });

      const response = await request(app).post('/api/image/generate').send({
        prompt: 'cyberpunk milla portrait',
        aspectRatio: '1:1',
        model: 'flux-3d',
      });

      expect(response.status).toBe(200);
      expect(
        pollinationsImageService.generateImageWithPollinations
      ).toHaveBeenCalledWith('cyberpunk milla portrait', {
        width: 1024,
        height: 1024,
        model: 'flux-3d',
      });
      expect(response.body.imageUrl).toBe(
        'https://image.pollinations.ai/test.png'
      );
    });

    it('should fall back to the default image backend when pollinations fails', async () => {
      vi.spyOn(
        pollinationsImageService,
        'generateImageWithPollinations'
      ).mockResolvedValue({
        success: false,
        error: 'Pollinations failed',
      });
      vi.spyOn(imageService, 'generateImage').mockResolvedValue({
        success: true,
        imageUrl: 'data:image/png;base64,fallback',
      });

      const response = await request(app).post('/api/image/generate').send({
        prompt: 'cyberpunk milla portrait',
        aspectRatio: '1:1',
        model: 'flux-realism',
      });

      expect(response.status).toBe(200);
      expect(imageService.generateImage).toHaveBeenCalledWith(
        'cyberpunk milla portrait'
      );
      expect(response.body.imageUrl).toBe('data:image/png;base64,fallback');
    });

    it('should fall back to pollinations when the default backend fails', async () => {
      vi.spyOn(imageService, 'generateImage').mockResolvedValue({
        success: false,
        error: 'Hugging Face authentication failed',
      });
      vi.spyOn(
        pollinationsImageService,
        'generateImageWithPollinations'
      ).mockResolvedValue({
        success: true,
        imageUrl: 'https://image.pollinations.ai/fallback.png',
      });

      const response = await request(app).post('/api/image/generate').send({
        prompt: 'forest spirit portrait',
      });

      expect(response.status).toBe(200);
      expect(imageService.generateImage).toHaveBeenCalledWith(
        'forest spirit portrait'
      );
      expect(
        pollinationsImageService.generateImageWithPollinations
      ).toHaveBeenCalledWith('forest spirit portrait', {
        width: 1024,
        height: 1024,
        model: 'flux',
      });
      expect(response.body.imageUrl).toBe(
        'https://image.pollinations.ai/fallback.png'
      );
    });
  });
});

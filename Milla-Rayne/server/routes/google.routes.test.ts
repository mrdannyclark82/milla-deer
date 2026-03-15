import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { registerGoogleRoutes } from './google.routes';
import * as authService from '../authService';
import * as googleYoutubeService from '../googleYoutubeService';

vi.mock('../authService');
vi.mock('../googleYoutubeService');

describe('Google Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    registerGoogleRoutes(app);
    vi.clearAllMocks();
  });

  it('returns compatible auth state payload', async () => {
    const response = await request(app).get('/api/oauth/authenticated');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      authenticated: false,
      isAuthenticated: false,
    });
  });

  it('searches YouTube videos', async () => {
    vi.spyOn(authService, 'validateSession').mockResolvedValue({ valid: false });
    vi.spyOn(googleYoutubeService, 'searchVideos').mockResolvedValue({
      success: true,
      message: 'Search successful',
      data: [{ id: { videoId: 'abc123' }, snippet: { title: 'Test Video' } }],
    });

    const response = await request(app).get('/api/youtube/search?query=test');

    expect(response.status).toBe(200);
    expect(googleYoutubeService.searchVideos).toHaveBeenCalledWith(
      'default-user',
      'test',
      8,
      'relevance'
    );
    expect(response.body.success).toBe(true);
  });

  it('fetches YouTube subscriptions', async () => {
    vi.spyOn(authService, 'validateSession').mockResolvedValue({ valid: false });
    vi.spyOn(googleYoutubeService, 'getMySubscriptions').mockResolvedValue({
      success: true,
      message: 'ok',
      data: [],
    });

    const response = await request(app).get('/api/youtube/subscriptions');

    expect(response.status).toBe(200);
    expect(googleYoutubeService.getMySubscriptions).toHaveBeenCalledWith(
      'default-user',
      10
    );
  });
});

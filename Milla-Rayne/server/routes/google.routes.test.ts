import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { registerGoogleRoutes } from './google.routes';
import * as authService from '../authService';
import * as googleYoutubeService from '../googleYoutubeService';
import * as googleCalendarService from '../googleCalendarService';
import * as googleGmailService from '../googleGmailService';
import * as oauthService from '../oauthService';
import * as youtubeNewsMonitor from '../youtubeNewsMonitor';

vi.mock('../authService');
vi.mock('../googleYoutubeService');
vi.mock('../googleCalendarService');
vi.mock('../googleGmailService');
vi.mock('../oauthService');
vi.mock('../youtubeNewsMonitor', async () => {
  const actual = await vi.importActual<typeof import('../youtubeNewsMonitor')>(
    '../youtubeNewsMonitor'
  );
  return {
    ...actual,
    runDailyNewsSearch: vi.fn(),
  };
});

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
    vi.spyOn(authService, 'validateSession').mockResolvedValue({ valid: false });

    const response = await request(app).get('/api/oauth/authenticated');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      authenticated: false,
      isAuthenticated: false,
    });
  });

  it('returns connected auth state when a signed-in user has Google linked', async () => {
    vi.spyOn(authService, 'validateSession').mockResolvedValue({
      valid: true,
      user: { id: 'user-1' } as any,
    });
    vi.spyOn(oauthService, 'isGoogleAuthenticated').mockResolvedValue(true);

    const response = await request(app)
      .get('/api/oauth/authenticated')
      .set('Cookie', ['session_token=valid-token']);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      authenticated: true,
      isAuthenticated: true,
    });
  });

  it('returns an authorization url for Google sign-in', async () => {
    vi.spyOn(oauthService, 'getAuthorizationUrl').mockReturnValue(
      'https://accounts.google.com/o/oauth2/v2/auth?client_id=test'
    );

    const response = await request(app).get('/api/auth/google/url');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test',
    });
  });

  it('supports the legacy oauth/google entry point', async () => {
    vi.spyOn(oauthService, 'getAuthorizationUrl').mockReturnValue(
      'https://accounts.google.com/o/oauth2/v2/auth?client_id=test'
    );

    const response = await request(app).get('/oauth/google');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth?client_id=test'
    );
  });

  it('disconnects Google for the signed-in user', async () => {
    vi.spyOn(authService, 'validateSession').mockResolvedValue({
      valid: true,
      user: { id: 'user-1' } as any,
    });
    vi.spyOn(oauthService, 'deleteOAuthToken').mockResolvedValue();

    const response = await request(app)
      .delete('/api/oauth/disconnect')
      .set('Cookie', ['session_token=valid-token']);

    expect(response.status).toBe(200);
    expect(oauthService.deleteOAuthToken).toHaveBeenCalledWith(
      'user-1',
      'google'
    );
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

  it('personalizes the daily brief using inbox and calendar context', async () => {
    vi.spyOn(authService, 'validateSession').mockResolvedValue({
      valid: true,
      user: { id: 'user-1' } as any,
    });
    vi.spyOn(youtubeNewsMonitor, 'runDailyNewsSearch').mockResolvedValue({
      date: '2026-03-18',
      categories: {
        AI: [
          {
            videoId: 'ai-1',
            title: 'Gemini update for developers',
            channel: 'AI Daily',
            publishedAt: '2026-03-18T10:00:00.000Z',
            category: 'AI',
            relevanceScore: 40,
          },
        ],
        GitHub: [
          {
            videoId: 'gh-1',
            title: 'GitHub Actions shipping guide',
            channel: 'DevOps Weekly',
            publishedAt: '2026-03-18T09:00:00.000Z',
            category: 'GitHub',
            relevanceScore: 35,
          },
        ],
      },
      topStories: [
        {
          videoId: 'gh-1',
          title: 'GitHub Actions shipping guide',
          channel: 'DevOps Weekly',
          publishedAt: '2026-03-18T09:00:00.000Z',
          category: 'GitHub',
          relevanceScore: 35,
        },
        {
          videoId: 'ai-1',
          title: 'Gemini update for developers',
          channel: 'AI Daily',
          publishedAt: '2026-03-18T10:00:00.000Z',
          category: 'AI',
          relevanceScore: 40,
        },
      ],
      totalVideos: 2,
      analysisCount: 0,
    });
    vi.spyOn(googleGmailService, 'getRecentEmails').mockResolvedValue({
      success: true,
      data: [
        {
          id: 'msg-1',
          threadId: 'thread-1',
          snippet: 'The latest GitHub Actions rollout is ready for review.',
          labelIds: ['UNREAD'],
          internalDate: '2026-03-18T08:00:00.000Z',
          payload: {
            headers: [
              { name: 'From', value: 'deploy@github.com' },
              { name: 'Subject', value: 'GitHub Actions deployment update' },
              { name: 'Date', value: 'Wed, 18 Mar 2026 08:00:00 GMT' },
            ],
          },
        },
      ],
    } as any);
    vi.spyOn(googleCalendarService, 'listEvents').mockResolvedValue({
      success: true,
      events: [
        {
          id: 'event-1',
          summary: 'Gemini product sync',
          description: 'Review AI launch priorities',
          start: { dateTime: '2026-03-18T15:00:00.000Z' },
          end: { dateTime: '2026-03-18T16:00:00.000Z' },
          location: 'War room',
        },
      ],
    } as any);

    const response = await request(app)
      .get('/api/daily-brief')
      .set('Cookie', ['session_token=valid-token']);

    expect(response.status).toBe(200);
    expect(youtubeNewsMonitor.runDailyNewsSearch).toHaveBeenCalledWith('user-1');
    expect(response.body.personalization.focusAreas).toEqual(
      expect.arrayContaining(['GitHub', 'AI'])
    );
    expect(response.body.personalization.reasons[0]).toContain('elevated');
    expect(response.body.inboxSummary.unreadCount).toBe(1);
    expect(response.body.dailySchedule.count).toBe(1);
    expect(response.body.topStories[0].videoId).toBe('gh-1');
  });
});

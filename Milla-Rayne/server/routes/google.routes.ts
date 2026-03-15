import { Router, type Express } from 'express';
import { loginOrRegisterWithGoogle } from '../authService';
import { config } from '../config';
import { validateSession } from '../authService';
import {
  getMySubscriptions,
  getVideoDetails,
  searchVideos,
} from '../googleYoutubeService';
import { asyncHandler } from '../utils/routeHelpers';

/**
 * Google OAuth and Services Routes
 */
export function registerGoogleRoutes(app: Express) {
  const router = Router();

  const resolveUserId = async (sessionToken?: string) => {
    if (!sessionToken) return 'default-user';
    const sessionResult = await validateSession(sessionToken);
    if (sessionResult.valid && sessionResult.user?.id) {
      return sessionResult.user.id;
    }
    return 'default-user';
  };

  router.get('/auth/google/url', (req, res) => {
    const scope = ['profile', 'email', 'https://www.googleapis.com/auth/tasks'];
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${config.google.clientId}&redirect_uri=${encodeURIComponent(config.google.redirectUri || '')}&response_type=code&scope=${encodeURIComponent(scope.join(' '))}&access_type=offline&prompt=consent`;
    res.json({ url });
  });

  router.get(
    '/auth/google/callback',
    asyncHandler(async (req, res) => {
      const { code } = req.query;
      if (!code) return res.status(400).send('Code is required');

      try {
        const { exchangeCodeForToken, storeOAuthToken } = await import('../oauthService');

        // Exchange code for tokens
        const tokenData = await exchangeCodeForToken(code as string);

        // Fetch user info
        const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${tokenData.accessToken}` },
        });

        if (!userRes.ok) {
          return res.status(401).send('Failed to fetch user info from Google');
        }

        const profile = await userRes.json();

        // Login or register user
        const result = await loginOrRegisterWithGoogle(
          profile.email,
          profile.id,
          profile.name || profile.email.split('@')[0]
        );

        if (!result.success || !result.user) {
          return res.status(401).send(result.error || 'Authentication failed');
        }

        // Store OAuth token
        if (result.user.id) {
            await storeOAuthToken(
            result.user.id,
            'google',
            tokenData.accessToken,
            tokenData.refreshToken,
            tokenData.expiresIn,
            tokenData.scope
            );
        }

        res.cookie('session_token', result.sessionToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        res.redirect('/');
      } catch (error) {
        console.error('Google callback error:', error);
        res.status(500).send('Internal server error during authentication');
      }
    })
  );

  router.get('/oauth/authenticated', (req, res) => {
    const authenticated = !!req.cookies.session_token;
    res.json({ success: true, authenticated, isAuthenticated: authenticated });
  });

  router.get(
    '/youtube/subscriptions',
    asyncHandler(async (req, res) => {
      const maxResults = Number.parseInt(String(req.query.maxResults || '10'), 10);
      const userId = await resolveUserId(req.cookies.session_token);
      const result = await getMySubscriptions(userId, Number.isNaN(maxResults) ? 10 : maxResults);
      res.status(result.success ? 200 : 400).json(result);
    })
  );

  router.get(
    '/youtube/search',
    asyncHandler(async (req, res) => {
      const query = String(req.query.query || '').trim();
      const maxResults = Number.parseInt(String(req.query.maxResults || '8'), 10);
      const order = String(req.query.order || 'relevance');

      if (!query) {
        return res
          .status(400)
          .json({ success: false, message: 'Query is required', error: 'INVALID_INPUT' });
      }

      const userId = await resolveUserId(req.cookies.session_token);
      const result = await searchVideos(
        userId,
        query,
        Number.isNaN(maxResults) ? 8 : maxResults,
        order
      );
      res.status(result.success ? 200 : 400).json(result);
    })
  );

  router.get(
    '/youtube/videos/:videoId',
    asyncHandler(async (req, res) => {
      const { videoId } = req.params;
      const userId = await resolveUserId(req.cookies.session_token);
      const result = await getVideoDetails(videoId, userId);
      res.status(result.success ? 200 : 400).json(result);
    })
  );

  // Mount routes
  app.use('/api', router);
}

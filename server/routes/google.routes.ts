import { Router, type Express, type Request } from 'express';
import { loginOrRegisterWithGoogle, validateSession } from '../authService';
import { addNoteToGoogleTasks, listTasks } from '../googleTasksService';
import { getAuthorizationUrl, isGoogleAuthenticated } from '../oauthService';
import { asyncHandler } from '../utils/routeHelpers';

/**
 * Google OAuth and Services Routes
 */
export function registerGoogleRoutes(app: Express) {
  const router = Router();

  const resolveExternalOrigin = (req: Request) => {
    const forwardedProto = req.get('x-forwarded-proto');
    const protocol = forwardedProto ? forwardedProto.split(',')[0].trim() : req.protocol;
    return `${protocol}://${req.get('host')}`;
  };

  const buildGoogleCallbackUrl = (req: Request) =>
    `${resolveExternalOrigin(req)}/api/auth/google/callback`;

  const renderGoogleOAuthSuccess = (res: any) => {
    res
      .status(200)
      .type('html')
      .send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Google Connected</title>
  </head>
  <body style="background:#0c021a;color:#fff;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;">
    <div style="text-align:center;max-width:420px;padding:24px;">
      <h1 style="margin:0 0 12px;font-size:24px;">Google connected</h1>
      <p style="margin:0 0 16px;color:rgba(255,255,255,0.75);">You can close this window and return to Milla.</p>
      <button id="close-window" style="display:none;border:1px solid rgba(0,242,255,0.35);background:rgba(0,242,255,0.12);color:#b8f8ff;border-radius:12px;padding:10px 16px;cursor:pointer;">Close window</button>
    </div>
    <script>
      try {
        if (window.opener) {
          window.opener.postMessage({ type: 'google-oauth-complete', connected: true }, window.location.origin);
          window.close();
        }
      } catch (_error) {
      }

      if (!window.closed) {
        const button = document.getElementById('close-window');
        if (button) {
          button.style.display = 'inline-flex';
          button.addEventListener('click', () => window.close());
        }
      }
    </script>
  </body>
</html>`);
  };

  const resolveUserId = async (sessionToken?: string) => {
    if (!sessionToken) return 'default-user';

    const sessionResult = await validateSession(sessionToken);
    if (sessionResult.valid && sessionResult.user?.id) {
      return sessionResult.user.id;
    }

    return 'default-user';
  };

  router.get('/auth/google/url', (req, res) => {
    const url = getAuthorizationUrl(buildGoogleCallbackUrl(req));
    res.json({ url });
  });

  router.get(
    '/auth/google/callback',
    asyncHandler(async (req, res) => {
      const { code } = req.query;
      if (!code) return res.status(400).send('Code is required');

      try {
        const { exchangeCodeForToken, storeOAuthToken } = await import('../oauthService');
        const redirectUri = buildGoogleCallbackUrl(req);

        // Exchange code for tokens
        const tokenData = await exchangeCodeForToken(code as string, redirectUri);

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

        renderGoogleOAuthSuccess(res);
      } catch (error) {
        console.error('Google callback error:', error);
        res.status(500).send('Internal server error during authentication');
      }
    })
  );

  router.get(
    '/oauth/authenticated',
    asyncHandler(async (req, res) => {
      const userId = await resolveUserId(req.cookies.session_token);
      const authenticated =
        userId !== 'default-user' && (await isGoogleAuthenticated(userId));

      res.json({ authenticated });
    })
  );

  router.get(
    '/tasks/list',
    asyncHandler(async (req, res) => {
      const maxResults = Number.parseInt(String(req.query.maxResults || '10'), 10);
      const showCompleted = String(req.query.showCompleted || 'false') === 'true';
      const userId = await resolveUserId(req.cookies.session_token);
      const result = await listTasks(
        userId,
        Number.isNaN(maxResults) ? 10 : Math.min(maxResults, 20),
        showCompleted
      );

      res.status(result.success ? 200 : 400).json(result);
    })
  );

  router.post(
    '/tasks/add',
    asyncHandler(async (req, res) => {
      const { title, notes } = req.body || {};
      if (!title || !String(title).trim()) {
        return res.status(400).json({
          success: false,
          message: 'Task title is required.',
        });
      }

      const userId = await resolveUserId(req.cookies.session_token);
      const result = await addNoteToGoogleTasks(
        String(title).trim(),
        notes ? String(notes) : '',
        userId
      );

      res.status(result.success ? 200 : 400).json(result);
    })
  );

  // Mount routes
  app.use('/api', router);
}

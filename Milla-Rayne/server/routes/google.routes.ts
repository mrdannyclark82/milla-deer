import { Router, type Express, type Request } from 'express';
import { loginOrRegisterWithGoogle } from '../authService';
import { validateSession } from '../authService';
import {
  listEvents,
  addEventToGoogleCalendar,
  deleteEvent,
} from '../googleCalendarService';
import {
  getRecentEmails,
  getEmailContent,
  sendEmail,
} from '../googleGmailService';
import {
  getMySubscriptions,
  getVideoDetails,
  searchVideos,
} from '../googleYoutubeService';
import { addNoteToGoogleTasks, listTasks } from '../googleTasksService';
import { asyncHandler } from '../utils/routeHelpers';
import {
  deleteOAuthToken,
  getAuthorizationUrl,
  isGoogleAuthenticated,
} from '../oauthService';
import {
  NEWS_CATEGORIES,
  runDailyNewsSearch,
  type DailyNewsDigest,
  type NewsItem,
} from '../youtubeNewsMonitor';

/**
 * Google OAuth and Services Routes
 */
export function registerGoogleRoutes(app: Express) {
  const router = Router();
  const MOBILE_APP_SCHEME = 'deer-milla://';

  const resolveExternalOrigin = (req: Request) => {
    const forwardedProto = req.get('x-forwarded-proto');
    const protocol = forwardedProto ? forwardedProto.split(',')[0].trim() : req.protocol;
    return `${protocol}://${req.get('host')}`;
  };

  const buildGoogleCallbackUrl = (req: Request) =>
    `${resolveExternalOrigin(req)}/oauth/callback`;

  const getSessionToken = (req: Request) => {
    const authHeader = req.get('authorization');
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7).trim();
    }

    return req.cookies.session_token;
  };

  const normalizeMobileRedirectUri = (rawValue: unknown) => {
    if (typeof rawValue !== 'string') {
      return null;
    }

    const trimmedValue = rawValue.trim();
    if (!trimmedValue) {
      return null;
    }

    try {
      const parsedUrl = new URL(trimmedValue);
      if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
        return null;
      }

      return trimmedValue;
    } catch {
      return trimmedValue.includes('://') ? trimmedValue : null;
    }
  };

  const encodeAuthState = (payload: Record<string, string>) =>
    Buffer.from(JSON.stringify(payload)).toString('base64url');

  const decodeAuthState = (rawValue: unknown): Record<string, string> => {
    if (typeof rawValue !== 'string' || !rawValue.trim()) {
      return {};
    }

    try {
      const parsedValue = JSON.parse(
        Buffer.from(rawValue, 'base64url').toString('utf8')
      ) as Record<string, string>;
      return parsedValue && typeof parsedValue === 'object' ? parsedValue : {};
    } catch {
      return {};
    }
  };

  const appendQueryParams = (baseUrl: string, params: Record<string, string>) => {
    const url = new URL(baseUrl);

    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    return url.toString();
  };

  const decodeBase64Url = (value?: string) => {
    if (!value) return '';

    try {
      const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
      return Buffer.from(normalized, 'base64').toString('utf8');
    } catch {
      return '';
    }
  };

  const getHeader = (headers: Array<{ name: string; value: string }> = [], name: string) =>
    headers.find((header) => header.name.toLowerCase() === name.toLowerCase())
      ?.value || '';

  const extractMessageBody = (payload?: any): string => {
    if (!payload) return '';

    if (payload.body?.data) {
      return decodeBase64Url(payload.body.data);
    }

    if (Array.isArray(payload.parts)) {
      for (const part of payload.parts) {
        const nestedBody = extractMessageBody(part);
        if (nestedBody) return nestedBody;
      }
    }

    return '';
  };

  const mapEmailSummary = (message: any) => {
    const headers = message.payload?.headers || [];
    const preview = message.snippet || extractMessageBody(message.payload);

    return {
      id: message.id,
      threadId: message.threadId,
      from: getHeader(headers, 'From') || 'Unknown sender',
      subject: getHeader(headers, 'Subject') || '(No subject)',
      preview: preview || '(No preview available)',
      date: getHeader(headers, 'Date') || message.internalDate || '',
      isRead: !(message.labelIds || []).includes('UNREAD'),
      isStarred: (message.labelIds || []).includes('STARRED'),
    };
  };

  const mapEmailDetail = (message: any) => {
    const headers = message.payload?.headers || [];
    const bodyText = extractMessageBody(message.payload);

    return {
      ...mapEmailSummary(message),
      to: getHeader(headers, 'To'),
      cc: getHeader(headers, 'Cc'),
      bodyText,
      bodyHtml: bodyText,
      labelIds: message.labelIds || [],
    };
  };

  const formatCalendarDate = (event: any) =>
    event?.start?.dateTime || event?.start?.date || '';

  const mapCalendarEvent = (event: any) => ({
    id: event.id,
    summary: event.summary || '(Untitled event)',
    description: event.description || '',
    location: event.location || '',
    start: formatCalendarDate(event),
    end: event?.end?.dateTime || event?.end?.date || '',
    htmlLink: event.htmlLink || '',
    status: event.status || '',
  });

  const BRIEF_STOP_WORDS = new Set([
    'about',
    'after',
    'ahead',
    'along',
    'also',
    'and',
    'away',
    'back',
    'been',
    'before',
    'being',
    'below',
    'between',
    'bring',
    'from',
    'have',
    'into',
    'just',
    'like',
    'more',
    'next',
    'over',
    'that',
    'them',
    'then',
    'they',
    'this',
    'today',
    'with',
    'your',
  ]);

  const tokenizePersonalizationTerms = (value: string): string[] =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .map((term) => term.trim())
      .filter(
        (term) =>
          term.length >= 4 &&
          !BRIEF_STOP_WORDS.has(term) &&
          !/^\d+$/.test(term)
      );

  const extractBriefPersonalization = (
    emails: Array<ReturnType<typeof mapEmailSummary>>,
    events: Array<ReturnType<typeof mapCalendarEvent>>
  ) => {
    const sourceTexts = [
      {
        label: 'Inbox',
        text: emails
          .slice(0, 5)
          .map((email) => `${email.subject} ${email.preview}`)
          .join(' '),
      },
      {
        label: 'Calendar',
        text: events
          .slice(0, 5)
          .map((event) => `${event.summary} ${event.description || ''} ${event.location || ''}`)
          .join(' '),
      },
    ].filter((source) => source.text.trim().length > 0);

    const categoryMatches = NEWS_CATEGORIES.map((category) => {
      const matchedKeywords = sourceTexts.flatMap((source) =>
        category.keywords.filter((keyword) =>
          source.text.toLowerCase().includes(keyword.toLowerCase())
        )
      );

      return {
        name: category.name,
        matchedKeywords: Array.from(new Set(matchedKeywords)),
      };
    }).filter((match) => match.matchedKeywords.length > 0);

    const extractedTerms = Array.from(
      new Set(
        sourceTexts.flatMap((source) => tokenizePersonalizationTerms(source.text))
      )
    ).slice(0, 8);

    const focusAreas = categoryMatches.map((match) => match.name).slice(0, 3);
    const reasons = categoryMatches
      .slice(0, 3)
      .map(
        (match) =>
          `${match.name} is elevated because today's Google context mentions ${match.matchedKeywords.slice(0, 2).join(' and ')}.`
      );

    if (focusAreas.length === 0 && extractedTerms.length === 0) {
      return null;
    }

    return {
      focusAreas,
      reasons,
      keywords: [
        ...categoryMatches.flatMap((match) => match.matchedKeywords),
        ...extractedTerms,
      ].slice(0, 8),
    };
  };

  const personalizeDailyBrief = (
    digest: DailyNewsDigest,
    emails: Array<ReturnType<typeof mapEmailSummary>>,
    events: Array<ReturnType<typeof mapCalendarEvent>>
  ) => {
    const personalization = extractBriefPersonalization(emails, events);
    if (!personalization) {
      return digest;
    }

    const focusAreas = new Set(personalization.focusAreas);
    const keywords = personalization.keywords.map((keyword) => keyword.toLowerCase());

    const boostNewsItem = (item: NewsItem): NewsItem => {
      let score = item.relevanceScore;
      const haystack = `${item.title} ${item.channel}`.toLowerCase();

      if (focusAreas.has(item.category)) {
        score += 18;
      }

      for (const keyword of keywords) {
        if (haystack.includes(keyword)) {
          score += 6;
        }
      }

      return {
        ...item,
        relevanceScore: score,
      };
    };

    const categories = Object.fromEntries(
      Object.entries(digest.categories).map(([category, items]) => [
        category,
        items.map(boostNewsItem).sort((a, b) => b.relevanceScore - a.relevanceScore),
      ])
    );

    const topStories = Object.values(categories)
      .flat()
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 5);

    return {
      ...digest,
      categories,
      topStories,
      personalization: {
        focusAreas: personalization.focusAreas,
        reasons: personalization.reasons,
        highlightedVideoIds: topStories.map((story) => story.videoId),
      },
    };
  };

  const resolveUserId = async (sessionToken?: string) => {
    if (!sessionToken) return 'default-user';
    const sessionResult = await validateSession(sessionToken);
    if (sessionResult.valid && sessionResult.user?.id) {
      return sessionResult.user.id;
    }
    return 'default-user';
  };

  const renderGoogleOAuthSuccess = (
    res: any,
    options?: { mobileRedirectUri?: string; sessionToken?: string }
  ) => {
    const deepLinkUrl =
      options?.mobileRedirectUri && options.sessionToken
        ? appendQueryParams(options.mobileRedirectUri, {
            googleConnected: '1',
            session_token: options.sessionToken,
          })
        : null;

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
      <p style="margin:0 0 16px;color:rgba(255,255,255,0.75);">${
        deepLinkUrl
          ? 'Returning you to Milla now. If nothing happens, tap the button below.'
          : 'You can close this window and return to Milla.'
      }</p>
      <a id="return-to-app" href="${deepLinkUrl || '#'}" style="display:${
        deepLinkUrl ? 'inline-flex' : 'none'
      };border:1px solid rgba(0,242,255,0.35);background:rgba(0,242,255,0.12);color:#b8f8ff;border-radius:12px;padding:10px 16px;cursor:pointer;text-decoration:none;justify-content:center;">Return to Milla</a>
      <button id="close-window" style="display:${
        deepLinkUrl ? 'none' : 'inline-flex'
      };border:1px solid rgba(0,242,255,0.35);background:rgba(0,242,255,0.12);color:#b8f8ff;border-radius:12px;padding:10px 16px;cursor:pointer;">Close window</button>
    </div>
    <script>
      const deepLinkUrl = ${JSON.stringify(deepLinkUrl)};

      try {
        if (window.opener) {
          window.opener.postMessage({ type: 'google-oauth-complete', connected: true }, window.location.origin);
          if (!deepLinkUrl) {
            window.close();
          }
        }
      } catch (_error) {
      }

      if (deepLinkUrl) {
        window.location.replace(deepLinkUrl);
      }

      const button = document.getElementById('close-window');
      if (button) {
        button.addEventListener('click', () => window.close());
      }
    </script>
  </body>
</html>`);
  };

  const handleGoogleCallback = asyncHandler(async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send('Code is required');

    try {
      const authState = decodeAuthState(req.query.state);
      const mobileRedirectUri = normalizeMobileRedirectUri(authState.mobileRedirectUri);
      const { exchangeCodeForToken, storeOAuthToken } = await import(
        '../oauthService'
      );
      const redirectUri = mobileRedirectUri ? undefined : buildGoogleCallbackUrl(req);

      const tokenData = await exchangeCodeForToken(code as string, redirectUri);

      const userRes = await fetch(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        {
          headers: { Authorization: `Bearer ${tokenData.accessToken}` },
        }
      );

      if (!userRes.ok) {
        return res.status(401).send('Failed to fetch user info from Google');
      }

      const profile = await userRes.json();

      const result = await loginOrRegisterWithGoogle(
        profile.email,
        profile.id,
        profile.name || profile.email.split('@')[0]
      );

      if (!result.success || !result.user) {
        return res.status(401).send(result.error || 'Authentication failed');
      }

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

      if (mobileRedirectUri) {
        await storeOAuthToken(
          'default-user',
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

      renderGoogleOAuthSuccess(res, {
        mobileRedirectUri: mobileRedirectUri || undefined,
        sessionToken: result.sessionToken,
      });
    } catch (error) {
      console.error('Google callback error:', error);
      res.status(500).send('Internal server error during authentication');
    }
  });

  router.get(
    '/auth/google/url',
    asyncHandler(async (req, res) => {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      const mobileRedirectUri = normalizeMobileRedirectUri(req.query.mobileRedirectUri);
      const url = mobileRedirectUri
        ? getAuthorizationUrl(undefined, encodeAuthState({ mobileRedirectUri }))
        : getAuthorizationUrl(buildGoogleCallbackUrl(req));
      res.json({ success: true, url });
    })
  );

  router.get(
    '/auth/google',
    asyncHandler(async (req, res) => {
      res.redirect(getAuthorizationUrl(buildGoogleCallbackUrl(req)));
    })
  );

  router.get('/auth/google/callback', handleGoogleCallback);

  router.get(
    '/oauth/authenticated',
    asyncHandler(async (req, res) => {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      const sessionToken = getSessionToken(req);
      const userId = await resolveUserId(sessionToken);
      const authenticated = Boolean(await isGoogleAuthenticated(userId));

      res.json({
        success: true,
        authenticated,
        isAuthenticated: authenticated,
      });
    })
  );

  router.get(
    '/gmail/recent',
    asyncHandler(async (req, res) => {
      const maxResults = Number.parseInt(String(req.query.maxResults || '10'), 10);
      const userId = await resolveUserId(getSessionToken(req));
      const result = await getRecentEmails(
        userId,
        Number.isNaN(maxResults) ? 10 : Math.min(maxResults, 10)
      );

      res.status(result.success ? 200 : 400).json({
        success: result.success,
        message: result.message,
        emails: Array.isArray(result.data)
          ? result.data.map(mapEmailSummary).slice(0, 10)
          : [],
        error: result.error,
      });
    })
  );

  router.get(
    '/gmail/content',
    asyncHandler(async (req, res) => {
      const messageId = String(req.query.messageId || '').trim();
      if (!messageId) {
        return res
          .status(400)
          .json({ success: false, error: 'Message ID is required' });
      }

      const userId = await resolveUserId(getSessionToken(req));
      const result = await getEmailContent(userId, messageId);

      res.status(result.success ? 200 : 400).json({
        success: result.success,
        message: result.message,
        email: result.data ? mapEmailDetail(result.data) : null,
        error: result.error,
      });
    })
  );

  router.post(
    '/gmail/send',
    asyncHandler(async (req, res) => {
      const { to, subject, body } = req.body || {};
      if (!to || !subject || !body) {
        return res.status(400).json({
          success: false,
          error: 'To, subject, and body are required',
        });
      }

      const userId = await resolveUserId(getSessionToken(req));
      const result = await sendEmail(userId, String(to), String(subject), String(body));

      res.status(result.success ? 200 : 400).json(result);
    })
  );

  router.get(
    '/calendar/events',
    asyncHandler(async (req, res) => {
      const maxResults = Number.parseInt(String(req.query.maxResults || '10'), 10);
      const timeMin = req.query.timeMin ? String(req.query.timeMin) : undefined;
      const timeMax = req.query.timeMax ? String(req.query.timeMax) : undefined;
      const userId = await resolveUserId(getSessionToken(req));
      const result = await listEvents(
        userId,
        timeMin,
        timeMax,
        Number.isNaN(maxResults) ? 10 : Math.min(maxResults, 100)
      );

      res.status(result.success ? 200 : 400).json({
        success: result.success,
        message: result.message,
        events: Array.isArray(result.events)
          ? result.events.map(mapCalendarEvent)
          : [],
        error: result.error,
      });
    })
  );

  router.post(
    '/calendar/events',
    asyncHandler(async (req, res) => {
      const { title, date, time, description } = req.body || {};
      if (!title || !date) {
        return res.status(400).json({
          success: false,
          error: 'Title and date are required',
        });
      }

      const userId = await resolveUserId(getSessionToken(req));
      const result = await addEventToGoogleCalendar(
        String(title),
        String(date),
        time ? String(time) : undefined,
        description ? String(description) : undefined,
        userId
      );

      res.status(result.success ? 200 : 400).json(result);
    })
  );

  router.delete(
    '/calendar/events/:eventId',
    asyncHandler(async (req, res) => {
      const eventId = String(req.params.eventId);
      const userId = await resolveUserId(getSessionToken(req));
      const result = await deleteEvent(userId, eventId);
      res.status(result.success ? 200 : 400).json(result);
    })
  );

  router.get(
    '/tasks/list',
    asyncHandler(async (req, res) => {
      const maxResults = Number.parseInt(String(req.query.maxResults || '10'), 10);
      const showCompleted = String(req.query.showCompleted || 'false') === 'true';
      const userId = await resolveUserId(getSessionToken(req));
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

      const userId = await resolveUserId(getSessionToken(req));
      const result = await addNoteToGoogleTasks(
        String(title).trim(),
        notes ? String(notes) : '',
        userId
      );

      res.status(result.success ? 200 : 400).json(result);
    })
  );

  router.get(
    '/daily-brief',
    asyncHandler(async (req, res) => {
      const userId = await resolveUserId(getSessionToken(req));
      const today = new Date();
      const timeMin = new Date(today);
      timeMin.setHours(0, 0, 0, 0);
      const timeMax = new Date(today);
      timeMax.setHours(23, 59, 59, 999);

      const [newsResult, emailResult, calendarResult] = await Promise.all([
        runDailyNewsSearch(userId).catch(() => ({
          date: today.toISOString().split('T')[0],
          categories: {},
          topStories: [],
          totalVideos: 0,
          analysisCount: 0,
        })),
        getRecentEmails(userId, 10),
        listEvents(userId, timeMin.toISOString(), timeMax.toISOString(), 10),
      ]);

      const emails = Array.isArray(emailResult.data)
        ? emailResult.data.map(mapEmailSummary).slice(0, 10)
        : [];
      const events = Array.isArray(calendarResult.events)
        ? calendarResult.events.map(mapCalendarEvent)
        : [];

      const personalizedBrief = personalizeDailyBrief(newsResult, emails, events);

      res.json({
        ...personalizedBrief,
        inboxSummary: {
          emails,
          unreadCount: emails.filter((email) => !email.isRead).length,
        },
        dailySchedule: {
          events,
          count: events.length,
        },
      });
    })
  );

  router.delete(
    '/oauth/disconnect',
    asyncHandler(async (req, res) => {
      const sessionToken = getSessionToken(req);
      const userId = await resolveUserId(sessionToken);

      await deleteOAuthToken(userId, 'google');

      res.json({
        success: true,
        authenticated: false,
        isAuthenticated: false,
      });
    })
  );

  router.get(
    '/youtube/subscriptions',
    asyncHandler(async (req, res) => {
      const maxResults = Number.parseInt(String(req.query.maxResults || '10'), 10);
      const userId = await resolveUserId(getSessionToken(req));
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

      const userId = await resolveUserId(getSessionToken(req));
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
      const videoId = String(req.params.videoId);
      const userId = await resolveUserId(getSessionToken(req));
      const result = await getVideoDetails(videoId, userId);
      res.status(result.success ? 200 : 400).json(result);
    })
  );

  // Mount routes
  app.use('/api', router);
  app.get('/oauth/google', (req, res) => {
    res.redirect(getAuthorizationUrl(buildGoogleCallbackUrl(req)));
  });
  app.get('/oauth/callback', handleGoogleCallback);
}

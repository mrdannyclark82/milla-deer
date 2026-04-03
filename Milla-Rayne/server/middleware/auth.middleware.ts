import type { Request, Response, NextFunction } from 'express';
import { validateSession, validateDemoSession } from '../authService';

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

declare global {
  namespace Express {
    interface Request {
      isDemo?: boolean;
      demoToken?: string;
    }
  }
}

/**
 * Middleware to require authentication.
 * Accepts: valid session cookie, X-Internal-Key header, or demo session token.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Allow internal service calls — optionally carry a user identity via x-user-id
  if (INTERNAL_API_KEY && req.headers['x-internal-key'] === INTERNAL_API_KEY) {
    const userId = (req.headers['x-user-id'] as string) || 'default-user';
    req.user = { id: userId, username: userId, email: '' } as any;
    return next();
  }

  const sessionToken = req.cookies.session_token;

  if (!sessionToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Check for demo session
  if (sessionToken.startsWith('demo_')) {
    const demo = validateDemoSession(sessionToken);
    if (!demo.valid) {
      return res.status(401).json({ error: 'Demo session expired' });
    }
    req.isDemo = true;
    req.demoToken = sessionToken;
    req.user = { id: 'demo-guest', username: 'Guest', email: '' } as any;
    return next();
  }

  const sessionResult = await validateSession(sessionToken);

  if (!sessionResult.valid || !sessionResult.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  req.user = sessionResult.user as any;
  next();
}

/**
 * Middleware that optionally populates req.user if a valid session exists
 * Does NOT block the request if unauthenticated
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const sessionToken = req.cookies.session_token;

  if (sessionToken) {
    const sessionResult = await validateSession(sessionToken);
    if (sessionResult.valid && sessionResult.user) {
      req.user = sessionResult.user as any;
    }
  }

  next();
}

import type { Request, Response, NextFunction } from 'express';
import { validateSession } from '../authService';

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

/**
 * Middleware to require authentication.
 * Accepts either a valid session cookie OR the X-Internal-Key header
 * (used by agentRouterService for internal agent-to-agent dispatch).
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Allow internal service calls from agentRouter
  if (INTERNAL_API_KEY && req.headers['x-internal-key'] === INTERNAL_API_KEY) {
    return next();
  }

  const sessionToken = req.cookies.session_token;

  if (!sessionToken) {
    return res.status(401).json({ error: 'Unauthorized' });
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

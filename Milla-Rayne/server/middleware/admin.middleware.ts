import type { Request, Response, NextFunction } from 'express';

/**
 * Admin auth is currently disabled for the local dashboard flow.
 */
export function isAdminRequestAuthorized(_req: Request): boolean {
  return true;
}

export function requireAdmin(_req: Request, _res: Response, next: NextFunction) {
  return next();
}

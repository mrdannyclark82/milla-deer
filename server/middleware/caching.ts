import { LRUCache } from 'lru-cache';
import { Request, Response, NextFunction } from 'express';

// Global cache instance
const routeCache = new LRUCache<string, { body: any; headers: any }>({
  max: 500,
  ttl: 1000 * 60 * 5, // 5 minutes default TTL
  maxSize: 50 * 1024 * 1024, // 50MB
  sizeCalculation: (value) => {
    return JSON.stringify(value).length;
  }
});

/**
 * Middleware to cache GET responses
 * @param ttlSeconds Time to live in seconds
 */
export function cacheMiddleware(ttlSeconds?: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Skip caching if explicitly requested via headers (useful for debugging/force refresh)
    if (req.headers['x-no-cache'] || req.query.nocache) {
      return next();
    }

    const cacheKey = `${req.originalUrl || req.url}`;
    const cached = routeCache.get(cacheKey);

    if (cached) {
      res.set(cached.headers);
      res.set('X-Cache', 'HIT');
      return res.json(cached.body);
    }

    // Override res.json to capture the response
    const originalJson = res.json.bind(res);

    // We need to use 'any' here to match the Express signature flexibility
    res.json = function (body: any): Response {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const headers = res.getHeaders();

        // Use custom TTL if provided, otherwise default
        const ttl = ttlSeconds ? ttlSeconds * 1000 : undefined;

        routeCache.set(cacheKey, {
          body,
          headers,
        }, { ttl });
      }

      res.set('X-Cache', 'MISS');
      return originalJson(body);
    };

    next();
  };
}

/**
 * Helper to clear cache for a specific route pattern
 */
export function clearRouteCache(pattern: string) {
  for (const key of routeCache.keys()) {
    if (key.includes(pattern)) {
      routeCache.delete(key);
    }
  }
}

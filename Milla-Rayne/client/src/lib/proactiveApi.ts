/**
 * Proactive API Client
 * Handles API calls to the proactive features server (port 5001)
 */

const PROACTIVE_BASE_URL =
  (typeof import.meta !== 'undefined' &&
  typeof import.meta.env !== 'undefined' &&
  import.meta.env.VITE_PROACTIVE_BASE_URL
    ? import.meta.env.VITE_PROACTIVE_BASE_URL
    : '/api/proactive');

const DEFAULT_GET_CACHE_TTL_MS = 30_000;

const proactiveGetCache = new Map<
  string,
  { expiresAt: number; data: unknown }
>();
const inflightGetRequests = new Map<string, Promise<unknown>>();

function buildCacheKey(endpoint: string, customCacheKey?: string) {
  return customCacheKey ?? endpoint;
}

function clearExpiredCacheEntries() {
  const now = Date.now();
  for (const [key, value] of proactiveGetCache.entries()) {
    if (value.expiresAt <= now) {
      proactiveGetCache.delete(key);
    }
  }
}

export function invalidateProactiveCache(match?: string | RegExp) {
  if (!match) {
    proactiveGetCache.clear();
    inflightGetRequests.clear();
    return;
  }

  for (const key of proactiveGetCache.keys()) {
    const matches =
      typeof match === 'string' ? key.includes(match) : Boolean(key.match(match));
    if (matches) {
      proactiveGetCache.delete(key);
      inflightGetRequests.delete(key);
    }
  }
}

/**
 * Make a request to the proactive features server
 */
export async function proactiveApiRequest(
  endpoint: string,
  options?: RequestInit
): Promise<Response> {
  // Remove leading slash if present
  const path = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;

  // Construct full URL
  const url = `${PROACTIVE_BASE_URL}/${path}`;

  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
}

interface ProactiveGetOptions {
  cacheTtlMs?: number;
  cacheKey?: string;
  forceRefresh?: boolean;
}

/**
 * Convenience method for GET requests
 */
export async function proactiveGet<T = any>(
  endpoint: string,
  options?: ProactiveGetOptions
): Promise<T> {
  clearExpiredCacheEntries();
  const cacheKey = buildCacheKey(endpoint, options?.cacheKey);
  const cachedEntry = proactiveGetCache.get(cacheKey);
  const cached =
    !options?.forceRefresh &&
    cachedEntry &&
    cachedEntry.expiresAt > Date.now()
      ? cachedEntry
      : null;

  if (cached) {
    return cached.data as T;
  }

  const inflightRequest = inflightGetRequests.get(cacheKey);
  if (inflightRequest && !options?.forceRefresh) {
    return inflightRequest as Promise<T>;
  }

  const requestPromise = (async () => {
    const response = await proactiveApiRequest(endpoint);
    if (!response.ok) {
      throw new Error(`Proactive API error: ${response.statusText}`);
    }

    const data = (await response.json()) as T;
    proactiveGetCache.set(cacheKey, {
      data,
      expiresAt: Date.now() + (options?.cacheTtlMs ?? DEFAULT_GET_CACHE_TTL_MS),
    });
    return data;
  })();

  inflightGetRequests.set(cacheKey, requestPromise);

  try {
    return await requestPromise;
  } finally {
    inflightGetRequests.delete(cacheKey);
  }
}

/**
 * Convenience method for POST requests
 */
export async function proactivePost<T = any>(
  endpoint: string,
  data?: any
): Promise<T> {
  const response = await proactiveApiRequest(endpoint, {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  });
  if (!response.ok) {
    throw new Error(`Proactive API error: ${response.statusText}`);
  }
  const payload = (await response.json()) as T;
  invalidateProactiveCache();
  return payload;
}

/**
 * Check if the proactive server is available
 */
export async function checkProactiveServerHealth(): Promise<boolean> {
  try {
    const response = await proactiveApiRequest('/health');
    return response.ok;
  } catch (error) {
    console.error('Proactive server health check failed:', error);
    return false;
  }
}

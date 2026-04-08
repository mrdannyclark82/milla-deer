/**
 * Milla Rayne Service Worker
 * Caches shell assets for offline use, network-first for API, cache-first for fonts.
 */

const CACHE_NAME = 'milla-rayne-v1';
const OFFLINE_URL = '/offline.html';

const PRECACHE_ASSETS = [
  '/',
  '/offline.html',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.json',
];

// ─── Install ────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

// ─── Activate ───────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ─── Fetch ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and non-HTTP requests
  if (request.method !== 'GET' || !url.protocol.startsWith('http')) return;

  // API — NetworkFirst (10s timeout then cache fallback)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Google Fonts — CacheFirst
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(request, 'google-fonts'));
    return;
  }

  // Static assets — StaleWhileRevalidate
  if (/\.(js|css|png|svg|woff2?|ico|jpg|webp)$/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Navigation — serve cached shell or offline page
  if (request.mode === 'navigate') {
    event.respondWith(navigationHandler(request));
    return;
  }
});

// ─── Strategy helpers ────────────────────────────────────────────────────────

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(id);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached ?? new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function cacheFirst(request, cacheName = CACHE_NAME) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  });
  return cached ?? fetchPromise;
}

async function navigationHandler(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
    return response;
  } catch {
    const cache = await caches.open(CACHE_NAME);
    return (await cache.match('/')) ?? (await cache.match(OFFLINE_URL)) ?? new Response('Offline', { status: 503 });
  }
}

// ─── Push Notifications ──────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  const data = event.data?.json() || { title: 'Milla Rayne', body: 'New notification' };
  event.waitUntil(
    self.registration.showNotification(data.title || 'Milla Rayne', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'milla-notification',
      data: data.url ? { url: data.url } : undefined,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.notification.data?.url) {
    event.waitUntil(clients.openWindow(event.notification.data.url));
  }
});

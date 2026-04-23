// Skynet PWA service worker
// Strategy:
//  - Static assets (JS, CSS, fonts, icons, manifest): cache-first
//  - API GET (weather, energy, github/trending, plex): stale-while-revalidate
//    so iOS home-screen widget/PWA shows something instantly, then updates
//  - Everything else: network-first with offline fallback to cached shell

const CACHE_VERSION = "v1";
const STATIC_CACHE = `skynet-static-${CACHE_VERSION}`;
const API_CACHE = `skynet-api-${CACHE_VERSION}`;

const STATIC_PRECACHE = [
  "/minimal",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

// APIs that are safe to cache (read-only, idempotent)
const API_ALLOWLIST = [
  "/api/weather",
  "/api/energy",
  "/api/github/trending",
  "/api/plex",
  "/api/setup",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      // Best-effort precache — never block install on a missing asset
      Promise.allSettled(STATIC_PRECACHE.map((url) => cache.add(url)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== API_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

function isApiCacheable(url) {
  return API_ALLOWLIST.some((prefix) => url.pathname.startsWith(prefix));
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".woff2") ||
    url.pathname === "/manifest.json"
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // SSE / streaming endpoints — never cache
  if (url.pathname.startsWith("/api/agent/logs")) return;
  if (url.pathname.startsWith("/api/chat/stream")) return;

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then((hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) caches.open(STATIC_CACHE).then((c) => c.put(req, res.clone()));
          return res;
        })
      )
    );
    return;
  }

  if (isApiCacheable(url)) {
    event.respondWith(
      caches.open(API_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const fetchPromise = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // HTML pages: network-first, fall back to cached /minimal shell
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match("/minimal").then((hit) => hit || new Response("offline", { status: 503 }))
      )
    );
  }
});

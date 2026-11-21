const CACHE_NAME = "pulsecast-pwa-v1";
const STATIC_ASSETS = [
  "/manifest.webmanifest",
  "/icons/icon-512.png",
  "/icons/icon.svg",
  "/covers/neon-drift.jpg",
  "/covers/velvet-echoes.jpg",
  "/covers/orbital-bloom.jpg"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Never intercept API calls, SSE streams, or cross-origin requests
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (
          response.ok &&
          (url.pathname.startsWith("/covers/") ||
            url.pathname.startsWith("/icons/") ||
            url.pathname === "/manifest.webmanifest")
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw new Error("Network unavailable");
      })
  );
});

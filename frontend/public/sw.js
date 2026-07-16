const CACHE_NAME = "thermal-guide-shell-v2";
const APP_SHELL = ["/", "/app", "/manifest.webmanifest", "/thermal-guide-icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isApiRequest = url.pathname.startsWith("/api/");
  const hasAuthorization = event.request.headers.has("Authorization");

  // Personalized and authenticated API responses must never be written to a
  // device cache. The backend also marks member data no-store, but this guard
  // protects it even when the web app and API share an origin in production.
  if (!isSameOrigin || isApiRequest || hasAuthorization) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/app"))),
    );
    return;
  }

  const isStaticAsset = url.pathname.startsWith("/_next/") || /\.(?:css|js|svg|png|ico)$/i.test(url.pathname);
  if (!isStaticAsset) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    })),
  );
});

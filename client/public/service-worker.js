const CACHE = "lirna-shell-v3";
const GENERATED_ASSETS = self.__LIRNA_PRECACHE__ ?? [];
const SHELL = ["/", "/manifest.webmanifest", "/icon.svg", ...GENERATED_ASSETS];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).pathname.startsWith("/api/")) {
    return;
  }
  // Build-generated hashed assets are available at install time. Cache-first
  // also fills any later route assets encountered at runtime.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
      return cached ?? network;
    }),
  );
});

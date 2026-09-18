// Service worker minimal : rend le site installable (PWA) sur iOS, Android
// et ordinateur. Ne met en cache que les fichiers statiques (icones, logo) -
// les pages et les appels API passent toujours par le reseau pour eviter
// d'afficher des prix ou un stock perimes.
const CACHE_NAME = "lbt-static-v1";
const STATIC_ASSETS = [
  "/logo.jpg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
  }
});

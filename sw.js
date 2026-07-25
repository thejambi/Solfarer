// Solfarer service worker — cache-first for same-origin app files.
const CACHE = "solfarer-v1";
const FILES = [
  ".", "index.html", "src/main.js", "src/stars.js", "src/relativity.js",
  "manifest.webmanifest", "favicon.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
});

// Network-first with cache fallback: always fresh when online, still
// works offline. (Cache-first bit its own author within the hour.)
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;   // CDN three.js: network
  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return resp;
      })
      .catch(() => caches.match(e.request))
  );
});

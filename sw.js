const CACHE = "discloggen-v1"; // ← BUMP (v2, v3 …) ved HVER deploy!
const FILES = [
  "./", "./index.html", "./manifest.webmanifest",
  "./css/app.css",
  "./js/app.js", "./js/util.js", "./js/state.js", "./js/geo.js",
  "./js/session.js", "./js/discs.js", "./js/stats.js",
  "./icon-192.png", "./icon-512.png", "./icon-180.png",
];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  e.respondWith(caches.match(e.request).then(hit => hit ||
    fetch(e.request).then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return res; })
    .catch(() => caches.match("./index.html"))));
});

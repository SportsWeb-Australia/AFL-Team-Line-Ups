// Minimal service worker — enables "Add to Home Screen" / install.
// Network-first passthrough so deploys are never served stale.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (event) {
  // Pass through to the network; fall back to cache only if offline later.
  event.respondWith(fetch(event.request).catch(function () { return caches.match(event.request); }));
});

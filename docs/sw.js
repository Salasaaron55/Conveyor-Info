const CACHE = 'conveyor-map-v1.01';

const STATIC = [
  './conveyor-map.html',
  './static/conveyor-map.css',
  './static/conveyor-map.js',
  './data/conveyors-map.json',
  './data/parts.json',
  './manifest.json',
  './static/icons/icon-192.svg',
  './static/icons/icon-512.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(STATIC))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first — always fetches fresh content, falls back to cache if offline
self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

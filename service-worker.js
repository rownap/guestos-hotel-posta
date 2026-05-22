const CACHE_NAME = 'guestos-v2';
const PRECACHE = [
  '/',
  '/index.html',
  '/login.html',
  '/chat.html',
  '/ristorante.html',
  '/spa.html',
  '/tours.html',
  '/tour-detail.html',
  '/animazione.html',
  '/lastminute.html',
  '/games.html',
  '/quiz.html',
  '/rewards.html',
  '/leaderboard.html',
  '/account.html',
  '/bottom-nav.html',
  '/app.js',
  '/config.js',
  '/common.css',
  '/manifest.json',
  '/assets/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE).catch(err => console.warn('SW precache partial:', err)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return res;
      }).catch(() => cached || caches.match('/index.html'));
      return cached || fetchPromise;
    })
  );
});

const CACHE_NAME = 'petsalon-offline-v40';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/db.js',
  './js/app.js',
  './js/pages/dashboard.js',
  './js/pages/customers.js',
  './js/pages/pets.js',
  './js/pages/appointments.js',
  './js/pages/records.js',
  './js/pages/services.js',
  './js/pages/settings.js',
  './js/pages/revenue.js',
  './js/pages/analytics.js',
  './guide.html',
  './startup-guide.html',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.includes('/api/')) return;

  // Stale-while-revalidate: 캐시 즉시 반환 + 백그라운드 업데이트
  e.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(e.request).then(cached => {
        const fetchPromise = fetch(e.request).then(response => {
          if (response.ok) cache.put(e.request, response.clone());
          return response;
        }).catch(() => cached || caches.match('./index.html'));
        return cached || fetchPromise;
      })
    )
  );
});

const CACHE_NAME = 'petsalon-offline';
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
  './manifest.json',
  './icon.svg'
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

  // 항상 네트워크에서 가져옴. 오프라인일 때만 캐시 사용.
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

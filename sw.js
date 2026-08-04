const CACHE_NAME = 'petsalon-offline-v157';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/db.js',
  './js/master-config.js',
  './js/security.js',
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
  if (e.request.method !== 'GET') return;
  // sw.js 는 캐시하지 않는다 — 버전 표시용으로 './sw.js?v=<timestamp>' 를 매번
  // 새 URL로 요청하기 때문에, 캐시하면 앱을 열 때마다 항목이 영구 누적된다.
  if (url.pathname.endsWith('/sw.js')) return;

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

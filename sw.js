const CACHE_NAME = 'petsalon-offline-v159';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/db.js',
  './js/master-config.js',
  './js/security.js',
  './js/sync-config.js',
  './js/sync.js',
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
    // GitHub Pages 는 max-age=600 을 주므로, 새 CACHE_NAME 으로 설치하면서도 HTTP 캐시의 구버전 파일을
    // 담을 수 있다 → cache:'reload' 로 네트워크에서 새로 받아 저장
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())
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
  // 다른 출처(Firebase SDK·Firestore 실시간 채널·Google 로그인)는 건드리지 않는다.
  // 캐시하면 Firestore 의 GET 롱폴링 응답이 재사용되어 동기화가 멈춘다.
  if (url.origin !== self.location.origin) return;
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

const CACHE_NAME = 'petsalon-offline-v182';
const FONT_CACHE = 'petsalon-fonts-v1';
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
  './js/pages/photocard.js',
  './assets/stickers/pt_paw.webp',
  './assets/stickers/pt_heart.webp',
  './assets/stickers/pt_ribbon.webp',
  './assets/stickers/pt_bone.webp',
  './assets/stickers/pt_sparkles.webp',
  './assets/stickers/pt_crown.webp',
  './assets/stickers/pt_poodle.webp',
  './assets/stickers/pt_maltese.webp',
  './assets/stickers/pt_t_pretty.webp',
  './assets/stickers/pt_t_first.webp',
  './assets/stickers/pt_t_goodboy.webp',
  './assets/stickers/pt_t_goodgirl.webp',
  './assets/stickers/pt_t_clean.webp',
  './assets/stickers/pt_t_newlook.webp',
  './assets/stickers/pt_t_happy.webp',
  './assets/stickers/pt_t_thanks.webp',
  './assets/stickers/pt_t_bday.webp',
  './assets/stickers/pt_scissors.webp',
  './assets/stickers/pt_comb.webp',
  './assets/stickers/pt_bubbles.webp',
  './assets/stickers/pt_shampoo.webp',
  './assets/stickers/pt_cake.webp',
  './assets/stickers/pt_balloons.webp',
  './assets/stickers/pt_rainbow.webp',
  './assets/stickers/pt_blossom.webp',
  './assets/stickers/pt_clover.webp',
  './assets/stickers/pt_maple.webp',
  './assets/stickers/pt_snow.webp',
  './assets/stickers/pt_hip_omiwan.webp',
  './assets/stickers/pt_hip_lucky.webp',
  './assets/stickers/pt_hip_simkung.webp',
  './assets/stickers/pt_hip_caution.webp',
  './assets/stickers/pt_hip_mungmung.webp',
  './assets/stickers/pt_hip_slay.webp',
  './assets/stickers/pt_hip_luv.webp',
  './assets/stickers/pt_hip_newhair.webp',
  './assets/stickers/pt_hip_main.webp',
  './assets/stickers/pt_hip_glowup.webp',
  './assets/stickers/pt_hip_wow.webp',
  './assets/stickers/pt_hip_chrome_star.webp',
  './assets/stickers/pt_hip_smiley.webp',
  './assets/stickers/pt_hip_checker_heart.webp',
  './assets/stickers/pt_hip_holo_heart.webp',
  './assets/stickers/pt_hip_pixel_heart.webp',
  './assets/stickers/pt_hip_flame.webp',
  './assets/stickers/pt_hip_bolt.webp',
  './assets/stickers/pt_hip_daisy.webp',
  './assets/stickers/pt_hip_shades.webp',
  './assets/stickers/pt_chic_goodvibes.webp',
  './assets/stickers/pt_chic_nobad.webp',
  './assets/stickers/pt_chic_beyou.webp',
  './assets/stickers/pt_chic_sofluffy.webp',
  './assets/stickers/pt_chic_freshcut.webp',
  './assets/stickers/pt_chic_club.webp',
  './assets/stickers/pt_chic_gooddog.webp',
  './assets/stickers/pt_chic_ticket.webp',
  './assets/stickers/pt_chic_fresh_star.webp',
  './assets/stickers/pt_chic_tag.webp',
  './assets/stickers/pt_chic_stamp.webp',
  './assets/stickers/pt_chic_pretty.webp',
  './assets/stickers/pt_chic_today_dog.webp',
  './assets/stickers/pt_chic_bubble_done.webp',
  './assets/stickers/pt_chic_bubble_bosong.webp',
  './assets/stickers/pt_chic_groomed.webp',
  './assets/stickers/pt_chic_withlove.webp',
  './assets/stickers/pt_chic_green_paw.webp',
  './assets/stickers/pt_chic_dogline.webp',
  './assets/stickers/pt_chic_aura_lovely.webp',
  './assets/stickers/pt_chic_aura_fluffy.webp',
  './assets/stickers/pt_chic_aura_heart.webp',
  './assets/stickers/emoji_u1f43e.webp',
  './assets/stickers/emoji_u2764.webp',
  './assets/stickers/emoji_u1f495.webp',
  './assets/stickers/emoji_u1f496.webp',
  './assets/stickers/emoji_u1f49d.webp',
  './assets/stickers/emoji_u1f380.webp',
  './assets/stickers/emoji_u1f9b4.webp',
  './assets/stickers/emoji_u2728.webp',
  './assets/stickers/emoji_u1f451.webp',
  './assets/stickers/emoji_u1f338.webp',
  './assets/stickers/emoji_u1f337.webp',
  './assets/stickers/emoji_u1f33c.webp',
  './assets/stickers/emoji_u1f490.webp',
  './assets/stickers/emoji_u2b50.webp',
  './assets/stickers/emoji_u1f31f.webp',
  './assets/stickers/emoji_u2702.webp',
  './assets/stickers/emoji_u1fae7.webp',
  './assets/stickers/emoji_u1f6c1.webp',
  './assets/stickers/emoji_u1f436.webp',
  './assets/stickers/emoji_u1f415.webp',
  './assets/stickers/emoji_u1f429.webp',
  './assets/stickers/emoji_u1f431.webp',
  './assets/stickers/emoji_u1f9f8.webp',
  './assets/stickers/emoji_u1f389.webp',
  './assets/stickers/emoji_u1f382.webp',
  './assets/stickers/emoji_u1f388.webp',
  './assets/stickers/emoji_u1f308.webp',
  './assets/stickers/emoji_u2600.webp',
  './assets/stickers/emoji_u2744.webp',
  './assets/stickers/emoji_u1f384.webp',
  './assets/stickers/emoji_u1f340.webp',
  './assets/stickers/emoji_u1f4af.webp',
  './assets/stickers/emoji_u1f44d.webp',
  './assets/stickers/emoji_u1f60d.webp',
  './assets/stickers/emoji_u1f970.webp',
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
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== FONT_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.includes('/api/')) return;
  if (e.request.method !== 'GET') return;
  // 사진 카드 글꼴(Google Fonts): 한 번 받으면 보관해 두고 오프라인에서도 쓴다. 버전이 바뀌어도 지우지 않는다.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com' || (url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith('/gh/projectnoonnu/'))) {
    e.respondWith(
      caches.open(FONT_CACHE).then(cache =>
        cache.match(e.request).then(cached => cached || fetch(e.request).then(response => {
          if (response.ok || response.type === 'opaque') cache.put(e.request, response.clone());
          return response;
        }))
      )
    );
    return;
  }
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

// 알림을 누르면 앱을 연다 (열린 창이 있으면 그 창으로)
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if ('focus' in c) { try { await c.focus(); return; } catch (_) {} } }
    if (self.clients.openWindow) await self.clients.openWindow('./#appointments');
  })());
});

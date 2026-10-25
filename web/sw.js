// 앱 껍데기는 캐시해서 바로 열리게, 소식(news.json)은 항상 네트워크 우선.
const VERSION = 'nallae-v66';
const SHELL = [
  './', 'index.html', 'style.css', 'fonts/pretendard/pretendard-subset.css', 'app.js', 'local-scope.js', 'discovery.js', 'nearby-fuel.js', 'manifest.webmanifest',
  'vendor/leaflet.min.css', 'vendor/leaflet.min.js', 'vendor/topojson-client.min.js',
  'data/regions.json', 'icons/logo-header.png', 'icons/logo-header-dark.png', 'icons/icon-192.png',
  'about.html', 'privacy.html', 'doc.css',
];

self.addEventListener('install', (e) => {
  // GitHub Pages는 max-age=600을 보낸다. 기본 요청이면 새 버전 캐시에 10분 묵은 이전 파일이 담길 수 있어 HTTP 캐시를 건너뛴다.
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  if (/\/data\/(?:demo-)?(?:food|parking|pharmacy)\//.test(url.pathname) || /\/(?:parking-live|demo-parking-live|news|festivals|demo-festivals|fuel|demo-fuel|weather|demo-weather|forecast|demo-forecast|seoul-places|er|demo-er)\.json$/.test(url.pathname)) {
    // 네트워크 우선, 실패하면 마지막으로 받은 소식
    e.respondWith(
      fetch(e.request).then((res) => {
        if (!res.ok) throw new Error('data unavailable');
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // 껍데기: 캐시 우선 + 뒤에서 갱신
  e.respondWith(
    caches.match(e.request).then((hit) => {
      // 뒤에서 갱신할 때도 HTTP 캐시 대신 서버에 확인(ETag 조건부 요청이라 바뀌지 않았으면 가볍다)
      const net = fetch(e.request, { cache: 'no-cache' }).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});

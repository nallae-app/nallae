// 앱 껍데기는 캐시해서 바로 열리게, 소식(news.json)은 항상 네트워크 우선.
const VERSION = 'nallae-v76';
const SHELL = [
  './', 'index.html', 'style.css', 'fonts/pretendard/pretendard-subset.css', 'fonts/wanted-sans/brand.css', 'fonts/wanted-sans/WantedSansVariable.woff2', 'app.js', 'local-scope.js', 'discovery.js', 'community.js', 'community-ui.js', 'nearby-fuel.js', 'manifest.webmanifest',
  'vendor/leaflet.min.css', 'vendor/leaflet.min.js', 'vendor/topojson-client.min.js',
  'data/regions.json', 'icons/logo-header.png', 'icons/logo-header-dark.png', 'icons/icon-192.png',
  'icons/apple-touch-icon-v2.png', 'icons/icon-192.png?v=2', 'icons/icon-512.png?v=2', 'icons/maskable-512.png?v=2',
  'icons/favicon-light-32.png', 'icons/favicon-dark-32.png',
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

  if (/\/data\/.+\.json$/.test(url.pathname) && !url.pathname.endsWith('/data/regions.json')) {
    // 모든 갱신 자료(코스·식당 포함)는 네트워크 우선. 정적 지도 경계는 껍데기 캐시.
    // 연결만 열린 채 응답이 멈춰도 8초 뒤 마지막 정상 자료를 보여준다.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const network = fetch(e.request, { signal: controller.signal }).then(async (res) => {
        if (!res.ok) throw new Error('data unavailable');
        const copy = res.clone();
        try { await (await caches.open(VERSION)).put(e.request, copy); } catch (_) {}
        // 헤더 뒤 본문 수신이 멈춘 경우에도 중단된 응답 대신 정상 캐시로 돌아간다.
        if (controller.signal.aborted) throw new Error('data timed out');
        return res;
      }).finally(() => clearTimeout(timeout));
    e.respondWith(network.catch(async () => (await caches.match(e.request)) || Response.error()));
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
      e.waitUntil(net.then(() => {}));
      return hit || net;
    })
  );
});

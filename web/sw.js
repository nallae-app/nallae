// 앱 껍데기는 캐시해서 바로 열리게, 소식(news.json)은 항상 네트워크 우선.
const VERSION = 'nallae-v20';
const SHELL = [
  './', 'index.html', 'style.css', 'fonts/pretendard/pretendard-subset.css', 'app.js', 'manifest.webmanifest',
  'vendor/leaflet.min.css', 'vendor/leaflet.min.js', 'vendor/topojson-client.min.js',
  'data/regions.json', 'icons/icon.svg', 'icons/icon-192.png',
  'about.html', 'privacy.html',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
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

  if (/\/data\/(?:demo-)?food\//.test(url.pathname) || /\/(?:news|festivals|demo-festivals|fuel|demo-fuel|weather|demo-weather|forecast|demo-forecast)\.json$/.test(url.pathname)) {
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
      const net = fetch(e.request).then((res) => {
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

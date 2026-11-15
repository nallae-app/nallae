// 앱 껍데기는 캐시해서 바로 열리게, 소식(news.json)은 항상 네트워크 우선.
const VERSION = 'nallae-v90';
const SHELL = [
  './', 'index.html', 'style.css', 'discovery-home.css', 'images/courses/bosu-books.webp', 'images/courses/jeolmul-forest.webp', 'fonts/pretendard/pretendard-subset.css', 'fonts/wanted-sans/brand.css', 'fonts/wanted-sans/WantedSansVariable.woff2', 'app.js', 'release-update.js', 'discovery-shelf.js', 'data/discovery-shelf.json', 'overseas-courses.js', 'overseas-map.js', 'data/overseas-courses.json', 'data/world-land.json', 'local-scope.js', 'discovery.js', 'community.js', 'community-ui.js', 'nearby-fuel.js', 'manifest.webmanifest',
  'vendor/leaflet.min.css', 'vendor/leaflet.min.js', 'vendor/topojson-client.min.js',
  'data/regions.json', 'icons/logo-header.png', 'icons/logo-header-dark.png', 'icons/icon-192.png',
  'icons/apple-touch-icon-v2.png', 'icons/icon-192.png?v=2', 'icons/icon-512.png?v=2', 'icons/maskable-512.png?v=2',
  'icons/favicon-light-32.png', 'icons/favicon-dark-32.png',
  'about.html', 'privacy.html', 'doc.css',
].map(path=>/\.(?:js|css)$/.test(path)&&!path.startsWith('vendor/')?path+'?v=90':path);

self.addEventListener('install', (e) => {
  // GitHub Pages는 max-age=600을 보낸다. 기본 요청이면 새 버전 캐시에 10분 묵은 이전 파일이 담길 수 있어 HTTP 캐시를 건너뛴다.
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

// 새 껍데기로 바꿔도 마지막 정상 동네 자료는 보존한다.
const dynamicData = url => url.origin === location.origin && /\/data\/.+\.json$/.test(url.pathname) && !url.pathname.endsWith('/data/regions.json');
async function cachedData(request) {
  const keys = (await caches.keys()).filter(k => /^nallae-v\d+$/.test(k) && Number(k.slice(8)) <= Number(VERSION.slice(8)))
    .sort((a,b) => Number(b.slice(8)) - Number(a.slice(8)));
  for (const key of keys) {
    const hit = await (await caches.open(key)).match(request);
    if (hit?.ok) return hit;
  }
  return Response.error();
}
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const current = await caches.open(VERSION);
    const older = (await caches.keys()).filter(k => /^nallae-v\d+$/.test(k) && Number(k.slice(8)) < Number(VERSION.slice(8)))
      .sort((a,b) => Number(b.slice(8)) - Number(a.slice(8)));
    for (const key of older) {
      let migrated = true;
      try {
        const previous = await caches.open(key);
        for (const request of await previous.keys()) {
          if (!dynamicData(new URL(request.url)) || await current.match(request)) continue;
          const response = await previous.match(request);
          if (response?.ok) await current.put(request, response);
        }
      } catch (_) { migrated = false; }
      // 저장공간 오류 때는 유일한 정상 사본을 지우지 않는다.
      if (migrated) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  // A release check must never report an older cached version as the latest.
  if(url.pathname.endsWith('/data/app-release.json')){e.respondWith(fetch(e.request,{cache:'no-store'}));return;}
  // Documents start with the current HTML; an offline launch still uses its shell.
  if(e.request.mode==='navigate'||/\.html$/.test(url.pathname)){
    const canonical=new URL(url.href);canonical.search='';canonical.hash='';
    if(canonical.pathname.endsWith('/'))canonical.pathname+='index.html';
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4000);
    const network=(async()=>{
      try{
        const response=await fetch(url.href,{cache:'no-cache',signal:controller.signal});
        if(!response.ok||!response.headers.get('content-type')?.includes('text/html'))throw Error('document response');
        const body=await response.arrayBuffer();if(controller.signal.aborted)throw Error('document timeout');
        const headers=new Headers(response.headers);headers.delete('content-encoding');headers.delete('content-length');
        const fresh=new Response(body,{status:response.status,statusText:response.statusText,headers});
        e.waitUntil(caches.open(VERSION).then(c=>c.put(canonical.href,fresh.clone())).catch(()=>{}));
        return fresh;
      }finally{clearTimeout(timer);}
    })();
    e.respondWith(network.catch(async()=>{const c=await caches.open(VERSION);return await c.match(canonical.href)||await c.match(e.request)||Response.error();}));return;
  }

  if (dynamicData(url)) {
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
    e.respondWith(network.catch(() => cachedData(e.request)));
    return;
  }

  // A versioned program must not be replaced behind an already-open document.
  if(url.searchParams.has('v')&&/\.(?:js|css)$/.test(url.pathname)){
    e.respondWith(caches.open(VERSION).then(async c=>{
      const hit=await c.match(e.request);if(hit)return hit;
      const response=await fetch(e.request,{cache:'no-cache'});
      if(response.ok)e.waitUntil(c.put(e.request,response.clone()).catch(()=>{}));
      return response;
    }));return;
  }

  // 껍데기: 캐시 우선 + 뒤에서 갱신
  e.respondWith(
    caches.open(VERSION).then(c => c.match(e.request)).then((hit) => {
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

(() => {
  'use strict';

  // ---------- 설정 ----------
  const params = new URLSearchParams(location.search);
  const DEMO = params.has('demo');
  const NEWS_URL = DEMO ? 'data/demo-news.json' : 'data/news.json';
  const POLL_MS = 60 * 1000;          // 소식 파일 다시 읽는 간격
  const REPLAY_WINDOW_MIN = 60;       // 첫 진입 때 재생할 최근 소식 범위
  const REPLAY_STEP_MS = 550;
  const MUNI_ZOOM = 8.5;              // 이 배율부터 시·군·구 단위로 본다

  const CATEGORIES = ['재난', '기상', '사건', '교통', '개발', '행정', '생활', '정책'];
  const css = getComputedStyle(document.documentElement);
  const colorOf = (cat) => css.getPropertyValue(`--c-${cat}`).trim() || '#9fb3d9';

  if (DEMO) document.getElementById('badge-demo').hidden = false;

  // ---------- 화면 요소 ----------
  const panel = document.getElementById('panel');
  const feedEl = document.getElementById('feed');
  const titleEl = document.getElementById('panel-title');
  const subEl = document.getElementById('panel-sub');
  const chipsEl = document.getElementById('chips');
  const locateBtn = document.getElementById('btn-locate');
  const toastEl = document.getElementById('toast');

  // ---------- 지도 ----------
  const map = L.map('map', { zoomControl: false, minZoom: 5, maxZoom: 13, zoomSnap: 0.25 });
  map.attributionControl.setPrefix(false)
    .addAttribution('행정구역 © 통계청 SGIS(공공누리 1유형) · <a href="https://github.com/vuski/admdongkor" target="_blank" rel="noopener">admdongkor</a>');
  map.createPane('munis').style.zIndex = 400;
  map.createPane('provs').style.zIndex = 410;
  map.getPane('provs').style.pointerEvents = 'none';
  map.createPane('pulses').style.zIndex = 650;

  const baseStyle = { color: '#22324f', weight: 0.6, fillColor: '#13203a', fillOpacity: 1 };
  let munis = [], muniByCode = new Map(), sidos = new Map(), neighborIdx = [], homeBounds = null;

  const leftPad = () => (window.innerWidth >= 760 ? [370, 70] : [10, 110]);
  const bottomPad = () => (window.innerWidth >= 760 ? [20, 20] : [10, panel.offsetHeight + 10]);
  const fitHome = () => map.fitBounds(homeBounds, { paddingTopLeft: leftPad(), paddingBottomRight: bottomPad() });

  function setupRegions(topo) {
    const sggObj = topo.objects.sgg;
    const sggGeo = topojson.feature(topo, sggObj);
    neighborIdx = topojson.neighbors(sggObj.geometries);
    munis = sggGeo.features.map((f, i) => ({
      i, feature: f, layer: null,
      code: f.properties.code, name: f.properties.name,
      sido: f.properties.sido, sidoName: f.properties.sidoName, short: f.properties.short,
      center: centroid(f.geometry),
    }));
    muniByCode = new Map(munis.map((m) => [m.code, m]));
    for (const m of munis) {
      if (!sidos.has(m.sido)) sidos.set(m.sido, { code: m.sido, name: m.sidoName, munis: [] });
      sidos.get(m.sido).munis.push(m);
    }

    const muniLayer = L.geoJSON(sggGeo, {
      pane: 'munis',
      style: () => ({ ...baseStyle, className: 'region' }),
      onEachFeature: (f, layer) => {
        const m = muniByCode.get(f.properties.code);
        m.layer = layer;
        layer.on('click', () => onRegionClick(m));
        layer.on('mouseover', () => { if (!m.flashing && !isSelected(m)) layer.setStyle({ fillColor: '#1b2d4f' }); });
        layer.on('mouseout', () => { if (!m.flashing) restyle(m); });
      },
    }).addTo(map);
    const sidoGeo = topojson.feature(topo, topo.objects.sido);
    sidoGeo.features.forEach((f) => { const s = sidos.get(f.properties.code); if (s) s.short = f.properties.short; });
    L.geoJSON(sidoGeo, {
      pane: 'provs', interactive: false, style: { color: '#4a6491', weight: 1.3, fill: false },
    }).addTo(map);

    for (const s of sidos.values()) {
      s.bounds = L.latLngBounds([]);
      s.munis.forEach((m) => s.bounds.extend(m.layer.getBounds()));
      s.center = s.munis.reduce((a, m) => [a[0] + m.center[0] / s.munis.length, a[1] + m.center[1] / s.munis.length], [0, 0]);
    }
    homeBounds = muniLayer.getBounds();
    fitHome();
  }

  // 화면 크기가 바뀌면(앱이 백그라운드에서 열려 크기가 0이었던 경우 포함) 아직 손대지 않은 전국 화면을 다시 맞춘다
  let atHome = true;
  map.on('dragstart', () => { atHome = false; });
  new ResizeObserver(() => {
    map.invalidateSize();
    if (atHome && homeBounds) fitHome();
  }).observe(document.getElementById('map'));

  const label = (m) => `${m.short} ${m.name}`;

  map.on('zoomend', () => {
    const z = map.getZoom() >= MUNI_ZOOM;
    baseStyle.weight = z ? 1 : 0.6;
    baseStyle.color = z ? '#2f4570' : '#22324f';
    munis.forEach((m) => { if (!m.flashing) restyle(m); });
  });

  // ---------- 선택(내 주변 / 지역 선택) ----------
  let selection = null; // { center, codes:Set, fromLocation }
  let category = null;
  let meMarker = null;

  const isSelected = (m) => !!selection && selection.codes.has(m.code);
  function restyle(m) {
    if (!m.layer) return;
    if (selection && selection.center === m) m.layer.setStyle({ ...baseStyle, fillColor: '#2a3b1f', color: '#ffcf3f', weight: 1.6 });
    else if (isSelected(m)) m.layer.setStyle({ ...baseStyle, fillColor: '#1f2a1e', color: '#8a7a3a', weight: 1 });
    else m.layer.setStyle(baseStyle);
  }

  function onRegionClick(m) {
    atHome = false;
    if (map.getZoom() < MUNI_ZOOM) {
      map.flyToBounds(sidos.get(m.sido).bounds, { paddingTopLeft: leftPad(), paddingBottomRight: bottomPad(), duration: 0.8 });
      return;
    }
    select(m, false);
  }

  function select(m, fromLocation) {
    atHome = false;
    const prev = selection;
    const codes = new Set([m.code, ...neighborIdx[m.i].map((j) => munis[j].code)]);
    selection = { center: m, codes, fromLocation };
    if (prev) prev.codes.forEach((c) => restyle(muniByCode.get(c)));
    codes.forEach((c) => restyle(muniByCode.get(c)));
    const bounds = L.latLngBounds([]);
    codes.forEach((c) => bounds.extend(muniByCode.get(c).layer.getBounds()));
    map.flyToBounds(bounds, { paddingTopLeft: leftPad(), paddingBottomRight: bottomPad(), duration: 0.8, maxZoom: 11 });
    renderFeed();
  }

  function clearSelection() {
    const prev = selection;
    selection = null;
    if (prev) prev.codes.forEach((c) => restyle(muniByCode.get(c)));
    locateBtn.classList.remove('active');
    if (meMarker) { map.removeLayer(meMarker); meMarker = null; }
    renderFeed();
  }

  // ---------- 위잉 ----------
  function flash(m, color) {
    m.flashing = true;
    const el = m.layer.getElement();
    el.classList.add('flash');
    m.layer.setStyle({ fillColor: color, fillOpacity: 0.85 });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.classList.remove('flash');
      m.layer.setStyle({ fillColor: isSelected(m) ? '#1f2a1e' : baseStyle.fillColor, fillOpacity: 1 });
    }));
    clearTimeout(m.flashTimer);
    m.flashTimer = setTimeout(() => { m.flashing = false; restyle(m); }, 1700);
  }

  let bubbleMarker = null;
  // 정책브리핑처럼 지명이 '언급'만 된 자료는 목록에만 두고 지도에 찍지 않는다
  const onMap = (item) => item.onMap !== false && item.src !== 'brief';

  function pulse(item, withBubble) {
    if (!onMap(item)) return;
    const color = colorOf(item.cat);
    const targets = itemMunis(item);
    if (!targets.length) return;
    targets.forEach((m) => flash(m, color));

    // 펄스는 한 곳에: 시·군·구 하나면 그 중심, 여러 곳이면 첫 지역, 시·도 전체면 시·도 중심
    const at = item.sgg?.length ? muniByCode.get(item.sgg[0])?.center : sidos.get(item.sido?.[0])?.center;
    if (!at) return;
    const where = placeLabel(item);
    // 화면 가장자리 근처면 말풍선을 안쪽으로 붙인다
    const x = map.latLngToContainerPoint(at).x, w = map.getSize().x;
    const edge = x > w - 150 ? ' to-left' : x < 150 ? ' to-right' : '';
    const html = `<div class="pulse" style="--c:${color}">
      <span class="ring"></span><span class="ring r2"></span><span class="ring r3"></span><span class="dot"></span>
      ${withBubble ? `<div class="bubble${edge}"><b>${escapeHtml(where)}</b>${escapeHtml(item.title)}</div>` : ''}
    </div>`;
    const marker = L.marker(at, {
      pane: 'pulses', interactive: false, keyboard: false,
      icon: L.divIcon({ className: '', html, iconSize: [0, 0] }),
    }).addTo(map);
    if (withBubble) {
      if (bubbleMarker) map.removeLayer(bubbleMarker);
      bubbleMarker = marker;
    }
    setTimeout(() => { map.removeLayer(marker); if (bubbleMarker === marker) bubbleMarker = null; }, 5600);
  }

  function itemMunis(item) {
    const out = new Set();
    (item.sgg || []).forEach((c) => muniByCode.has(c) && out.add(muniByCode.get(c)));
    (item.sido || []).forEach((c) => sidos.get(c)?.munis.forEach((m) => out.add(m)));
    return [...out];
  }

  function placeLabel(item) {
    const sgg = (item.sgg || []).map((c) => muniByCode.get(c)).filter(Boolean);
    const sido = (item.sido || []).map((c) => sidos.get(c)).filter(Boolean);
    const names = [...sido.map((s) => `${s.short} 전체`), ...sgg.map(label)];
    if (!names.length) return '전국';
    const text = names.length > 2 ? `${names[0]} 외 ${names.length - 1}곳` : names.join(', ');
    return onMap(item) ? text : `관련: ${text}`;
  }

  // ---------- 소식 ----------
  let items = [];          // 최신이 앞
  const seen = new Set();
  let openId = null;
  let firstLoad = true;

  async function load() {
    let data;
    try {
      const res = await fetch(NEWS_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status);
      data = await res.json();
    } catch (e) {
      if (firstLoad) {
        subEl.textContent = '소식을 불러오지 못했어요. 잠시 후 다시 시도할게요.';
        firstLoad = false;
      }
      return;
    }
    const incoming = (data.items || [])
      .filter((it) => it.id && it.title && it.time)
      .sort((a, b) => new Date(b.time) - new Date(a.time));
    const fresh = incoming.filter((it) => !seen.has(it.id));
    incoming.forEach((it) => seen.add(it.id));
    items = incoming;
    updatedAt = data.updated ? new Date(data.updated) : null;

    if (firstLoad) {
      firstLoad = false;
      renderFeed();
      // 첫 진입: 최근 1시간 소식을 오래된 것부터 빠르게 재생
      const cutoff = Date.now() - REPLAY_WINDOW_MIN * 60000;
      const replay = incoming.filter((it) => new Date(it.time) >= cutoff).slice(0, 20).reverse();
      replay.forEach((it, k) => setTimeout(() => pulse(it, k === replay.length - 1 || k % 3 === 0), 500 + k * REPLAY_STEP_MS));
      return;
    }
    renderFeed(new Set(fresh.map((it) => it.id)));
    fresh.slice().reverse().forEach((it, k) => setTimeout(() => pulse(it, true), k * 1200));
  }
  let updatedAt = null;

  function visible(item) {
    if (category && item.cat !== category) return false;
    if (selection && !onMap(item)) return false;
    if (selection && !itemMunis(item).some((m) => selection.codes.has(m.code))) return false;
    return true;
  }

  function renderFeed(newIds) {
    if (selection) {
      const n = selection.codes.size - 1;
      titleEl.textContent = `${label(selection.center)} 주변`;
      subEl.textContent = `${selection.fromLocation ? '내 위치 기준 · ' : ''}${selection.center.name}와 맞닿은 ${n}곳 포함`;
    } else {
      titleEl.textContent = '전국 소식';
      subEl.textContent = updatedAt ? `${ago(updatedAt)} 업데이트 · 새 소식이 오면 지도가 반짝여요` : '새 소식이 들어오면 지도가 반짝여요';
    }
    const list = items.filter(visible).slice(0, 80);
    feedEl.innerHTML = list.length
      ? list.map((it) => `
          <li data-id="${escapeHtml(it.id)}" class="${newIds?.has(it.id) ? 'new' : ''}${it.id === openId ? ' open' : ''}" style="--c:${colorOf(it.cat)}">
            <span class="bar"></span>
            <div>
              <div class="meta"><b>${escapeHtml(it.cat)}</b><span>${escapeHtml(placeLabel(it))}</span><span>· ${ago(new Date(it.time))}</span></div>
              <div class="title">${escapeHtml(it.title)}</div>
              ${it.id === openId ? detail(it) : ''}
            </div>
          </li>`).join('')
      : `<li class="empty">${selection ? '아직 이 주변엔 새 소식이 없어요' : '아직 들어온 소식이 없어요'}</li>`;
  }

  function detail(it) {
    return `<div class="detail">
      ${it.body ? `<p>${escapeHtml(it.body)}</p>` : ''}
      <div class="src">
        <span>출처: ${escapeHtml(it.source || '')}${it.license ? ` · ${escapeHtml(it.license)}` : ''}</span>
        ${it.url ? `<a href="${escapeAttr(it.url)}" target="_blank" rel="noopener">원문 보기 ↗</a>` : ''}
      </div>
    </div>`;
  }

  feedEl.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    const item = items.find((x) => x.id === li.dataset.id);
    if (!item) return;
    openId = openId === item.id ? null : item.id;
    atHome = false;
    renderFeed();
    const targets = onMap(item) ? itemMunis(item) : [];
    if (targets.length) {
      const b = L.latLngBounds([]);
      targets.forEach((m) => b.extend(m.layer.getBounds()));
      map.flyToBounds(b, { paddingTopLeft: leftPad(), paddingBottomRight: bottomPad(), duration: 0.8, maxZoom: 10.5 });
      setTimeout(() => pulse(item, true), 700);
    }
  });

  chipsEl.innerHTML = [null, ...CATEGORIES].map((c) =>
    `<button type="button" data-cat="${c || ''}" aria-pressed="${c === null}" style="${c ? `--chip:${colorOf(c)}` : ''}">${c || '전체'}</button>`
  ).join('');
  chipsEl.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    category = b.dataset.cat || null;
    chipsEl.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderFeed();
  });

  // ---------- 내 위치 (좌표는 기기 밖으로 보내지 않는다) ----------
  locateBtn.addEventListener('click', () => {
    if (!munis.length) return;
    if (!navigator.geolocation) return toast('이 기기에서는 위치 기능을 쓸 수 없어요. 지도에서 동네를 눌러 고르세요.');
    toast('내 위치를 찾는 중…');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const pt = [coords.longitude, coords.latitude];
        const m = munis.find((x) => containsPoint(x.feature.geometry, pt));
        if (!m) return toast('국내 위치가 아니라서 찾지 못했어요. 지도에서 동네를 눌러 고르세요.');
        locateBtn.classList.add('active');
        if (meMarker) map.removeLayer(meMarker);
        meMarker = L.marker([coords.latitude, coords.longitude], {
          pane: 'pulses', interactive: false,
          icon: L.divIcon({ className: '', iconSize: [0, 0], html: '<div class="pulse me"><span class="ring"></span><span class="dot"></span></div>' }),
        }).addTo(map);
        select(m, true);
        toast(`${label(m)} 주변 소식을 보여드려요`);
      },
      () => toast('위치 권한이 없어요. 지도에서 동네를 눌러 고르세요.'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  });

  document.getElementById('btn-all').addEventListener('click', () => { clearSelection(); atHome = true; fitHome(); });

  document.getElementById('panel-handle').addEventListener('click', () => panel.classList.toggle('collapsed'));

  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2800);
  }

  // ---------- 시작 ----------
  fetch('data/regions.json')
    .then((r) => r.json())
    .then((topo) => {
      setupRegions(topo);
      if (params.has('debug')) window.nallae = { map, munis, sidos };
      // 데모 전용(스토어 스크린샷용): ?demo&near=11440 → 그 지역을 '내 위치'처럼 선택, &open → 첫 소식 펼치기
      if (DEMO && muniByCode.has(params.get('near'))) {
        const m = muniByCode.get(params.get('near'));
        locateBtn.classList.add('active');
        meMarker = L.marker(m.center, {
          pane: 'pulses', interactive: false,
          icon: L.divIcon({ className: '', iconSize: [0, 0], html: '<div class="pulse me"><span class="ring"></span><span class="dot"></span></div>' }),
        }).addTo(map);
        select(m, true);
      }
      load().then(() => {
        if (DEMO && params.has('open')) {
          const first = items.find(visible);
          if (first) { openId = first.id; renderFeed(); }
        }
      });
      setInterval(load, POLL_MS);
      setInterval(() => renderFeed(), 30000); // "n분 전" 갱신
      document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
    })
    .catch(() => toast('지도를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'));

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // ---------- 도구 ----------
  function centroid(geom) {
    // 가장 큰 폴리곤 외곽선의 면적 중심 (섬 지역에서 바다 위로 찍히는 것 방지)
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    let best = null, bestArea = 0;
    for (const poly of polys) {
      const ring = poly[0];
      let a = 0, cx = 0, cy = 0;
      for (let k = 0, j = ring.length - 1; k < ring.length; j = k++) {
        const f = ring[j][0] * ring[k][1] - ring[k][0] * ring[j][1];
        a += f; cx += (ring[j][0] + ring[k][0]) * f; cy += (ring[j][1] + ring[k][1]) * f;
      }
      if (Math.abs(a) > bestArea) { bestArea = Math.abs(a); best = [cy / (3 * a), cx / (3 * a)]; }
    }
    return best;
  }

  function containsPoint(geom, [x, y]) {
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    return polys.some((poly) => {
      let inside = false;
      for (const ring of poly) {
        for (let k = 0, j = ring.length - 1; k < ring.length; j = k++) {
          const [xi, yi] = ring[k], [xj, yj] = ring[j];
          if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
        }
      }
      return inside;
    });
  }

  function ago(t) {
    const min = Math.round((Date.now() - t) / 60000);
    if (min < 1) return '방금';
    if (min < 60) return `${min}분 전`;
    if (min < 1440) return `${Math.floor(min / 60)}시간 전`;
    return `${Math.floor(min / 1440)}일 전`;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function escapeAttr(s) {
    return /^https?:\/\//i.test(s) ? escapeHtml(s) : '#';
  }
})();

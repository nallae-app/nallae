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
  const root = document.documentElement;
  const token = (name) => getComputedStyle(root).getPropertyValue('--' + name).trim();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const signalName = (it) => ({ critical:'signal-critical', urgent:'signal-urgent', normal:'brand' }[it.urgency] || 'signal-unknown');
  const signalStyle = (it) => '--signal:var(--' + signalName(it) + ')';
  const urgencyBadge = (it) => {
    const u = ['critical','urgent','normal'].includes(it.urgency) ? it.urgency : 'unknown';
    return u === 'normal' ? '' : '<span class="urgency ' + u + '">' + ({critical:'위급',urgent:'긴급',unknown:'구분 미제공'}[u]) + '</span>';
  };
  const iconPaths = {
    '재난':'M12 3 2 21h20L12 3ZM12 9v5m0 3v1',
    '기상':'M7 16a4 4 0 1 1 1-8 5 5 0 0 1 9 2 3 3 0 0 1 0 6H7ZM8 19l-1 2m6-2-1 2m6-2-1 2',
    '사건':'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3ZM12 8v5m0 3v1',
    '교통':'M5 16h14l-1-9H6l-1 9ZM5 12h14M7 16v4m10-4v4M8 7V4h8v3',
    '개발':'M4 21V9l8-6 8 6v12M2 21h20M9 21v-7h6v7',
    '행정':'M3 9h18L12 3 3 9ZM5 10v8m7-8v8m7-8v8M3 21h18',
    '생활':'M12 21S3 15 3 9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6-9 12-9 12Z',
    '정책':'M6 3h9l4 4v14H6V3ZM14 3v5h5M9 12h7m-7 4h7'
  };
  const icon = (cat) => '<svg class="category-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="' + (iconPaths[cat] || iconPaths['생활']) + '"/></svg>';
  const themeButton = document.getElementById('btn-theme');
  function applyTheme() {
    const mode = root.dataset.themeMode;
    root.dataset.theme = mode === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : mode;
    const name = {light:'라이트',dark:'다크',system:'시스템'}[mode];
    const shape = {light:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>',dark:'<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>',system:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4M12 7v7m0-7a3.5 3.5 0 0 1 0 7"/>'}[mode];
    themeButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + shape + '</svg>';
    themeButton.setAttribute('aria-label', '화면 테마: ' + name + '. 누르면 다음 설정');
  }
  themeButton.addEventListener('click', () => {
    const modes = ['system','light','dark'];
    root.dataset.themeMode = modes[(modes.indexOf(root.dataset.themeMode) + 1) % 3];
    try { localStorage.setItem('nallae-theme', root.dataset.themeMode); } catch (_) {}
    applyTheme();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  applyTheme();

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

  const baseStyle = { color: token('border-sgg'), weight: 0.6, fillColor: token('land'), fillOpacity: 1 };
  let provinceLayer;
  const moveToBounds = (bounds, options) => reducedMotion.matches ? map.fitBounds(bounds, { ...options, animate:false }) : map.flyToBounds(bounds, options);
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
        layer.on('mouseover', () => { if (!m.flashing && !isSelected(m)) layer.setStyle({ fillColor: token('surface-muted') }); });
        layer.on('mouseout', () => { if (!m.flashing) restyle(m); });
      },
    }).addTo(map);
    const sidoGeo = topojson.feature(topo, topo.objects.sido);
    sidoGeo.features.forEach((f) => { const s = sidos.get(f.properties.code); if (s) s.short = f.properties.short; });
    provinceLayer = L.geoJSON(sidoGeo, {
      pane: 'provs', interactive: false, style: { color: token('border-sido'), weight: 1.3, fill: false },
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
    baseStyle.color = token('border-sgg');
    munis.forEach((m) => { if (!m.flashing) restyle(m); });
  });

  // ---------- 선택(내 주변 / 지역 선택) ----------
  let selection = null; // { center, codes:Set, fromLocation }
  let category = null;
  let meMarker = null;

  const isSelected = (m) => !!selection && selection.codes.has(m.code);
  function restyle(m) {
    if (!m.layer) return;
    if (selection && selection.center === m) m.layer.setStyle({ ...baseStyle, fillColor: token('selection-fill'), color: token('brand'), weight: 2 });
    else if (isSelected(m)) m.layer.setStyle({ ...baseStyle, fillColor: token('selection-fill'), color: token('border-sido'), weight: 1 });
    else m.layer.setStyle(baseStyle);
  }

  function onRegionClick(m) {
    atHome = false;
    if (map.getZoom() < MUNI_ZOOM) {
      moveToBounds(sidos.get(m.sido).bounds, { paddingTopLeft: leftPad(), paddingBottomRight: bottomPad(), duration: 0.8 });
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
    moveToBounds(bounds, { paddingTopLeft: leftPad(), paddingBottomRight: bottomPad(), duration: 0.8, maxZoom: 11 });
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
  function flash(m, signal) {
    m.flashing = true;
    m.signal = signal;
    m.flashStarted = performance.now();
    const el = m.layer.getElement();
    el.classList.add('flash');
    m.layer.setStyle({ fillColor: token(signal), fillOpacity: 0.85 });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.classList.remove('flash');
      m.layer.setStyle({ fillColor: isSelected(m) ? token('selection-fill') : baseStyle.fillColor, fillOpacity: 1 });
    }));
    clearTimeout(m.flashTimer);
    m.flashTimer = setTimeout(() => { m.flashing = false; restyle(m); }, 2400);
  }

  const bubbleEl = document.createElement('div');
  bubbleEl.className = 'map-bubble';
  bubbleEl.hidden = true;
  document.body.append(bubbleEl);
  let bubbleAt = null, bubbleUntil = 0, bubbleTimer;
  const replayEl = document.getElementById('replay-status');
  function placeMapOverlays() {
    const sheet = panel.getBoundingClientRect();
    const controls = document.querySelector('.controls').getBoundingClientRect();
    const header = document.querySelector('.topbar').getBoundingClientRect();
    const desktop = matchMedia('(min-width:760px)').matches;
    const left = desktop ? sheet.right + 16 : 12;
    const right = desktop ? controls.left - 12 : innerWidth - 12;
    const top = Math.max(header.bottom, controls.bottom) + 8;
    const bottom = desktop ? innerHeight - 28 : sheet.top - 12;
    const width = Math.max(0, right - left);
    replayEl.style.left = left + 'px';
    replayEl.style.top = top + 'px';
    replayEl.style.maxWidth = width + 'px';
    const minY = top + (replayEl.hidden ? 0 : replayEl.getBoundingClientRect().height + 8);
    bubbleEl.style.maxWidth = Math.min(innerWidth * .72, width) + 'px';
    if (!bubbleAt || bubbleEl.hidden) return;
    const box = bubbleEl.getBoundingClientRect();
    bubbleEl.style.visibility = width >= 80 && bottom - minY >= box.height ? 'visible' : 'hidden';
    const point = map.latLngToContainerPoint(bubbleAt);
    const x = point.x + box.width > right ? point.x - box.width : point.x;
    const y = point.y - box.height - 14 < minY ? point.y + 14 : point.y - box.height - 14;
    bubbleEl.style.left = Math.max(left, Math.min(x, right - box.width)) + 'px';
    bubbleEl.style.top = Math.max(minY, Math.min(y, bottom - box.height)) + 'px';
  }
  function showMapBubble(item, at) {
    if (Date.now() < bubbleUntil) return;
    clearTimeout(bubbleTimer);
    bubbleAt = at;
    bubbleUntil = item.urgency === 'critical' ? Date.now() + 4000 : 0;
    bubbleEl.innerHTML = urgencyBadge(item) + '<span class="bubble-title">' + escapeHtml(placeLabel(item)) + ' · ' + escapeHtml(item.title) + '</span>';
    bubbleEl.hidden = false;
    placeMapOverlays();
    bubbleTimer = setTimeout(() => { bubbleEl.hidden = true; bubbleAt = null; bubbleUntil = 0; }, item.urgency === 'critical' ? 4000 : 2800);
  }
  const overlayObserver = new ResizeObserver(placeMapOverlays);
  [panel, document.querySelector('.topbar'), document.querySelector('.controls')].forEach(el => overlayObserver.observe(el));
  new MutationObserver(placeMapOverlays).observe(replayEl, { attributes:true, attributeFilter:['hidden'] });
  map.on('move zoom resize', placeMapOverlays);
  window.addEventListener('resize', placeMapOverlays);
  // 정책브리핑처럼 지명이 '언급'만 된 자료는 목록에만 두고 지도에 찍지 않는다
  const onMap = (item) => item.onMap !== false && item.src !== 'brief';

  function pulse(item, withBubble) {
    if (!onMap(item)) return;
    const signal = signalName(item);
    const targets = itemMunis(item);
    if (!targets.length) return;
    targets.forEach((m) => flash(m, signal));

    // 펄스는 한 곳에: 시·군·구 하나면 그 중심, 여러 곳이면 첫 지역, 시·도 전체면 시·도 중심
    const at = item.sgg?.length ? muniByCode.get(item.sgg[0])?.center : sidos.get(item.sido?.[0])?.center;
    if (!at) return;
    const html = `<div class="pulse" style="${signalStyle(item)}">
      ${reducedMotion.matches ? '' : '<span class="ring"></span>'}<span class="dot"></span>
    </div>`;
    const marker = L.marker(at, {
      pane: 'pulses', interactive: false, keyboard: false,
      icon: L.divIcon({ className: '', html, iconSize: [0, 0] }),
    }).addTo(map);
    if (withBubble) showMapBubble(item, at);
    setTimeout(() => map.removeLayer(marker), 5600);
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
      loadFailed = true;
      renderFeed(null, true);
      if (firstLoad) {
        subEl.textContent = '소식을 불러오지 못했어요. 잠시 후 다시 시도할게요.';
        firstLoad = false;
      }
      return;
    }
    loadFailed = false;
    sources = data.sources || {};
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
      const replay = incoming.filter((it) => onMap(it) && new Date(it.time) >= cutoff).slice(0, 20).reverse();
      // Prioritize explicit urgency; preserve chronology within each group.
      const priority = it => ({critical:0,urgent:1}[it.urgency] ?? 2);
      replay.sort((a,b) => priority(a) - priority(b));
      const replayStatus = document.getElementById('replay-status');
      replayStatus.hidden = !replay.length;
      setTimeout(() => { replayStatus.hidden = true; }, 500 + replay.length * REPLAY_STEP_MS + 5600);
      replay.forEach((it, k) => setTimeout(() => pulse(it, ['critical','urgent'].includes(it.urgency) || k === replay.length - 1 || k % 3 === 0), 500 + k * REPLAY_STEP_MS));
      return;
    }
    const holding = feedEl.scrollTop > 8 || feedEl.contains(document.activeElement);
    if (holding) {
      const existing = new Set([...feedEl.querySelectorAll('[data-id]')].map(el => el.dataset.id));
      fresh.filter(visible).forEach(it => { if (!existing.has(it.id)) pending.add(it.id); });
    }
    renderFeed(new Set(fresh.map((it) => it.id)), holding);
    fresh.slice().reverse().forEach((it, k) => setTimeout(() => pulse(it, true), k * 1200));
  }
  let updatedAt = null;

  function visible(item) {
    if (category && item.cat !== category) return false;
    if (selection && !onMap(item)) return false;
    if (selection && !itemMunis(item).some((m) => selection.codes.has(m.code))) return false;
    return true;
  }

  let sources = {}, loadFailed = false;
  const pending = new Set();
  const newButton = document.getElementById('new-items');
  newButton.addEventListener('click', () => { pending.clear(); renderFeed(); feedEl.scrollTop = 0; });
  function updateTimes() {
    feedEl.querySelectorAll('time').forEach(el => { el.textContent = ago(new Date(el.dateTime)); });
    const status = document.getElementById('collection-status');
    const failed = Object.entries(sources).filter(([,v]) => v.ok === false);
    const stale = updatedAt && Date.now() - updatedAt > 60 * 60 * 1000;
    status.classList.toggle('failed', loadFailed || !!failed.length);
    status.classList.toggle('stale', !!stale);
    status.textContent = (loadFailed ? '소식을 새로 불러오지 못했어요 · ' : failed.length ? '일부 출처 수집 실패 · ' : stale ? '갱신이 지연되고 있어요 · ' : '') + (updatedAt ? ago(updatedAt) : '갱신 시각 미제공');
  }
  function sourceStatus() {
    const names = {sms:'긴급재난문자',wrn:'기상특보',brief:'정책브리핑'};
    return ['sms','wrn','brief'].map(key => {
      const v = sources[key];
      return '<p class="source-status">' + names[key] + ': ' + (!v ? '확인 정보 없음' : (v.ok === false ? '수집 실패' : '확인') + ' · ' + (v.at ? escapeHtml(new Date(v.at).toLocaleString('ko-KR')) : '시각 미제공')) + '</p>';
    }).join('');
  }
  function card(it) {
    const open = it.id === openId;
    return '<button type="button" class="card-toggle" aria-expanded="' + open + '"><span class="meta">' + urgencyBadge(it) + '<span class="category-label">' + icon(it.cat) + escapeHtml(it.cat) + '</span><span class="place-label">' + escapeHtml(placeLabel(it)) + '</span><time datetime="' + escapeHtml(it.time) + '">' + ago(new Date(it.time)) + '</time></span><span class="title">' + escapeHtml(it.title) + '</span></button>' + (open ? detail(it) : '');
  }
  function renderFeed(newIds, preserve = false) {
    if (!preserve) pending.clear();
    titleEl.textContent = selection ? label(selection.center) + ' 주변' : '전국 소식';
    subEl.textContent = selection ? (selection.fromLocation ? '내 위치 기준 · ' : '') + selection.center.name + '와 맞닿은 ' + (selection.codes.size - 1) + '곳 포함' : '최근 72시간 · 새 소식은 지도에서 먼저 반짝여요';
    const oldScroll = feedEl.scrollTop;
    const focused = document.activeElement;
    const focusId = focused?.closest('li[data-id]')?.dataset.id;
    const focusLink = focused?.tagName === 'A';
    const anchor = [...feedEl.children].find(el => el.offsetTop + el.offsetHeight > oldScroll);
    const anchorId = anchor?.dataset.id;
    const anchorOffset = anchor ? anchor.offsetTop - oldScroll : 0;
    for (const id of pending) if (!items.some(it => it.id === id && visible(it))) pending.delete(id);
    let list = items.filter(visible).filter(it => !pending.has(it.id));
    const policy = !category ? list.filter(it => it.cat === '정책') : [];
    if (!category) list = list.filter(it => it.cat !== '정책');
    list = list.slice(0,80);
    // Keep the expanded item available even when newer items push it below the display limit.
    const opened = items.find(it => it.id === openId && visible(it) && !pending.has(it.id));
    if (opened && (category || opened.cat !== '정책') && !list.includes(opened)) list.push(opened);
    const existing = new Map([...feedEl.querySelectorAll('li[data-id]')].map(el => [el.dataset.id,el]));
    const desired = [];
    for (const it of list) {
      let li = existing.get(it.id);
      if (!li) { li = document.createElement('li'); li.dataset.id = it.id; }
      const signature = JSON.stringify(it) + (it.id === openId);
      if (li._signature !== signature) { li.innerHTML = card(it); li._signature = signature; }
      li.classList.toggle('open',it.id === openId);
      li.classList.toggle('critical',it.urgency === 'critical');
      li.style.cssText = signalStyle(it);
      desired.push(li);
    }
    if (policy.length) {
      let li = feedEl.querySelector('[data-policy]') || document.createElement('li');
      li.dataset.policy = 'true';
      const policyText = '정책·관련 소식 ' + policy.length + '건 →';
      if (!li.firstElementChild) li.innerHTML = '<button type="button" class="policy-group"></button>';
      li.firstElementChild.textContent = policyText;
      desired.push(li);
    }
    if (!desired.length) {
      const li = document.createElement('li'); li.className = 'empty';
      const failed = loadFailed || Object.values(sources).some(v => v.ok === false);
      li.innerHTML = '<p>' + (failed ? '수집 상태를 확인해 주세요' : '선택한 지역에 수집된 소식이 없어요') + '</p><p>최근 72시간 · 포함 지역 ' + (selection ? selection.codes.size : munis.length) + '곳' + (category ? ' · ' + escapeHtml(category) : '') + '</p>' + sourceStatus();
      desired.push(li);
    }
    [...feedEl.children].forEach(el => { if (!desired.includes(el)) el.remove(); });
    desired.forEach((el,i) => { if (feedEl.children[i] !== el) feedEl.insertBefore(el,feedEl.children[i] || null); });
    const newAnchor = [...feedEl.children].find(el => el.dataset.id === anchorId);
    if (preserve) feedEl.scrollTop = newAnchor ? newAnchor.offsetTop - anchorOffset : oldScroll;
    if (focusId) {
      const li = [...feedEl.children].find(el => el.dataset.id === focusId);
      const target = li?.querySelector(focusLink ? 'a' : '.card-toggle');
      if (target && !target.contains(document.activeElement)) target.focus({preventScroll:true});
      else if (!li) { feedEl.tabIndex = -1; feedEl.focus({preventScroll:true}); }
    }
    newButton.hidden = !pending.size;
    newButton.textContent = '새 소식 ' + pending.size + '건';
    updateTimes();
  }
  function detail(it) {
    return '<div class="detail">' + (it.body ? '<p>' + escapeHtml(it.body) + '</p>' : '') + '<div class="src"><span>출처: ' + escapeHtml(it.source || '미제공') + (it.license ? ' · ' + escapeHtml(it.license) : '') + '</span><span>표시 근거: ' + escapeHtml(it.urgencyBasis || '구분 미제공') + '</span>' + (it.url ? '<a href="' + escapeAttr(it.url) + '" target="_blank" rel="noopener">원문 보기 ↗</a>' : '') + '</div></div>';
  }

  feedEl.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    if (e.target.closest('.policy-group')) { chipsEl.querySelector('[data-cat="정책"]').click(); return; }
    if (!e.target.closest('.card-toggle')) return;
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    const item = items.find((x) => x.id === li.dataset.id);
    if (!item) return;
    openId = openId === item.id ? null : item.id;
    atHome = false;
    renderFeed(null, true);
    const targets = onMap(item) ? itemMunis(item) : [];
    if (targets.length) {
      const b = L.latLngBounds([]);
      targets.forEach((m) => b.extend(m.layer.getBounds()));
      moveToBounds(b, { paddingTopLeft: leftPad(), paddingBottomRight: bottomPad(), duration: 0.8, maxZoom: 10.5 });
      setTimeout(() => pulse(item, true), 700);
    }
  });

  chipsEl.innerHTML = [null, ...CATEGORIES].map((c) =>
    `<button type="button" data-cat="${c || ''}" aria-pressed="${c === null}" >${c ? icon(c) : ''}${c || '전체'}</button>`
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

  new MutationObserver(() => {
    baseStyle.fillColor = token('land');
    baseStyle.color = token('border-sgg');
    provinceLayer?.setStyle({color:token('border-sido')});
    munis.forEach(m => {
      if (!m.flashing) { restyle(m); return; }
      const el = m.layer.getElement();
      el.classList.add('flash');
      restyle(m);
      m.layer.setStyle({fillColor:token(m.signal),fillOpacity:.85});
      requestAnimationFrame(() => requestAnimationFrame(() => {
        el.classList.remove('flash'); restyle(m);
      }));
    });
  }).observe(root, {attributes:true, attributeFilter:['data-theme','data-design']});

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
      setInterval(updateTimes, 30000); // "n분 전" 갱신
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

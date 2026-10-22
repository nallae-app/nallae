(() => {
'use strict';
const params = new URLSearchParams(location.search);
const DEMO = params.has('demo');
let mode = 'news';
try { if (localStorage.getItem('nallae-mode') === 'explore') mode = 'explore'; } catch (_) {}
if (DEMO && (params.has('rain') || params.has('snow'))) mode = 'explore';
rootMode();
function rootMode() { document.documentElement.dataset.mode = mode; }
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
const panel = document.getElementById('panel');
const feedEl = document.getElementById('feed');
const titleEl = document.getElementById('panel-title');
const subEl = document.getElementById('panel-sub');
const chipsEl = document.getElementById('chips');
const locateBtn = document.getElementById('btn-locate');
const toastEl = document.getElementById('toast');
const map = L.map('map', { zoomControl: false, minZoom: 5, maxZoom: 13, zoomSnap: 0.25 });
map.attributionControl.setPrefix(false)
  .addAttribution('행정구역 © 통계청 SGIS(공공누리 1유형) · <a href="https://github.com/vuski/admdongkor" target="_blank" rel="noopener">admdongkor</a>');
map.createPane('munis').style.zIndex = 400;
map.createPane('provs').style.zIndex = 410;
map.getPane('provs').style.pointerEvents = 'none';
map.createPane('labels').style.zIndex = 420;
map.getPane('labels').style.pointerEvents = 'none';
map.createPane('selection').style.zIndex = 430;
map.getPane('selection').style.pointerEvents = 'none';
// 장식(지도 조작·마커를 가리지 않게 마커층 아래, 터치·끌기는 지도로 통과)
map.createPane('decor').style.zIndex = 440;
map.getPane('decor').style.pointerEvents = 'none';

// 부캉이: 2026-09 부산 동구 북항 친수공원 수로에서 발견된 상어에 붙은 애칭(부산시설공단 작명)을 기념하는 장식.
// 현재 위치·실제 이동 경로가 아니다. 좌표는 OpenStreetMap '북항친수공원'(way 1562454530) 중심. 전국 지도에서도 같은 좌표에 보인다.
const BUKANGI = L.latLng(35.1100862, 129.0458678);
const bukangi = L.marker(BUKANGI, { pane: 'decor', interactive: true, keyboard: true, title: '부캉이 소개 보기', alt: '부캉이 소개 보기', icon: L.divIcon({ className: 'bukangi-marker', iconSize: [64, 44], iconAnchor: [4, 20], // 좌표는 그대로, 그림은 점의 바다 쪽(동쪽)에서만 오간다
  html: '<span class="bukangi-name" aria-hidden="true">부캉이</span><span class="bukangi" role="img" aria-label="부캉이 기념 캐릭터. 부산 북항 친수공원 수로에서 발견된 상어의 애칭을 기리는 장식이며 현재 위치나 이동 경로가 아니에요.">'
    + '<span class="bukangi-swim"><svg viewBox="0 0 64 40" aria-hidden="true">'
    + '<g class="bukangi-tail"><path d="M50 20 L62 10 Q59 20 62 30 Z"/></g>'
    + '<path class="bukangi-fin" d="M27 10 Q31 2 36 9 Z"/>'
    + '<ellipse class="bukangi-body" cx="30" cy="21" rx="22" ry="11"/>'
    + '<path class="bukangi-belly" d="M12 24 Q28 33 46 24 Q30 29 12 24 Z"/>'
    + '<circle class="bukangi-eye" cx="17" cy="18" r="2.2"/><circle class="bukangi-shine" cx="16.3" cy="17.3" r="0.7"/>'
    + '<path class="bukangi-smile" d="M11 23 Q14 26 18 24" fill="none"/>'
    + '<path class="bukangi-gill" d="M24 17 v6 M27 16.5 v7" fill="none"/>'
    + '</svg></span></span>' }) });
bukangi.bindPopup('<strong>🦈 부캉이</strong><p>부산 북항 친수공원 수로에서 발견된 상어의 애칭이에요.<br>날래에서는 북항을 헤엄치는 기념 캐릭터로 만나요.</p><small>현재 위치나 실제 이동 경로를 나타내지 않아요.</small>', { className: 'bukangi-popup', maxWidth: 250, autoPanPaddingTopLeft: [16, 90], autoPanPaddingBottomRight: [16, 260] });
bukangi.on('add', () => {
  const el = bukangi.getElement();
  el.setAttribute('aria-label', '부캉이 소개 보기');
  el.setAttribute('role', 'button');
  el.onkeydown = (event) => {
    if (event.key === 'Escape') bukangi.closePopup();
    if (event.key === ' ') { event.preventDefault(); bukangi.togglePopup(); }
  };
});
map.getContainer().addEventListener('click', (event) => {
  if (!event.target.closest('.bukangi-marker, .bukangi-popup')) bukangi.closePopup();
});
// 배율에 관계없이 화면 안에 있고 앱이 보이는 동안만 지도에 둔다.
function updateBukangi() {
  const show = !document.hidden && !decorationsPaused(['26110','26170']) && map.getBounds().pad(0.1).contains(BUKANGI);
  if (show && !map.hasLayer(bukangi)) bukangi.addTo(map);
  else if (!show && map.hasLayer(bukangi)) map.removeLayer(bukangi);
}
map.on('moveend zoomend', updateBukangi);
document.addEventListener('visibilitychange', updateBukangi);
map.createPane('pulses').style.zIndex = 650;

const baseStyle = { color: token('border-sgg'), weight: 0.6, fillColor: token('land'), fillOpacity: 1 };
let provinceLayer, selectionOutline;
const regionLabels = [];
let labelTimer, outlinedRegion;
function scheduleLabels() { clearTimeout(labelTimer); labelTimer = setTimeout(renderLabels, 90); }
function renderLabels() {
  if (outlinedRegion !== selection?.center) {
    if (selectionOutline) map.removeLayer(selectionOutline);
    outlinedRegion = selection?.center;
    selectionOutline = selection ? L.geoJSON(selection.center.feature, { pane:"selection", interactive:false, style:{color:token("brand"),weight:2,fill:false} }).addTo(map) : null;
  }
  selectionOutline?.setStyle({color:token("brand")});
  const safe = mapSafeArea();
  const occupied = replayEl.hidden ? [] : [replayEl.getBoundingClientRect()];
  const zoomed = map.getZoom() >= MUNI_ZOOM;
  const sorted = regionLabels.slice().sort((a,b) => {
    const rank = r => selection?.center.code === r.code ? 0 : r.kind === "sido" ? 1 : 2;
    return rank(a)-rank(b) || b.area-a.area || a.code.localeCompare(b.code);
  });
  for (const r of sorted) {
    const selected = selection?.center.code === r.code;
    const wth=mode==='explore' && exploreLayer==='weather' && r.kind!=='sido' && map.getZoom()>=MUNI_ZOOM ? weatherData?.sgg?.[r.code] : null;
    r.el.textContent=r.name+(Number.isFinite(wth?.t)?' '+Math.round(wth.t)+'°'+(wth.pty>0?' '+precipSymbol(wth.pty):''):'');
    r.el.hidden = true;
    if (!zoomed && r.kind !== "sido" && !selected) continue;
    const pt = map.latLngToContainerPoint(r.at);
    r.el.classList.toggle("selected", !!selected);
    r.el.hidden = false;
    const w = r.el.offsetWidth, h = r.el.offsetHeight;
    const box = {left:pt.x-w/2-2,right:pt.x+w/2+2,top:pt.y-h/2-1,bottom:pt.y+h/2+1};
    if (box.left < safe.left || box.right > safe.right || box.top < safe.top || box.bottom > safe.bottom || occupied.some(b => box.left < b.right && box.right > b.left && box.top < b.bottom && box.bottom > b.top)) { r.el.hidden=true; continue; }
    occupied.push(box);
    L.DomUtil.setPosition(r.el, map.latLngToLayerPoint(r.at).subtract([w/2,h/2]));
  }
}
function addRegionLabel(f, kind) {
  const p=f.properties;
  if (!Number.isFinite(p.lx) || !Number.isFinite(p.ly)) return;
  const el=document.createElement("span");
  el.className="region-label"; el.textContent=kind === "sido" ? p.short || p.name : p.name;
  el.hidden=true; el.setAttribute("aria-hidden","true");
  map.getPane("labels").append(el);
  regionLabels.push({el,kind,name:el.textContent,code:p.code,area:p.la || 0,at:[p.ly,p.lx]});
}
map.on("moveend zoomend resize", scheduleLabels);
document.fonts?.ready.then(scheduleLabels);
const moveToBounds = (bounds, options) => reducedMotion.matches ? map.fitBounds(bounds, { ...options, animate:false }) : map.flyToBounds(bounds, options);
let munis = [], muniByCode = new Map(), sidos = new Map(), neighborIdx = [], homeBounds = null;

const sheetTarget = () => parseFloat(panel.style.height) || panel.offsetHeight;
const leftPad = () => (window.innerWidth >= 760 ? [370, 70] : [10, Math.max(0, Math.min(document.querySelector('.controls').getBoundingClientRect().bottom + 8, innerHeight - sheetTarget() - 120))]);
const bottomPad = () => (window.innerWidth >= 760 ? [20, 20] : [10, sheetTarget() + (parseFloat(getComputedStyle(root).getPropertyValue('--kb')) || 0) + 10]);
function fitSelection() {
  const bounds = L.latLngBounds([]);
  selection.codes.forEach(code => bounds.extend(muniByCode.get(code).layer.getBounds()));
  map.fitBounds(bounds, { paddingTopLeft:leftPad(), paddingBottomRight:bottomPad(), maxZoom:11, animate:!reducedMotion.matches });
}
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
  sggGeo.features.forEach(f => addRegionLabel(f, "sgg"));
  sidoGeo.features.forEach(f => addRegionLabel(f, "sido"));
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
  scheduleLabels();
}
let atHome = true, selectionAutoFit = false;
// 사용자가 지도를 직접 끌거나 확대·축소하면 시트 높이 변화로 다시 맞추지 않는다
const userMovedMap = () => { atHome = false; selectionAutoFit = false; };
map.on('dragstart', userMovedMap);
map.getContainer().addEventListener('wheel', userMovedMap, {passive:true});
map.getContainer().addEventListener('dblclick', userMovedMap);
map.getContainer().addEventListener('touchstart', e => { if (e.touches.length > 1) userMovedMap(); }, {passive:true});
new ResizeObserver(() => {
  map.invalidateSize();
  if (atHome && homeBounds) fitHome();
}).observe(document.getElementById('map'));

const label = (m) => `${m.short} ${m.name}`;
// 관심 지역이면 별명과 실제 행정구역을 함께 보여 준다 (예: 집 · 서울 마포구)
const regionTitle = (m) => { const f = favorites.find(r => r.code === m.code); return f ? f.name + ' · ' + label(m) : label(m); };

map.on('zoomend', () => {
  const z = map.getZoom() >= MUNI_ZOOM;
  baseStyle.weight = z ? 1 : 0.6;
  baseStyle.color = token('border-sgg');
  munis.forEach((m) => { if (!m.flashing) restyle(m); });
});
let selection = null; // { center, codes:Set, fromLocation }
let category = null;
let meMarker = null;

const isSelected = (m) => !!selection && selection.codes.has(m.code);
function restyle(m) {
  if (!m.layer) return;
  const fuelFill = mode === 'explore' && exploreLayer === 'fuel' ? fuelColor(m.code) : mode === 'explore' && exploreLayer === 'weather' ? weatherColor(m.code) : null;
  const fill = fuelFill ? {fillColor:fuelFill,fillOpacity:root.dataset.theme==='dark'?.24:.72} : mode === 'news' && m.warning ? {fillColor:token(m.warning),fillOpacity:.18} : {fillColor:(mode === 'explore' && ['food','parking','pharmacy','er'].includes(exploreLayer) ? selection?.center === m : isSelected(m)) ? token('selection-fill') : baseStyle.fillColor,fillOpacity:1};
  if (selection && selection.center === m) m.layer.setStyle({ ...baseStyle, ...fill, color: token('brand'), weight: 2.5 });
  else if (isSelected(m)) m.layer.setStyle({ ...baseStyle, ...fill, color: token('brand'), weight: 1.3 });
  else m.layer.setStyle({...baseStyle,...fill});
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
  atHome = false; selectionAutoFit = true;
  const prev = selection;
  const codes = new Set([m.code, ...neighborIdx[m.i].map((j) => munis[j].code)]);
  selection = { center: m, codes, fromLocation };
  scheduleLabels();
  if (prev) prev.codes.forEach((c) => restyle(muniByCode.get(c)));
  codes.forEach((c) => restyle(muniByCode.get(c)));
  const bounds = L.latLngBounds([]);
  codes.forEach((c) => bounds.extend(muniByCode.get(c).layer.getBounds()));
  moveToBounds(bounds, { paddingTopLeft: leftPad(), paddingBottomRight: bottomPad(), duration: 0.8, maxZoom: 11 });
  renderFeed();
  renderFavorites();
}

function clearSelection() {
  const prev = selection;
  selection = null;
  scheduleLabels();
  if (prev) prev.codes.forEach((c) => restyle(muniByCode.get(c)));
  locateBtn.classList.remove('active');
  if (meMarker) { map.removeLayer(meMarker); meMarker = null; }
  renderFeed();
  renderFavorites();
}
function flash(m, signal) {
  m.flashing = true;
  m.signal = signal;
  m.flashStarted = performance.now();
  const el = m.layer.getElement();
  el.classList.add('flash');
  m.layer.setStyle({ fillColor: token(signal), fillOpacity: 0.85 });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.classList.remove('flash');
    restyle(m);
  }));
  clearTimeout(m.flashTimer);
  m.flashTimer = setTimeout(() => { m.flashing = false; restyle(m); }, 2400);
}

// 말풍선은 누를 수 있는 버튼: 누르면 그 소식 카드를 연다(지도는 이미 그 소식을 보여 주므로 움직이지 않는다).
// 지금 목록 범위에 있는 소식일 때만 누를 수 있고, 끌다가 놓은 것은 누름으로 보지 않는다.
const bubbleEl = document.createElement('button');
bubbleEl.type = 'button';
let bubbleItem = null, bubbleDown = null;
bubbleEl.className = 'map-bubble';
bubbleEl.hidden = true;
document.body.append(bubbleEl);
let bubbleAt = null, bubbleUntil = 0, bubbleTimer;
const replayEl = document.getElementById('replay-status');
function mapSafeArea() {
  const sheet = panel.getBoundingClientRect();
  const controls = document.querySelector('.controls').getBoundingClientRect();
  const header = document.querySelector('.topbar').getBoundingClientRect();
  const desktop = matchMedia('(min-width:760px)').matches;
  const left = desktop ? sheet.right + 16 : 12;
  const right = desktop ? controls.left - 12 : innerWidth - 12;
  const legendEl = document.getElementById('map-legend');
  const legend = (legendEl.open ? legendEl.querySelector('.legend-content') : legendEl).getBoundingClientRect();
  const top = Math.max(header.bottom, controls.bottom, legend.bottom) + 8;
  const bottom = desktop ? innerHeight - 28 : sheet.top - 12;
  return {left,right,top,bottom};
}
function placeMapOverlays() {
  const {left,right,top,bottom} = mapSafeArea();
  const width = Math.max(0, right - left);
  replayEl.style.left = left + 'px';
  replayEl.style.top = top + 'px';
  replayEl.style.maxWidth = width + 'px';
  replayEl.style.visibility = bottom - top >= replayEl.getBoundingClientRect().height ? 'visible' : 'hidden';
  const minY = top + (replayEl.hidden ? 0 : replayEl.getBoundingClientRect().height + 8);
  bubbleEl.style.maxWidth = Math.min(innerWidth * .72, width) + 'px';
  if (!bubbleAt || bubbleEl.hidden) return;
  const box = bubbleEl.getBoundingClientRect();
  const point = map.latLngToContainerPoint(bubbleAt);
  const inView = point.x >= left && point.x <= right && point.y >= minY && point.y <= bottom;
  bubbleEl.style.visibility = inView && width >= 80 && bottom - minY >= box.height ? 'visible' : 'hidden';
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
  if(item.src==='eqk') bubbleEl.innerHTML+='<span class="bubble-quake-detail">'+escapeHtml(item.body?.split(' · ')[0] || '진도 미제공')+' · '+escapeHtml(new Date(item.time).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))+'</span>';
  bubbleItem = item;
  const openable = mode === 'news' && visible(item);
  bubbleEl.classList.toggle('openable', openable);
  bubbleEl.disabled = !openable; // 목록 범위 밖 소식은 누를 수 없다(사건 하나를 임의로 고르지 않게)
  bubbleEl.setAttribute('aria-label', (openable ? '이 소식 카드 열기: ' : '') + placeLabel(item) + ' · ' + item.title);
  bubbleEl.hidden = false;
  placeMapOverlays();
  bubbleHideLater(item.urgency === 'critical' ? 4000 : 2800);
}
const bubbleHideLater = (ms) => { clearTimeout(bubbleTimer); bubbleTimer = setTimeout(() => { bubbleEl.hidden = true; bubbleAt = null; bubbleUntil = 0; bubbleItem = null; }, ms); };
// 누르거나 포커스하는 동안에는 사라지지 않게
['pointerenter', 'focus'].forEach((t) => bubbleEl.addEventListener(t, () => clearTimeout(bubbleTimer)));
['pointerleave', 'blur'].forEach((t) => bubbleEl.addEventListener(t, () => { if (!bubbleEl.hidden) bubbleHideLater(2000); }));
bubbleEl.addEventListener('pointerdown', (e) => { bubbleDown = { x: e.clientX, y: e.clientY }; });
bubbleEl.addEventListener('click', (e) => {
  const moved = bubbleDown && e.detail !== 0 && Math.hypot(e.clientX - bubbleDown.x, e.clientY - bubbleDown.y) > 10;
  bubbleDown = null;
  const item = bubbleItem;
  if (moved || !item || mode !== 'news' || !visible(item)) return;
  pending.delete(item.id);
  openId = item.id; atHome = false; selectionAutoFit = false; // 지도와 열린 카드가 같은 소식을 가리키게
  bubbleEl.hidden = true; bubbleAt = null; bubbleUntil = 0; bubbleItem = null;
  if (mobileSheet.matches && sheetStage === 0) setSheetStage(1);
  renderFeed(null, true);
  const li = feedEl.querySelector('[data-id="' + CSS.escape(item.id) + '"]');
  li?.scrollIntoView({ block: 'nearest', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
  li?.querySelector('.card-toggle')?.focus({ preventScroll: true });
});
const overlayObserver = new ResizeObserver(() => { placeMapOverlays(); scheduleLabels(); });
document.getElementById("map-legend").addEventListener("toggle", () => { placeMapOverlays(); scheduleLabels(); });
[panel, document.querySelector('.topbar'), document.querySelector('.controls')].forEach(el => overlayObserver.observe(el));
new MutationObserver(() => { placeMapOverlays(); scheduleLabels(); }).observe(replayEl, { attributes:true, attributeFilter:['hidden'] });
map.on('move zoom resize', placeMapOverlays);
window.addEventListener('resize', placeMapOverlays);
const onMap = (item) => item.onMap !== false && item.src !== 'brief';
const hasPoint = (item) => Number.isFinite(item.lat) && Number.isFinite(item.lon);

function pulse(item, withBubble) {
  if (mode !== 'news' || !onMap(item)) return;
  const signal = signalName(item);
  const targets = itemMunis(item);
  const point = hasPoint(item) ? L.latLng(item.lat, item.lon) : null; // 지진 진앙처럼 좌표가 온 소식
  if (!targets.length && !point) return;
  targets.forEach((m) => flash(m, signal));
  const at = point || (item.sgg?.length ? muniByCode.get(item.sgg[0])?.center : sidos.get(item.sido?.[0])?.center);
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
  if(item.src!=='eqk') (item.sido || []).forEach((c) => sidos.get(c)?.munis.forEach((m) => out.add(m)));
  return [...out];
}

// 선택한 중심 지역과 이 소식의 관계. 데이터에 적힌 시·군·구/시·도만 근거로 하고 새 관계를 만들지 않는다.
//  centerPlus: 중심 구 + 다른 곳 · centerWide: 중심 구를 포함한 시·도 전체 · neighbor: 맞닿은 시·군·구만 · neighborWide: 맞닿은 지역의 시·도 전체만
//  중심 구만 지정된 소식·전국 모드·목록 전용(정책)·해역 지진('가까운 해역')에는 붙이지 않는다.
function selectionRelation(item) {
  if (!selection || !onMap(item)) return null;
  const c = selection.center.code;
  const sgg = item.sgg || [], sido = item.src === 'eqk' ? [] : item.sido || [];
  if (sgg.includes(c)) return sgg.length > 1 || sido.length ? 'centerPlus' : null;
  if (sido.includes(selection.center.sido)) return 'centerWide';
  if (sgg.some((x) => selection.codes.has(x))) return 'neighbor';
  if (itemMunis(item).some((m) => selection.codes.has(m.code))) return 'neighborWide';
  return null;
}
const RELATION_TEXT = { centerPlus: '선택 지역 포함', centerWide: '시·도 전체 · 선택 지역 포함', neighbor: '인접 지역', neighborWide: '인접 시·도 전체' };
const relationHtml = (it) => { const t = RELATION_TEXT[selectionRelation(it)]; return t ? '<span class="relation-label">' + t + '</span>' : ''; };
function placeLabel(item) {
  const sgg = (item.sgg || []).map((c) => muniByCode.get(c)).filter(Boolean);
  const sido = (item.src==='eqk' ? [] : item.sido || []).map((c) => sidos.get(c)).filter(Boolean);
  const names = [...sido.map((s) => `${s.short} 전체`), ...sgg.map(label)];
  if (!names.length) return item.src==='eqk' ? (nearbySea(item)?'가까운 해역':'해역') : hasPoint(item)?'진앙 위치':'전국'; // 바다 지진: 시·군·구 없이 점만
  const text = names.length > 2 ? `${names[0]} 외 ${names.length - 1}곳` : names.join(', ');
  return onMap(item) ? text : `관련: ${text}`;
}
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
    if (!Array.isArray(data.items)) throw new Error('invalid data');
  } catch (e) {
    loadFailed = true;
    updateDecorations();
    renderFeed(null, true);
    if (firstLoad) {
      if (mode === 'news') subEl.textContent = '소식을 불러오지 못했어요. 잠시 후 다시 시도할게요.';
      firstLoad = false;
    }
    return;
  }
  loadFailed = false;
  lastChecked = new Date();
  sources = data.sources || {};
  const incoming = (data.items || [])
    .filter((it) => it.id && it.title && it.time)
    .sort((a, b) => new Date(b.time) - new Date(a.time));
  const fresh = incoming.filter((it) => !seen.has(it.id));
  incoming.forEach((it) => seen.add(it.id));
  items = incoming;
  updateDecorations();
  updatedAt = data.updated ? new Date(data.updated) : null;
  syncCategories();
  munis.forEach(m => { m.warning = null; });
  const severity = {'signal-critical':3,'signal-urgent':2,'brand':1,'signal-unknown':0};
  items.filter(it => it.src === 'wrn' && onMap(it)).forEach(it => itemMunis(it).forEach(m => {
    const signal = signalName(it);
    if (!m.warning || severity[signal] > severity[m.warning]) m.warning = signal;
  }));
  munis.forEach(m => { if (!m.flashing) restyle(m); });

  if (firstLoad) {
    firstLoad = false;
    renderFeed();
    const cutoff = Date.now() - REPLAY_WINDOW_MIN * 60000;
    const replay = incoming.filter((it) => onMap(it) && new Date(it.time) >= cutoff).slice(0, 20).reverse();
    const priority = it => ({critical:0,urgent:1}[it.urgency] ?? 2);
    replay.sort((a,b) => priority(a) - priority(b));
    const replayStatus = document.getElementById('replay-status');
    replayStatus.hidden = mode !== 'news' || !replay.length;
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

function nearbySea(it) {
  if(!selection || it.src!=='eqk' || it.sgg?.length || !hasPoint(it)) return false;
  return !!sidos.get(selection.center.sido)?.munis.some(m=>map.distance(m.center,[it.lat,it.lon])<=100000);
}
const earthquakeMarkers=L.layerGroup().addTo(map);
function renderEarthquakes() {
  earthquakeMarkers.clearLayers(); if(mode!=='news') return;
  items.filter(it=>it.src==='eqk' && hasPoint(it) && visible(it)).forEach(it=>{
    const size=14+Math.max(0,Math.min(6,(it.mag||0)-2));
    const marker=L.marker([it.lat,it.lon],{pane:'pulses',title:it.title,icon:L.divIcon({className:'earthquake-marker',iconSize:[size,size],iconAnchor:[size/2,size/2],html:'<span class="earthquake-pin'+(Date.now()-new Date(it.time)>86400000?' faded':'')+'" style="--eq-size:'+size+'px"><i></i>'+(it.mag!=null&&it.mag!==''&&Number.isFinite(Number(it.mag))?'<b>M'+escapeHtml(Number(it.mag).toFixed(1))+'</b>':'')+'</span>'})}).addTo(earthquakeMarkers);
    marker.on('click',()=>{pending.delete(it.id);openId=it.id;atHome=false;selectionAutoFit=false;bubbleUntil=0;renderFeed(null,true);feedEl.querySelector('[data-id="'+it.id+'"]')?.scrollIntoView({block:'nearest'});showMapBubble(it,L.latLng(it.lat,it.lon));});
  });
}
setInterval(()=>{if(mode==='news') renderFeed(null,true);},60000);
function visible(item) {
  if(item.src==='eqk' && (!validDate(new Date(item.time)) || Date.now()-new Date(item.time)>72*3600000)) return false;
  if(selection && item.src==='eqk') return (!category || category===item.cat) && (item.sgg?.includes(selection.center.code) || nearbySea(item));
  if (category && item.cat !== category) return false;
  if (selection && !onMap(item)) return false;
  if (selection && !itemMunis(item).some((m) => selection.codes.has(m.code))) return false;
  return true;
}

let sources = {}, loadFailed = false, lastChecked = null;
// 장식만 중단한다. 공식 소식·경고 신호·지도 조작은 유지한다.
// 수집 목록에서 해당 안내가 빠질 때까지 보수적으로 숨긴다(사고 종료를 추정하지 않음).
function decorationsPaused(codes = []) {
  if (DEMO) return false; // 명시된 가상 자료 미리보기이며 실제 상황 판단에 사용하지 않는다.
  // 조회 실패는 기존 자료 상태 안내로 알린다. 오류 자체를 위급 상황으로 해석하지 않는다.
  return items.some(it => {
    if (!['sms','wrn','eqk'].includes(it.src)) return false;
    const nationwide = sidos.size > 0 && [...sidos.values()].every(s => it.sido?.includes(s.code) || s.munis.every(m => it.sgg?.includes(m.code)));
    if (it.urgency === 'critical' && nationwide) return true;
    const related = codes.some(code => it.sgg?.includes(code) || it.sido?.includes(muniByCode.get(code)?.sido));
    return related && (
      ['critical','urgent'].includes(it.urgency) ||
      (it.src === 'wrn' && ['주의보','경보'].includes(it.level)) ||
      (it.src === 'sms' && ['화재','산불','붕괴','폭발','지진','해일','대설','호우','태풍','홍수','산사태','교통사고'].includes(it.kind))
    );
  });
}
function updateDecorations() {
  updateBukangi();
  updateRainScene();
  if (decorationsPaused()) document.querySelectorAll('.festival-confetti').forEach(el => el.remove());
}
const pending = new Set();
const newButton = document.getElementById('new-items');
newButton.addEventListener('click', () => { pending.clear(); renderFeed(); feedEl.scrollTop = 0; });
function updateTimes() {
  if (mode === 'explore') { updateExploreStatus(); return; }
  feedEl.querySelectorAll('time').forEach(el => { el.textContent = (el.dataset.prefix || '') + ago(new Date(el.dateTime)); });
  const status = document.getElementById('collection-status');
  const keys = newsSourceKeys(), states = keys.map(sourceState);
  const failedNames = keys.filter((k,i) => states[i].rank === 2).map(k => SOURCE_NAMES[k]);
  const failed = loadFailed || failedNames.length > 0;
  const stale = states.some(s => s.rank === 1) || !validDate(updatedAt) || Date.now()-updatedAt >= 1800000;
  status.classList.toggle('failed', failed);
  status.classList.toggle('stale', !failed && stale);
  const statusText = loadFailed ? (lastChecked ? '앱이 마지막으로 받은 시각 ' + lastChecked.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Seoul'}) + ' · ' : '') + '새로 고치지 못했어요' : (failed ? '출처 오류' : stale ? '갱신 지연' : '정상') + ' · ' + (validDate(updatedAt) ? ago(updatedAt) : '시각 미제공');
  status.textContent = validDate(updatedAt) ? ago(updatedAt) : '시각 미제공';
  status.setAttribute('aria-label', statusText + '. 출처별 수집 상태 보기');
  const alert = document.getElementById('collection-alert');
  alert.hidden = !failed && !stale;
  const hhmm = d => d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Seoul'});
  setAlert(failed ? 'failed' : 'stale',
    // 보여 주는 자료의 시각은 수집 파일 생성 시각(updatedAt). 앱이 마지막으로 받은 시각(lastChecked)은 상세에만.
    loadFailed ? (navigator.onLine === false ? '인터넷에 연결되지 않았어요' : '소식을 새로 고치지 못했어요') + (items.length && validDate(updatedAt) ? ' · ' + hhmm(updatedAt) + ' 수집 자료를 보여 줘요' : '')
    : failed ? (failedNames.length === keys.length ? '모든 출처의 소식을 불러오지 못했어요' : failedNames.join('·') + ' 소식을 불러오지 못했어요 · 다른 출처는 그대로 보여요')
    : '일부 자료의 갱신이 늦어지고 있어요' + (validDate(updatedAt) ? ' · ' + ago(updatedAt) + ' 수집' : ''),
    loadFailed ? '다시 시도' : '자세히', loadFailed ? 'news' : '');
  document.getElementById('sources-detail').innerHTML = sourceStatus() + '<p>' + escapeHtml(statusText) + '</p>';
}
const validDate = d => d instanceof Date && Number.isFinite(d.getTime());
const SOURCE_NAMES = {sms:'긴급재난문자',wrn:'기상특보',eqk:'지진정보',brief:'정책브리핑'};
// 지진정보는 수집 파일에 상태가 있을 때만 판단에 넣는다 (예전 파일에는 없음)
const newsSourceKeys = () => ['sms','wrn','eqk','brief'].filter(k => k !== 'eqk' || sources.eqk);
const ALERT_ICONS = {stale:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>', failed:'<path d="M12 4 2.5 20h19L12 4Z"/><path d="M12 10v4m0 3v.5"/>'};
function setAlert(kind, text, action, retry = '') {
  const alert = document.getElementById('collection-alert');
  alert.dataset.retry = retry;
  alert.classList.toggle('failed', kind === 'failed');
  alert.innerHTML = '<svg class="category-icon" viewBox="0 0 24 24" aria-hidden="true">' + ALERT_ICONS[kind] + '</svg><span>' + escapeHtml(text) + '</span><span class="alert-action">' + escapeHtml(action) + '</span>';
}
document.getElementById('collection-alert').addEventListener('click', () => {
  const retry = document.getElementById('collection-alert').dataset.retry;
  if (retry === 'news') { load(); return; }
  if (retry === 'explore') { loadExploreData([...exploreFailed]); return; }
  updateTimes(); document.getElementById('sources-dialog').showModal();
});
function sourceState(key) {
  const v = sources[key], at = new Date(v?.at);
  if (v?.ok === false) return {rank:2,text:'오류 · 마지막 성공 시각은 확인할 수 없어요'};
  if (v?.ok !== true || !validDate(at)) return {rank:1,text:'지연 · 마지막 성공 시각 미제공'};
  return {rank:Date.now()-at >= 1800000 ? 1 : 0,text:(Date.now()-at >= 1800000 ? '지연' : '정상') + ' · 마지막 성공 ' + ago(at)};
}
function sourceStatus() {
  const names = SOURCE_NAMES;
  return ['sms','wrn','eqk','brief'].map(key => {
    const v = sources[key];
    return '<p class="source-status"><strong>' + names[key] + '</strong><br>' + sourceState(key).text + (v?.at ? '<br>확인 시각: ' + escapeHtml(v.at) : '') + (v?.note ? '<br>' + escapeHtml(v.note) : '') + '</p>';
  }).join('');
}
function card(it) {
  const open = it.id === openId;
  return '<button type="button" class="card-toggle" aria-expanded="' + open + '"><span class="meta">' + urgencyBadge(it) + '<span class="category-label">' + icon(it.cat) + escapeHtml(it.cat) + '</span>' + relationHtml(it) + '<span class="place-label">' + escapeHtml(placeLabel(it)) + '</span><time datetime="' + escapeHtml(it.time) + '"' + (it.timeBasis === 'collected' ? ' data-prefix="확인 "' : '') + '>' + (it.timeBasis === 'collected' ? '확인 ' : '') + ago(new Date(it.time)) + '</time></span><span class="title">' + escapeHtml(it.title) + '</span></button>' + (open ? detail(it) : '');
}
function renderFeed(newIds, preserve = false) {
  if (mode === 'explore') { renderExplore(); return; }
  renderEarthquakes();
  if (!preserve) pending.clear();
  titleEl.textContent = selection ? regionTitle(selection.center) + ' 주변' : '전국 소식';
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
  const opened = items.find(it => it.id === openId && visible(it) && !pending.has(it.id));
  if (opened && (category || opened.cat !== '정책') && !list.includes(opened)) list.push(opened);
  const existing = new Map([...feedEl.querySelectorAll('li[data-id]')].map(el => [el.dataset.id,el]));
  const desired = [];
  for (const it of list) {
    let li = existing.get(it.id);
    if (!li) { li = document.createElement('li'); li.dataset.id = it.id; }
    const signature = JSON.stringify(it) + (it.id === openId) + placeLabel(it) + selectionRelation(it);
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
    const failedNames = newsSourceKeys().filter(k => sourceState(k).rank === 2).map(k => SOURCE_NAMES[k]);
    if (loadFailed && !items.length) {
      li.innerHTML = '<p>' + (navigator.onLine === false ? '인터넷에 연결되지 않았어요' : '소식을 불러오지 못했어요') + '</p><p class="empty-note">연결을 확인하고 다시 시도해 주세요.</p><div class="empty-actions"><button type="button" data-retry>다시 시도</button></div>';
    } else {
      li.innerHTML = '<p>' + (category ? escapeHtml(category) + ' 분류에 수집된 소식이 없어요' : selection ? '선택한 지역에 수집된 소식이 없어요' : '지금 수집된 소식이 없어요') + '</p>'
        + '<p class="empty-note">최근 72시간 · 포함 지역 ' + (selection ? selection.codes.size : munis.length) + '곳 기준이에요. 안전하다는 뜻은 아니에요.</p>'
        + (failedNames.length ? '<p class="empty-note">' + escapeHtml(failedNames.join('·')) + ' 소식을 불러오지 못해 빠진 소식이 있을 수 있어요.</p>' : '')
        + ((category || selection) ? '<div class="empty-actions">' + (category ? '<button type="button" data-all-cats>전체 분류 보기</button>' : '') + (selection ? '<button type="button" data-home-empty>전국 소식 보기</button>' : '') + '</div>' : '');
    }
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
  fitSheet();
}
// 출처별 item.time의 뜻(수집기 기준): 재난문자 생성·발송, 특보 발표, 지진 발생, 정책 승인·게시. 수집 시각은 여기 붙이지 않는다.
const TIME_KIND = { sms: '발송', wrn: '발표', eqk: '발생', brief: '게시' };
// 링크 이름 = 실제 목적지. 특보·지진 링크는 개별 원문이 아니라 기상청 현황·목록 페이지다.
const LINK_NAME = { wrn: '기상청 특보 현황 ↗', eqk: '기상청 지진 목록 ↗' };
const kstFull = (d) => d.toLocaleString('ko-KR', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false, timeZone:'Asia/Seoul' });
// 특보: 발표 시각이 확인된 것만 '발표'. 없으면 수집 확인 시각임을 밝히고, timeBasis가 없는 예전 자료는 '자료 시각'으로만 부른다
function timeLine(it, when) {
  const at = escapeHtml(kstFull(when)) + ' (한국 시간)';
  if (it.src === 'wrn' && it.timeBasis === 'collected') return '발표 시각 미제공 · 수집 확인 ' + at;
  if (it.src === 'wrn' && it.timeBasis !== 'issued') return '자료 시각 ' + at;
  return TIME_KIND[it.src] + ' ' + at;
}
function detail(it) {
  const when = new Date(it.time);
  return '<div class="detail">' + (TIME_KIND[it.src] && validDate(when) ? '<p class="detail-time">' + timeLine(it, when) + '</p>' : '') + (it.body ? '<p>' + escapeHtml(it.body) + '</p>' : '') + '<div class="src"><span>출처: ' + escapeHtml(it.source || '미제공') + (it.license ? ' · ' + escapeHtml(it.license) : '') + '</span><span>표시 근거: ' + escapeHtml(it.urgencyBasis || '구분 미제공') + (it.src==='eqk'?'</span><span>기상청 지진정보 · 진앙 위치는 발표 좌표':'') + '</span>' + (it.url && /^https?:\/\//i.test(it.url) ? '<a href="' + escapeAttr(it.url) + '" target="_blank" rel="noopener noreferrer">' + (LINK_NAME[it.src] || '원문 보기 ↗') + '</a>' : '') + '</div></div>';
}

feedEl.addEventListener('click', (e) => {
  if (e.target.closest('a')) return;
  if (e.target.closest('.policy-group')) { chipsEl.querySelector('[data-cat="정책"]').click(); return; }
  if (e.target.closest('[data-retry]')) { load(); return; }
  if (e.target.closest('[data-all-cats]')) { chipsEl.querySelector('[data-cat=""]')?.click(); return; }
  if (e.target.closest('[data-home-empty]')) { clearSelection(); atHome = true; fitHome(); return; }
  if (!e.target.closest('.card-toggle')) return;
  const li = e.target.closest('li[data-id]');
  if (!li) return;
  const item = items.find((x) => x.id === li.dataset.id);
  if (!item) return;
  const opening = openId !== item.id;
  openId = opening ? item.id : null;
  renderFeed(null, true);
  if (!opening) return; // 닫을 때는 지도를 그대로 둔다
  // 연 소식으로 지도를 옮겼으니, 이후 목록 갱신·시트 높이 변화로 선택 지역/전국에 다시 맞추지 않는다(지도와 열린 카드가 어긋나지 않게)
  atHome = false; selectionAutoFit = false;
  const targets = onMap(item) ? itemMunis(item) : [];
  if (targets.length) {
    const b = L.latLngBounds([]);
    targets.forEach((m) => b.extend(m.layer.getBounds()));
    moveToBounds(b, { paddingTopLeft: leftPad(), paddingBottomRight: bottomPad(), duration: 0.8, maxZoom: 10.5 });
    setTimeout(() => pulse(item, true), 700);
  } else if (onMap(item) && hasPoint(item)) {
    // 바다 지진처럼 점만 있는 소식: 진앙 둘레로 이동
    moveToBounds(L.latLng(item.lat, item.lon).toBounds(60000), { paddingTopLeft: leftPad(), paddingBottomRight: bottomPad(), duration: 0.8, maxZoom: 8 });
    setTimeout(() => pulse(item, true), 700);
  }
});

function syncCategories() {
  if (mode === 'explore') { chipsEl.dataset.cats = ''; chipsEl.innerHTML = availableLayers().map(([key,name]) => '<button type="button" data-layer="' + key + '" aria-pressed="' + (exploreLayer === key) + '">' + name + '</button>').join(''); return; }
  const available = CATEGORIES.filter(c => items.some(it => it.cat === c));
  if (category && !available.includes(category)) category = null;
  const cats = [null,...available];
  if (chipsEl.dataset.cats === cats.join('|')) return;
  chipsEl.dataset.cats = cats.join('|');
  chipsEl.innerHTML = cats.map(c => `<button type="button" data-cat="${c || ''}" aria-pressed="${c === category}">${c ? icon(c) : ''}${c || '전체'}</button>`).join('');
}
chipsEl.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (mode === 'explore') { if (b.dataset.layer) { exploreLayer=b.dataset.layer; try { localStorage.setItem('nallae-explore-layer',exploreLayer); } catch (_) {} map.closePopup(); feedEl.scrollTop=0; renderExplore(); fitSheet(); } return; }
  category = b.dataset.cat || null;
  chipsEl.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  renderFeed();
});
const favoriteKey = 'nallae-favorites-v1';
let favorites = [], startCode = null, chosenCode = null;
const favoritesEl = document.getElementById('favorites');
const favoriteDialog = document.getElementById('favorites-dialog');
const nameInput = document.getElementById('favorite-name');
const searchInput = document.getElementById('region-search');
document.querySelectorAll('dialog [data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
document.getElementById('collection-status').addEventListener('click', () => {
  updateTimes(); document.getElementById('sources-dialog').showModal();
});
function saveFavorites() {
  try {
    localStorage.setItem(favoriteKey, JSON.stringify({version:1,regions:favorites,startCode}));
    document.getElementById('storage-note').textContent = '이 기기에만 저장했어요. 최대 5곳까지 추가할 수 있어요.';
  } catch (_) {
    document.getElementById('storage-note').textContent = '기기에 저장하지 못했어요. 이번에 앱을 보는 동안만 유지돼요.';
    toast('기기에 저장하지 못했어요. 이번에 앱을 보는 동안만 유지돼요.');
  }
  renderFavorites(); renderSavedRegions();
  if (selection) renderFeed(null, true); // 선택 중인 지역의 별명이 바뀌거나 지워지면 제목('집 · 서울 마포구')도 바로 바꾼다
}
function initFavorites() {
  try {
    const data = JSON.parse(localStorage.getItem(favoriteKey));
    const used = new Set();
    if (data?.version === 1 && Array.isArray(data.regions)) {
      favorites = data.regions.filter(r => {
        if (!r || !muniByCode.has(r.code) || typeof r.name !== 'string' || !r.name.trim() || used.has(r.code)) return false;
        used.add(r.code); return true;
      }).slice(0,5).map(r => ({code:r.code,name:r.name.trim().slice(0,20)}));
      startCode = favorites.some(r => r.code === data.startCode) ? data.startCode : null;
    }
  } catch (_) {}
  renderFavorites();
  if (startCode) select(muniByCode.get(startCode), false);
}
const favoriteShapes = {
  home:'M3 11 12 3l9 8M5 10v11h5v-7h4v7h5V10',
  work:'M4 7h16v14H4ZM9 7V3h6v4M4 12h16M10 12v3h4v-3',
  family:'M12 21S3 15 3 9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6-9 12-9 12Z',
  place:'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0ZM9 10h6m-3-3v6',
  pin:'M9 3h6l-1 6 4 5H6l4-5-1-6ZM12 14v7',
  edit:'m4 16 12-12 4 4L8 20H4v-4ZM14 6l4 4',
  plus:'M12 5v14M5 12h14', more:'M5 12h1m5 0h1m5 0h1',
  globe:'M3 12h18M12 3c-6 6-6 12 0 18 6-6 6-12 0-18ZM3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0'
};
const favoriteIcon = key => '<svg class="category-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="' + favoriteShapes[key] + '"/></svg>';
const favoriteType = name => ({'집':'home','직장':'work','부모님 동네':'family'}[name] || 'place');
let editingCode = null;
function favoriteStep(step) {
  document.getElementById('favorite-list').hidden = step !== 'list';
  document.getElementById('favorite-form').hidden = step === 'list';
  document.getElementById('favorite-search-step').hidden = step !== 'search';
  document.getElementById('favorite-name-step').hidden = step !== 'name';
  document.getElementById('favorites-title').textContent = step === 'list' ? '관심 지역' : editingCode ? '이름 바꾸기' : '관심 지역 추가';
}
function nameStep(name = '집') {
  nameInput.value = name;
  setName(name);
  favoriteStep('name');
  document.querySelector('#favorite-presets button').focus();
}
function setName(name) {
  const presets = ['집','직장','부모님 동네'];
  const custom = !presets.includes(name);
  nameInput.hidden = !custom;
  nameInput.previousElementSibling.hidden = !custom;
  document.getElementById('favorite-presets').innerHTML = [...presets,'직접 입력'].map(n => '<button type="button" data-name="' + n + '" aria-pressed="' + (n === name || n === '직접 입력' && custom) + '">' + favoriteIcon(favoriteType(n)) + n + '</button>').join('');
}
document.getElementById('favorite-presets').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const name = b.dataset.name === '직접 입력' ? '' : b.dataset.name;
  nameInput.value = name; setName(name);
  (nameInput.hidden ? document.querySelector('[data-name="' + b.dataset.name + '"]') : nameInput).focus();
});
function beginAdd(code = null) {
  if (favorites.length >= 5) return toast('관심 지역은 최대 5곳까지 저장할 수 있어요.');
  editingCode = null; searchInput.value = ''; document.getElementById('region-results').replaceChildren();
  chooseFavorite(code);
  if (code) nameStep(); else { favoriteStep('search'); searchInput.focus(); }
}
document.getElementById('favorite-add').addEventListener('click', () => beginAdd());
document.getElementById('favorite-back').addEventListener('click', () => {
  if (editingCode || !document.getElementById('favorite-search-step').hidden) { favoriteStep('list'); document.getElementById('favorite-add').focus(); }
  else { favoriteStep('search'); searchInput.focus(); }
});
function renderFavorites() {
  favoritesEl.innerHTML = '<button type="button" data-home aria-pressed="' + !selection + '">' + favoriteIcon('globe') + '전국</button>' + favorites.map(r => '<button type="button" data-code="' + r.code + '" aria-pressed="' + (selection?.center.code === r.code) + '" aria-label="' + escapeHtml(r.name + (startCode === r.code ? ', 시작 지역' : '')) + '">' + favoriteIcon(favoriteType(r.name)) + escapeHtml(r.name) + (startCode === r.code ? favoriteIcon('pin') : '') + '</button>').join('') + '<button type="button" data-new aria-label="관심 지역 추가">' + favoriteIcon('plus') + '</button><button type="button" data-manage aria-label="관심 지역 관리">' + favoriteIcon('edit') + '</button>' + (selection && !favorites.some(r => r.code === selection.center.code) ? '<button type="button" data-add>' + favoriteIcon('plus') + '저장</button>' : '');
}
function chooseFavorite(code) {
  chosenCode = code;
  document.getElementById('favorite-choice').textContent = code ? label(muniByCode.get(code)) : '저장할 지역을 골라 주세요.';
  document.getElementById('favorite-save').disabled = !code || !editingCode && (favorites.length >= 5 || favorites.some(r => r.code === code));
}
favoritesEl.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.hasAttribute('data-home')) { clearSelection(); atHome = true; fitHome(); }
  else if (b.dataset.code) select(muniByCode.get(b.dataset.code), false);
  else {
    renderSavedRegions(); favoriteStep('list'); favoriteDialog.showModal();
    if (!b.hasAttribute('data-manage')) beginAdd(b.hasAttribute('data-add') ? selection?.center.code : null);
  }
});
function renderSavedRegions() {
  document.getElementById('saved-regions').innerHTML = favorites.map((r,i) => '<section class="saved-region" data-code="' + r.code + '"><div class="saved-main">' + favoriteIcon(favoriteType(r.name)) + '<div><strong>' + escapeHtml(r.name) + '</strong><small>' + escapeHtml(label(muniByCode.get(r.code))) + '</small></div><button type="button" data-action="start" aria-label="' + escapeHtml(r.name) + ' 시작 지역" aria-pressed="' + (startCode === r.code) + '">' + favoriteIcon('pin') + '시작</button><button type="button" data-action="menu" aria-expanded="false" aria-label="' + escapeHtml(r.name) + ' 더보기">' + favoriteIcon('more') + '</button></div><div class="saved-actions" hidden><button type="button" data-action="rename">이름 바꾸기</button><button type="button" data-action="up" ' + (i === 0 ? 'disabled' : '') + '>위로</button><button type="button" data-action="down" ' + (i === favorites.length-1 ? 'disabled' : '') + '>아래로</button><button type="button" data-action="delete">삭제</button></div></section>').join('') || '<p>아직 저장한 동네가 없어요.</p>';
  document.getElementById('favorite-add').disabled = favorites.length >= 5;
}
document.getElementById('saved-regions').addEventListener('click', e => {
  const b = e.target.closest('button'), row = b?.closest('[data-code]'); if (!row) return;
  const i = favorites.findIndex(r => r.code === row.dataset.code), r = favorites[i], action = b.dataset.action;
  if (action === 'menu') {
    const menu = row.querySelector('.saved-actions'); menu.hidden = !menu.hidden; b.setAttribute('aria-expanded', !menu.hidden); return;
  }
  if (action === 'rename') { editingCode = r.code; chooseFavorite(r.code); nameStep(r.name); return; }
  if (action === 'start') startCode = startCode === r.code ? null : r.code;
  else if (action === 'delete') { favorites.splice(i,1); if (startCode === r.code) startCode = null; }
  else {
    const j = i + (action === 'up' ? -1 : 1);
    if (j < 0 || j >= favorites.length) return;
    [favorites[i],favorites[j]] = [favorites[j],favorites[i]];
  }
  saveFavorites();
  const nextRow = [...document.querySelectorAll('#saved-regions section')].find(el => el.dataset.code === r.code);
  (nextRow?.querySelector('[data-action="' + (action === 'start' ? 'start' : 'menu') + '"]') || document.getElementById('favorite-add')).focus();
});
searchInput.addEventListener('input', () => {
  chooseFavorite(null);
  const q = searchInput.value.trim().replace(/\s+/g,'');
  const matches = q ? munis.filter(m => (m.sidoName + m.name).replace(/\s+/g,'').includes(q) || label(m).replace(/\s+/g,'').includes(q)) : [];
  const results = document.getElementById('region-results');
  results.innerHTML = matches.map(m => '<button type="button" data-code="' + m.code + '">' + escapeHtml(label(m)) + '</button>').join('');
  if (q && !matches.length) results.textContent = '일치하는 지역이 없어요. 시·군·구 이름을 확인해 주세요.';
});
document.getElementById('region-results').addEventListener('click', e => {
  const b = e.target.closest('button'); if (b) { chooseFavorite(b.dataset.code); if (!document.getElementById('favorite-save').disabled) nameStep(); else toast('이미 저장한 지역이에요.'); }
});
document.getElementById('favorite-form').addEventListener('submit', e => {
  e.preventDefault();
  const name = nameInput.value.trim();
  if (!name || !muniByCode.has(chosenCode)) return toast('이름과 지역을 골라 주세요.');
  if (editingCode) {
    favorites.find(r => r.code === editingCode).name = name.slice(0,20);
    editingCode = null; saveFavorites(); favoriteStep('list'); document.getElementById('favorite-add').focus(); return;
  }
  if (favorites.length >= 5) return toast('관심 지역은 최대 5곳까지 저장할 수 있어요.');
  if (favorites.some(r => r.code === chosenCode)) return toast('이미 저장한 지역이에요.');
  favorites.push({code:chosenCode,name:name.slice(0,20)});
  saveFavorites(); chooseFavorite(null); favoriteStep('list');
  document.querySelector('#favorites-dialog [data-close]').focus();
});
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
const mobileSheet = matchMedia('(max-width:759px)');
const handle = document.getElementById('panel-handle');
const sheetHead = panel.querySelector('.panel-head');
const favoritesRow = document.querySelector('.filter-row');
const stages = ['collapsed', 'middle', 'full'], stageNames = ['접힘', '중간', '전체'];
let sheetStage = 1, sheetDrag = null, suppressSheetClick = false, sheetFitTimer;
try {
  const saved = stages.indexOf(localStorage.getItem('nallae-sheet-stage'));
  if (saved >= 0) sheetStage = saved;
} catch (_) {}
const TWO_CARDS = 172, MAP_MIN = 140; // 두 줄 제목 소식 2건, 중간 시트에서 남길 지도 최소 높이
// 화면 키보드처럼 visualViewport만 줄어드는 경우(Android Chrome 기본·iOS) 가려지는 높이
// 핀치 확대 중에는 visualViewport.height가 1/scale로 줄어들므로 scale을 곱해 화면 높이로 되돌려 비교한다.
// 확대 중의 offsetTop은 확대 영역의 위치라 키보드와 무관하므로 빼지 않는다.
function keyboardInset() {
  const vv = window.visualViewport;
  if (!vv) return 0;
  const scale = vv.scale > 0 ? vv.scale : 1;
  const kb = innerHeight - vv.height * scale - (scale > 1.01 ? 0 : vv.offsetTop);
  return kb > 40 ? Math.round(kb) : 0; // 주소창 출렁임 등 작은 차이는 무시
}
function sheetHeights() {
  const H = innerHeight - keyboardInset();
  const full = Math.max(0, H - document.querySelector('.topbar').getBoundingClientRect().bottom - 8);
  const handleH = handle.offsetHeight + parseFloat(getComputedStyle(handle).marginBottom);
  const pad = parseFloat(getComputedStyle(panel).paddingBottom);
  const folded = handleH + sheetHead.offsetHeight + favoritesRow.offsetHeight + pad;
  const low = Math.min(folded, full);
  // 상태 안내·분류 줄·탐험 도구의 실제 높이를 더한다. 접힘에서는 숨어서 0이 되므로 마지막 측정값을 쓴다.
  const outer = el => {
    if (!el || el.hidden) return 0;
    if (!el.offsetHeight) return el._sheetH || 0;
    const cs = getComputedStyle(el);
    return el._sheetH = el.offsetHeight + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
  };
  const extra = outer(document.getElementById('collection-alert')) + outer(document.querySelector('.category-row')) + outer(document.querySelector('.explore-tools'));
  const cards = mode === 'news' ? firstTwoHeight() : TWO_CARDS;
  const want = folded + extra + cards;
  const mapRoom = H - document.querySelector('.controls').getBoundingClientRect().bottom - MAP_MIN;
  let middle = Math.min(full, Math.max(low, H * .48, Math.min(want, mapRoom)));
  const fixed = folded + extra;
  if (middle - fixed < MIN_FEED) middle = full; // 확대·낮은 화면: 중간에서 소식을 읽을 수 없으면 전체로 펼친다
  const heights = [low, middle, full];
  heights.fixed = fixed;
  heights.fits = middle - fixed >= cards - 2 || middle === full; // 중간에서 앞 두 소식이 다 보이는지
  return heights;
}
const MIN_FEED = 100, SCROLL_FEED = 240;
// 소식 앞 두 카드의 실제 높이(제목 3~5줄·긴 지역명 포함). 펼친 카드는 높이가 커지므로 재지 않고 마지막 값을 쓴다.
function firstTwoHeight() {
  const lis = [...feedEl.children].filter((li) => li.dataset.id).slice(0, 2);
  if (lis.length && !lis.some((li) => li.classList.contains('open'))) {
    const h = lis.reduce((sum, li) => sum + li.offsetHeight, 0);
    if (h > 0) feedEl._twoH = h + 8;
  }
  return feedEl._twoH || TWO_CARDS;
}
// 전체 단계의 목록 자리가 좁으면 상단 고정 영역까지 함께 스크롤해 마지막 소식·상세·버튼에 닿게 한다
function applySheetHeight(heights) {
  const before = parseFloat(panel.style.height) || 0, h = heights[sheetStage];
  panel.style.height = h + 'px';
  // 중간에서 앞 두 소식을 다 담지 못하면 손잡이에 '전체 목록 보기'를 보여 준다(글자를 줄이거나 제목을 자르지 않는다)
  const hint = sheetStage === 1 && !heights.fits;
  panel.classList.toggle('needs-expand', hint);
  handle.setAttribute('aria-label', '소식 목록 높이: ' + stageNames[sheetStage] + (hint ? '. 앞 소식이 다 보이지 않아요. 누르면 전체 목록' : '. 누르면 다음 높이로 바뀌어요'));
  const scroll = sheetStage === 2 && h - heights.fixed < SCROLL_FEED;
  if (panel.classList.contains('sheet-scroll') !== scroll) { panel.classList.toggle('sheet-scroll', scroll); if (!scroll) panel.scrollTop = 0; }
  if (Math.abs(before - h) > 4) refitAfterSheet();
}
// 시트 높이가 바뀐 뒤(전환 끝) 지도 안전 영역에 다시 맞춘다. 사용자가 직접 움직인 지도는 건드리지 않는다.
let refitTimer;
function refitAfterSheet() {
  clearTimeout(refitTimer);
  refitTimer = setTimeout(() => {
    if (sheetDrag || !homeBounds) return;
    if (!selection && atHome) fitHome();
    else if (selection && selectionAutoFit) fitSelection();
  }, reducedMotion.matches ? 0 : 320);
}
// 모드·탐험 레이어를 바꾼 직후 현재 단계 높이를 다시 맞춘다 (ResizeObserver와 같은 계산)
function fitSheet() { if (!sheetDrag && mobileSheet.matches) applySheetHeight(sheetHeights()); }
function feedTouchAction() {
  const top = panel.classList.contains('sheet-scroll') ? panel.scrollTop : feedEl.scrollTop;
  feedEl.classList.toggle('sheet-pull', mobileSheet.matches && sheetStage === 2 && top <= 0);
  panel.classList.toggle('sheet-pull', mobileSheet.matches && sheetStage === 2 && top <= 0 && panel.classList.contains('sheet-scroll'));
}
function setSheetStage(stage, remember = true) {
  clearTimeout(sheetFitTimer);
  sheetStage = stage;
  panel.classList.remove('sheet-dragging');
  panel.dataset.sheetStage = stages[stage];
  handle.setAttribute('aria-label', '소식 목록 높이: ' + stageNames[stage] + '. 누르면 다음 높이로 바뀌어요');
  handle.setAttribute('aria-controls', 'feed');
  [chipsEl, feedEl, document.getElementById('new-items')].forEach(el => { el.inert = mobileSheet.matches && stage === 0; });
  if (mobileSheet.matches) applySheetHeight(sheetHeights());
  else { panel.style.removeProperty('height'); panel.classList.remove('sheet-scroll'); }
  if (mobileSheet.matches && stage === 0) {
    sheetFitTimer = setTimeout(() => {
      if (!mobileSheet.matches || sheetStage !== 0 || sheetDrag) return;
      if (selection) {
        const bounds = L.latLngBounds([]);
        selection.codes.forEach(code => bounds.extend(muniByCode.get(code).layer.getBounds()));
        map.fitBounds(bounds, { paddingTopLeft:leftPad(), paddingBottomRight:bottomPad(), maxZoom:11, animate:false });
      } else if (atHome && homeBounds) fitHome();
    }, reducedMotion.matches ? 0 : 320);
  }
  feedTouchAction();
  if (remember) try { localStorage.setItem('nallae-sheet-stage', stages[stage]); } catch (_) {}
}
handle.addEventListener('click', e => {
  if (!mobileSheet.matches) return;
  if (suppressSheetClick && e.detail !== 0) { suppressSheetClick = false; return; }
  setSheetStage((sheetStage + 1) % 3);
});
panel.addEventListener('pointerdown', e => {
  if (!mobileSheet.matches || !e.isPrimary || e.button !== 0 || sheetDrag) return;
  const fromFeed = feedEl.contains(e.target);
  const scrolled = panel.classList.contains('sheet-scroll') ? panel.scrollTop > 0 : feedEl.scrollTop > 0;
  const sheetBody = panel.classList.contains('sheet-scroll') && !e.target.closest('.panel-handle, .panel-head');
  if (fromFeed || sheetBody ? sheetStage !== 2 || scrolled : !e.target.closest('.panel-handle, .panel-head')) return;
  if (!fromFeed && !sheetBody && e.target.closest('button, a, input') && e.target !== handle) return;
  suppressSheetClick = false;
  sheetDrag = { id:e.pointerId, x:e.clientX, y:e.clientY, lastY:e.clientY, time:e.timeStamp,
    velocity:0, height:panel.getBoundingClientRect().height, fromFeed: fromFeed || sheetBody, active:false };
});
window.addEventListener('pointermove', e => {
  const d = sheetDrag;
  if (!d || d.id !== e.pointerId) return;
  const dy = e.clientY - d.y;
  if (!d.active) {
    if (Math.abs(dy) < 6) return;
    if (Math.abs(e.clientX-d.x) > Math.abs(dy) || (d.fromFeed && dy <= 0)) { sheetDrag = null; return; }
    d.active = true;
    panel.setPointerCapture(e.pointerId);
    panel.classList.add('sheet-dragging');
  }
  e.preventDefault();
  const elapsed = e.timeStamp-d.time;
  if (elapsed > 0) d.velocity = (e.clientY-d.lastY)/elapsed;
  d.lastY = e.clientY; d.time = e.timeStamp;
  const heights = sheetHeights();
  panel.classList.remove('sheet-scroll');
  panel.style.height = Math.max(heights[0], Math.min(heights[2], d.height-dy)) + 'px';
}, {passive:false});
function endSheetDrag(e) {
  const d = sheetDrag;
  if (!d || d.id !== e.pointerId) return;
  sheetDrag = null;
  if (panel.hasPointerCapture(e.pointerId)) panel.releasePointerCapture(e.pointerId);
  if (!d.active) return;
  suppressSheetClick = true;
  const heights = sheetHeights(), height = panel.getBoundingClientRect().height;
  let stage = heights.reduce((best,h,i) => Math.abs(h-height) < Math.abs(heights[best]-height) ? i : best, 0);
  if (e.type !== 'pointercancel' && e.timeStamp-d.time < 100 && Math.abs(d.velocity) > .5)
    stage = Math.max(0, Math.min(2, sheetStage + (d.velocity < 0 ? 1 : -1)));
  setSheetStage(stage);
}
['pointerup', 'pointercancel'].forEach(type => window.addEventListener(type, endSheetDrag));
panel.addEventListener('lostpointercapture', e => { if (e.target === panel) endSheetDrag(e); });
feedEl.addEventListener('scroll', feedTouchAction, {passive:true});
panel.addEventListener('scroll', feedTouchAction, {passive:true});
function resizeSheet() {
  const id = sheetDrag?.id;
  sheetDrag = null;
  if (id !== undefined && panel.hasPointerCapture(id)) panel.releasePointerCapture(id);
  root.style.setProperty('--kb', keyboardInset() + 'px');
  setSheetStage(sheetStage, false);
}
window.addEventListener('resize', resizeSheet);
window.visualViewport?.addEventListener('resize', resizeSheet);
mobileSheet.addEventListener('change', resizeSheet);
// 시트 안 줄(상태 안내·분류·탐험 도구)의 높이가 바뀌면 현재 단계 높이만 다시 맞춘다
const sheetContentObserver = new ResizeObserver(fitSheet);
[sheetHead, favoritesRow, document.getElementById('collection-alert'), document.querySelector('.category-row'), document.querySelector('.topbar')].forEach(el => sheetContentObserver.observe(el));
setSheetStage(sheetStage, false);

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
  scheduleLabels();
}).observe(root, {attributes:true, attributeFilter:['data-theme']});
﻿let exploreLayer='festival', fuelProduct='B027', fuelData=null, placesData=null, placeLocations=null, foodIndex=null, weatherData=null, forecastData=null, parkingIndex=null, parkingLive=null, pharmacyIndex=null, erData=null, careRaw={};
try { exploreLayer=localStorage.getItem('nallae-explore-layer') || 'festival'; fuelProduct=localStorage.getItem('nallae-fuel-product') === 'D047' ? 'D047' : 'B027'; } catch (_) {}
const preferredExploreLayer=DEMO && (params.has('rain') || params.has('snow')) ? 'weather' : exploreLayer;
const foodCache=new Map(), foodPending=new Set(), foodErrors=new Set();
let foodQuery='', foodKind='', foodLimit=50, foodCode=null;
const fuelMarkers=L.layerGroup().addTo(map);
const placeMarkers=L.layerGroup().addTo(map), placeMarkerById=new Map();
const placeAttribution='식당 위치 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> (ODbL)';
fetch('data/place-locations.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{
  if(data?.items && typeof data.items==='object') placeLocations=data;
  if(mode==='explore'&&exploreLayer==='places'&&placesData)renderExplore();
}).catch(()=>{}); // 좌표 자료 실패에도 식당 주소 목록은 계속 제공한다.
const exploreTools=document.createElement('div'); exploreTools.className='explore-tools';
feedEl.before(exploreTools); sheetContentObserver.observe(exploreTools);
const exploreFailed=new Set(); let exploreReady=false;
const fuelColors=['#b5d9d1','#c7ded5','#e0e4da','#d7dce6','#d9cee5'];
const productName=()=>fuelProduct==='B027'?'휘발유':'경유';
const money=v=>Number.isFinite(v)?v.toLocaleString('ko-KR',{maximumFractionDigits:0})+'원':'미제공';
const availableLayers=()=>[['festival','축제',festivals.length],['weather','날씨',weatherData],['fuel','주유소',fuelData],['parking','주차장',parkingIndex],['pharmacy','약국',exploreReady],['er','응급실',exploreReady],['food','식품안심업소',foodIndex],['places','소개된 식당',placesData]].filter(x=>x[2]);

const parkingCache=new Map(), parkingPending=new Set(), parkingErrors=new Set();
const parkingMarkers=L.layerGroup().addTo(map);
let parkingFilter='', parkingCode=null, parkingShown=[];
const liveFor=x=>parkingLive?.items.find(l=>l.matchId===x.id&&Number.isFinite(l.now)&&Number.isFinite(l.total));
function parkingSpace(l) { const free=Math.max(0,l.total-l.now), r=l.total>0?free/l.total:0;return {free,state:r>=.3?'여유':r<.1?'혼잡':'보통',tone:r>=.3?'easy':r<.1?'busy':'normal'}; }
function parkingText(x,only=false) {
 const l=only?(Number.isFinite(x.now)&&Number.isFinite(x.total)?x:null):liveFor(x), a=l&&parkingSpace(l);
 const fee=x.fee==='무료'?'무료':[x.fee,x.basic&&Number.isFinite(x.basic.won)&&Number.isFinite(x.basic.min)?'기본 '+x.basic.min+'분 '+money(x.basic.won):'',x.add&&Number.isFinite(x.add.won)&&Number.isFinite(x.add.min)?'추가 '+x.add.min+'분 '+money(x.add.won):'',Number.isFinite(x.dayMax)?'하루 최대 '+money(x.dayMax):''].filter(Boolean).join(' · ');
 const hours=[['평일',x.weekday],['토',x.sat],['공휴일',x.holiday]].filter(v=>v[1]).map(v=>v.join(' ')).join(' · ');
 return '<h3>'+escapeHtml(x.name)+'</h3><p>'+escapeHtml([x.kind,x.type,Number.isFinite(x.spaces)?x.spaces+'면':only?x.total+'면':''].filter(Boolean).join(' · '))+'</p><p>'+escapeHtml(fee||'요금 미제공')+'</p>'+(hours?'<p>'+escapeHtml(hours)+'</p>':'')+'<p>'+escapeHtml(x.address||'주소 미제공')+'</p>'+(a?'<p class="parking-live '+a.tone+'">지금 빈자리 '+a.free+'면 · '+a.state+' · '+escapeHtml(l.at?l.at.slice(11,16)+' 기준':'시각 미제공')+'</p>':'')+(x.ref?'<p class="src">자료 기준일 '+escapeHtml(x.ref)+'</p>':'')+(only?addressLink(x.address):routeLink(x));
}
async function loadParking(code) {
 parkingPending.add(code);parkingErrors.delete(code);
 try { const r=await fetch('data/'+(DEMO?'demo-parking/':'parking/')+encodeURIComponent(code)+'.json',{cache:'no-store'});if(!r.ok) throw Error();const d=await r.json();if(!Array.isArray(d.items)) throw Error();parkingCache.set(code,d); }catch(_){parkingErrors.add(code);}
 parkingPending.delete(code);if(mode==='explore'&&exploreLayer==='parking'&&selection?.center.code===code) renderExplore();
}
function renderParking() {
 const code=muniByCode.has(selection?.center.code)?selection.center.code:null;
 if(parkingCode!==code){parkingCode=code;parkingFilter='';}parkingShown=[];
 exploreTools.innerHTML=sourceDisclosure('전국주차장정보표준데이터 · 기준일은 지자체마다 달라요','전국주차장정보표준데이터 · 기준일은 지자체마다 달라요 · 서울은 서울시 공영주차장 안내로 보충(위치 없는 곳은 목록만) · 시영주차장 실시간은 서울열린데이터광장, 현장과 다를 수 있어요');
 if(!code){feedEl.innerHTML='<li class="empty">지도에서 시·군·구를 고르면 그 동네 주차장을 보여드려요<div class="explore-toggle">'+favorites.map(r=>'<button type="button" data-parking-region="'+escapeHtml(r.code)+'">'+escapeHtml(r.name)+'</button>').join('')+'</div></li>';return;}
 const data=parkingCache.get(code), extra=(parkingLive?.items||[]).filter(x=>x.sgg===code&&!x.matchId);
 if(!data&&parkingIndex.counts[code]>0){feedEl.innerHTML='<li class="empty">'+(parkingErrors.has(code)?'지역 자료를 받지 못했어요. <button type="button" data-parking-retry>다시 받기</button>':'지역 자료를 불러오는 중이에요.')+'</li>';if(!parkingPending.has(code)&&!parkingErrors.has(code)) loadParking(code);return;}
 const items=data?.items||[], hasFree=x=>{const l=liveFor(x);return l&&parkingSpace(l).free>0;};
 const filters=[['','전체'],...(items.concat(extra).some(x=>x.fee==='무료')?[['free','무료']]:[]),...(items.some(x=>x.kind==='공영')||extra.length?[['public','공영']]:[]),...(items.some(hasFree)||extra.some(x=>Number.isFinite(x.now)&&x.total>x.now)?[['live','지금 빈자리(서울)']]:[])];
 if(!filters.some(x=>x[0]===parkingFilter)) parkingFilter='';
 exploreTools.innerHTML+='<div class="explore-toggle">'+filters.map(([k,n])=>'<button type="button" data-parking-filter="'+k+'" aria-pressed="'+(k===parkingFilter)+'">'+n+'</button>').join('')+'</div>';
 const accept=(x,only=false)=>!parkingFilter||parkingFilter==='free'&&x.fee==='무료'||parkingFilter==='public'&&(x.kind==='공영'||only)||parkingFilter==='live'&&(only?Number.isFinite(x.now)&&x.total>x.now:hasFree(x));
 parkingShown=items.filter(x=>accept(x)).sort((a,b)=>Number(!!liveFor(b))-Number(!!liveFor(a))||Number(b.fee==='무료')-Number(a.fee==='무료')||a.name.localeCompare(b.name,'ko'));
 const rest=extra.filter(x=>accept(x,true));
 feedEl.innerHTML=parkingShown.map(x=>'<li class="festival-card">'+parkingText(x)+'</li>').join('')+(rest.length?'<li class="explore-source">위치 정보 없이 실시간만 있는 곳</li>'+rest.map(x=>'<li class="festival-card">'+parkingText(x,true)+'</li>').join(''):'')+(!parkingShown.length&&!rest.length?'<li class="empty">이 지역에 해당하는 주차장 자료가 없어요.</li>':'');renderParkingMarkers();
}
function renderParkingMarkers(){
 parkingMarkers.clearLayers();if(mode!=='explore'||exploreLayer!=='parking')return;
 const groups=[];for(const x of parkingShown){if(!Number.isFinite(x.lat)||!Number.isFinite(x.lon)||Math.abs(x.lat)>90||Math.abs(x.lon)>180)continue;const pt=map.latLngToContainerPoint([x.lat,x.lon]);let g=groups.find(g=>g.pt.distanceTo(pt)<(map.getZoom()<MUNI_ZOOM?44:26));if(!g){g={pt,items:[]};groups.push(g);}g.items.push(x);}
 for(const g of groups){const bounds=L.latLngBounds(g.items.map(x=>[x.lat,x.lon])), x=g.items[0],l=g.items.length===1&&liveFor(x),a=l&&parkingSpace(l);
 const marker=L.marker(bounds.getCenter(),{title:g.items.map(x=>x.name).join(' · '),icon:L.divIcon({className:'parking-marker',html:'<span class="parking-pin '+(x.fee==='무료'?'free':'')+'">P'+(g.items.length>1?'<small>'+g.items.length+'</small>':'')+'</span>'+(a?'<span class="parking-tag '+a.tone+'">빈 '+a.free+' · '+a.state+'</span>':''),iconSize:[44,44],iconAnchor:[22,22]})}).addTo(parkingMarkers);
 if(g.items.length>1)marker.on('click',()=>moveToBounds(bounds,{paddingTopLeft:leftPad(),paddingBottomRight:bottomPad(),maxZoom:Math.min(13,map.getZoom()+2),duration:.6}));if(g.items.length===1||map.getZoom()>=13)marker.bindPopup(g.items.map(x=>parkingText(x)).join('<hr>'));
 }
}
map.on('moveend zoomend',renderParkingMarkers);
exploreTools.addEventListener('click',e=>{const b=e.target.closest('[data-parking-filter]');if(b){parkingFilter=b.dataset.parkingFilter;renderExplore();}});
feedEl.addEventListener('click',e=>{if(mode!=='explore'||exploreLayer!=='parking')return;const b=e.target.closest('button');if(!b)return;if(b.dataset.parkingRegion){const m=muniByCode.get(b.dataset.parkingRegion);if(m)select(m,false);}if(b.hasAttribute('data-parking-retry')){loadParking(parkingCode);renderExplore();}});
setInterval(async()=>{try{const r=await fetch('data/'+(DEMO?'demo-parking-live':'parking-live')+'.json',{cache:'no-store'});if(!r.ok)return;const d=await r.json();if(Array.isArray(d.items))parkingLive=d;if(mode==='explore'&&exploreLayer==='parking')renderExplore();}catch(_){}},10*60*1000);
// ---------- 약국·응급실 (국립중앙의료원 공공데이터, 하루 한 번 수집한 정적 파일) ----------
// 약국은 공식 등록 운영시간만 그대로 보여주고 '지금 영업 중'이라고 판정하지 않는다(임시휴무를 알 수 없다).
// 응급실은 dutyEryn(응급실운영여부)=1 기관만 수집된다. 수용 가능 여부·치료 우선순위·거리 추천은 하지 않는다.
// 사용자 위치는 쓰지 않는다(지역 선택 기준). 전화는 누를 때만 전화 앱이 열린다.
let careFilter='', careCode=null, careShown=[];
const pharmacyCache=new Map(), pharmacyPending=new Set(), pharmacyErrors=new Set();
const careMarkers=L.layerGroup().addTo(map), careMarkerById=new Map();
const CARE_DAYS=['월','화','수','목','금','토','일','공휴일'];
const hm=t=>t.slice(0,2)+':'+t.slice(2);
// 한국 시간 기준 요일 칸(0=월 … 6=일). 공휴일은 달력이 없어 따로 판정하지 않는다.
const kstDayIndex=(d=new Date())=>(new Date(d.getTime()+9*3600e3).getUTCDay()+6)%7;
const careHours=h=>h?hm(h[0])+'~'+hm(h[1]):'등록된 시간 없음';
const careDate=d=>{const t=new Date(d);return validDate(t)?t.toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Seoul'}):'미제공';};
const careHas=x=>Number.isFinite(x.lat)&&Number.isFinite(x.lon)&&x.lat>=33&&x.lat<=39&&x.lon>=124&&x.lon<=132;
function telLink(num,text){const d=String(num||'').replace(/[^0-9]/g,'');if(d.length<7||d.length>12)return '';return '<a class="care-tel" href="tel:'+d+'">'+escapeHtml(text)+' '+escapeHtml(num)+'</a>';}
async function loadPharmacy(code) {
  pharmacyPending.add(code); pharmacyErrors.delete(code);
  try { const r=await fetch('data/'+(DEMO?'demo-pharmacy/':'pharmacy/')+encodeURIComponent(code)+'.json',{cache:'no-store'}); if(!r.ok) throw Error(); const d=await r.json(); if(!Array.isArray(d.items)) throw Error();
    // 배포 도중·오프라인 캐시로 목차와 다른 세대 파일을 받으면 쓰지 않는다(0곳·완료로 판정하지 않음)
    if(d.updated!==pharmacyIndex?.updated||d.items.length!==pharmacyIndex?.counts?.[code]) throw Error('generation'); pharmacyCache.set(code,d); } catch(_) { pharmacyErrors.add(code); }
  pharmacyPending.delete(code); if(mode==='explore'&&exploreLayer==='pharmacy'&&selection?.center.code===code) renderExplore();
}
function pharmacyCard(x) {
  const today=kstDayIndex();
  const rows=CARE_DAYS.map((d,i)=>'<tr'+(i===today?' class="today"':'')+'><th scope="row">'+d+'</th><td>'+escapeHtml(careHours(x.hours?.[i]))+'</td></tr>').join('');
  return '<li class="festival-card care-card" data-care-id="'+escapeHtml(x.id)+'"><h3>'+escapeHtml(x.name)+'</h3><p class="care-today">오늘('+CARE_DAYS[today]+') 등록 운영시간 <strong>'+escapeHtml(careHours(x.hours?.[today]))+'</strong></p>'
    +'<details class="care-hours"><summary>요일별·공휴일 운영시간</summary><table>'+rows+'</table><p class="place-checked">공휴일에는 \'공휴일\' 시간을 확인하세요. 시간 없음은 휴무라는 뜻이 아니라 자료에 등록되지 않았다는 뜻이에요.</p></details>'
    +'<p class="card-address">'+escapeHtml(x.address)+'</p><div class="care-actions">'+(telLink(x.phone,'전화')||'<span class="place-checked">전화번호 미제공 · 방문 전 다른 방법으로 확인하세요</span>')+(careHas(x)?'<button type="button" data-care-map="'+escapeHtml(x.id)+'">지도에서 보기</button>':'<span class="place-checked">지도 위치 없음 · 주소로 찾아보세요</span>')+routeLink(careHas(x)?x:{address:x.address})+'</div></li>';
}
function erCard(x) {
  return '<li class="festival-card care-card" data-care-id="'+escapeHtml(x.id)+'"><h3>'+escapeHtml(x.name)+'</h3>'+(x.cls?'<p>'+escapeHtml(x.cls)+' <span class="place-checked">(공식 분류)</span></p>':'')
    +'<p class="card-address">'+escapeHtml(x.address)+'</p><div class="care-actions">'+(telLink(x.erPhone,'응급실 전화')||'<span class="place-checked">응급실 전화 미제공</span>')+(telLink(x.phone,'대표 전화')||(x.erPhone?'':'<span class="place-checked">대표 전화 미제공 · 위급하면 119</span>'))+(careHas(x)?'<button type="button" data-care-map="'+escapeHtml(x.id)+'">지도에서 보기</button>':'<span class="place-checked">지도 위치 없음 · 주소로 찾아보세요</span>')+routeLink(careHas(x)?x:{address:x.address})+'</div></li>';
}
function careRegionPrompt(what) { return '<li class="empty">지도에서 시·군·구를 고르면 그 동네 '+what+'을 보여드려요'+(favorites.length?'<div class="explore-toggle">'+favorites.map(r=>'<button type="button" data-care-region="'+escapeHtml(r.code)+'">'+escapeHtml(r.name)+'</button>').join('')+'</div>':'')+'</li>'; }
const CARE_URGENT='<div class="care-urgent" role="note"><p><strong>생명이 위급하면 바로 119</strong>에 전화하세요.</p><a class="care-119" href="tel:119">119 전화</a></div>';
// 실패 기록의 고정 문구(수집기가 만든 것)만 보고 '준비 중'과 '받지 못함'을 나눈다. 원문은 화면에 그대로 보이지 않는다.
const careWaiting=raw=>/활용신청|등록되지 않은 키|접근 거부/.test(raw?.lastFailure?.error||'');
function renderCareUnavailable(er) {
  const key=er?'er':'pharmacy/index', raw=careRaw[key], what=er?'응급실 운영 기관':'약국';
  careShown=[]; renderCareMarkers();
  exploreTools.innerHTML=(er?CARE_URGENT:'')+'<p class="care-note">'+(er?'가까운 응급실은 119에 전화해 안내받을 수 있어요.':'운영시간이 바뀔 수 있으니 방문 전 전화로 확인하세요.')+'</p>';
  const when=raw?.lastFailure?.at?' (마지막 시도 '+careDate(raw.lastFailure.at)+')':'';
  const msg=!exploreReady?what+' 자료를 불러오는 중이에요.'
    : careWaiting(raw)?what+' 정보는 공공데이터 이용 승인을 기다리는 중이라 아직 보여드릴 수 없어요'+when+'.'
    : what+' 자료를 받지 못했어요'+when+'. 자료가 없다는 뜻이지 '+what+'이 없다는 뜻은 아니에요.';
  feedEl.innerHTML='<li class="empty">'+escapeHtml(msg)+(exploreReady?'<div class="empty-actions"><button type="button" data-care-reload>다시 시도</button></div>':'')+'</li>';
}
function updateCareStatus() {
  const er=exploreLayer==='er', data=er?erData:pharmacyIndex, status=document.getElementById('collection-status'), alert=document.getElementById('collection-alert');
  const date=new Date(data?.updated), fail=data?.lastFailure?.at&&new Date(data.lastFailure.at)>date;
  status.classList.remove('failed','stale');
  if(!data){ status.textContent=exploreReady?'받지 못함':'불러오는 중'; if(exploreReady) status.classList.add('failed'); }
  else { status.textContent=validDate(date)?ago(date):'시각 미제공'; status.classList.toggle('stale',fail||!validDate(date)||Date.now()-date>48*3600000); }
  status.setAttribute('aria-label','자료 확인 시각: '+status.textContent+'. 상세 보기');
  alert.hidden=!(data&&fail);
  if(data&&fail) setAlert('stale',(er?'응급실':'약국')+' 최근 갱신에 실패해 '+ago(date)+' 자료를 보여줘요','자세히');
  document.getElementById('sources-detail').textContent=(er?'국립중앙의료원 전국 응급의료기관 정보 조회 서비스':'국립중앙의료원 전국 약국 정보 조회 서비스')+'(공공데이터포털) · 수집 '+(data?careDate(data.updated):'없음')+(fail||(!data&&careRaw[er?'er':'pharmacy/index']?.lastFailure)?' · 최근 갱신 시도 실패 '+careDate((data||careRaw[er?'er':'pharmacy/index']).lastFailure.at):'');
}
function renderCare() {
  const er=exploreLayer==='er', data=er?erData:pharmacyIndex, code=muniByCode.has(selection?.center.code)?selection.center.code:null;
  if(careCode!==code+exploreLayer){careCode=code+exploreLayer;careFilter='';}careShown=[];
  if(!data) return renderCareUnavailable(er);
  const day=careDate(data.updated), fail=data.lastFailure?.at&&new Date(data.lastFailure.at)>new Date(data.updated)?' · 최근 갱신 시도 실패('+careDate(data.lastFailure.at)+'), 직전 정상 자료를 보여줘요':'';
  const left=er?(data.excluded?.unknown||0)+(data.excluded?.unplaced||0):(data.unplaced||0);
  exploreTools.innerHTML=(fail?'<p class="care-note care-stale" role="status">최근 갱신에 실패해 '+escapeHtml(day)+' 수집 자료를 보여줘요.</p>':'')+(er
    ? CARE_URGENT+'<p class="care-note">응급실 수용 가능 여부와 진료 가능 과목은 이 목록으로 알 수 없어요. 가기 전에 응급실에 전화로 확인하세요.</p>'
    : '<p class="care-note">운영시간이 바뀔 수 있으니 방문 전 전화로 확인하세요.</p>')
    +sourceDisclosure((data.fixture?'시험 자료(가상) · ':'')+(er?'응급실 운영 기관':'약국 등록 운영시간')+' · 국립중앙의료원 · '+day+' 수집',
      (er?'국립중앙의료원 전국 응급의료기관 정보(공공데이터포털)에서 응급실운영여부가 \'운영\'인 기관만 보여줘요. 실시간 병상·수용 정보가 아니며, 순서는 이름순이고 추천 순서가 아니에요.'
        :'국립중앙의료원 전국 약국 정보(공공데이터포털)에 등록된 요일별·공휴일 운영시간이에요. 지금 문을 열었는지(임시휴무 등)는 알 수 없어요.')
      +' · 수집 '+day+(left?' · 주소·좌표로 지역을 정하지 못했거나 운영 여부가 확인되지 않은 '+left+'곳은 목록에 없어요':'')+fail+' · 지도 점은 등록 좌표이며 입구를 뜻하지 않아요');
  if(!code){feedEl.innerHTML=careRegionPrompt(er?'응급실 운영 기관':'약국');renderCareMarkers();return;}
  const counts=data.counts||{}, name=escapeHtml(label(selection.center));
  let items;
  if(er) items=data.items.filter(x=>x.sgg===code);
  else {
    if(!(code in counts)){feedEl.innerHTML='<li class="empty">이 지역의 약국 자료가 없어요(자료가 없다는 뜻이지 약국이 없다는 뜻은 아니에요).</li>';renderCareMarkers();return;}
    const c=pharmacyCache.get(code), d=c&&c.updated===data.updated?c:null;
    if(!d&&counts[code]>0){feedEl.innerHTML='<li class="empty">'+(pharmacyErrors.has(code)?'지역 약국 자료를 받지 못했어요(약국이 없다는 뜻은 아니에요). <button type="button" data-care-retry>다시 받기</button>':'지역 약국 자료를 불러오는 중이에요.')+'</li>';if(!pharmacyPending.has(code)&&!pharmacyErrors.has(code)) loadPharmacy(code);renderCareMarkers();return;}
    items=d?.items||[];
  }
  if(!items.length){feedEl.innerHTML='<li class="empty">'+day+' 수집한 공식 자료에 '+name+'의 '+(er?'응급실 운영 기관':'약국')+'이 없어요. 이웃 지역을 함께 확인하고, 위급하면 119에 전화하세요.</li>';renderCareMarkers();return;}
  const holiday=!er&&items.some(x=>x.hours?.[7]);
  if(holiday) exploreTools.insertAdjacentHTML('beforeend','<div class="explore-toggle care-filter">'+[['','전체'],['holiday','공휴일 시간 등록']].map(([k,n])=>'<button type="button" data-care-filter="'+k+'" aria-pressed="'+(careFilter===k)+'">'+n+'</button>').join('')+'</div>');
  careShown=items.filter(x=>careFilter!=='holiday'||x.hours?.[7]);
  feedEl.innerHTML='<li class="explore-source">'+name+' · '+careShown.length+'곳 · 이름순</li>'+careShown.map(er?erCard:pharmacyCard).join('');
  renderCareMarkers();
}
function renderCareMarkers(){
  careMarkers.clearLayers();careMarkerById.clear();
  if(mode!=='explore'||!['pharmacy','er'].includes(exploreLayer))return;
  const er=exploreLayer==='er', groups=[];
  for(const x of careShown){if(!careHas(x))continue;const pt=map.latLngToContainerPoint([x.lat,x.lon]);let g=groups.find(g=>g.pt.distanceTo(pt)<(map.getZoom()<MUNI_ZOOM?40:24));if(!g){g={pt,items:[]};groups.push(g);}g.items.push(x);}
  for(const g of groups){
    const bounds=L.latLngBounds(g.items.map(x=>[x.lat,x.lon])), count=g.items.length;
    const marker=L.marker(bounds.getCenter(),{title:count>1?(er?'응급실 ':'약국 ')+count+'곳':g.items[0].name,icon:L.divIcon({className:'care-marker '+(er?'er':'pharmacy'),iconSize:[44,44],iconAnchor:[22,22],html:'<span>'+(count>1?count:er?'응':'약')+'</span>'})}).addTo(careMarkers);
    if(count>1&&map.getZoom()<map.getMaxZoom())marker.on('click',()=>{atHome=false;selectionAutoFit=false;map.fitBounds(bounds,{paddingTopLeft:leftPad(),paddingBottomRight:bottomPad(),maxZoom:map.getMaxZoom(),animate:!reducedMotion.matches});});
    else marker.bindPopup(g.items.map(x=>'<strong>'+escapeHtml(x.name)+'</strong><p>'+escapeHtml(x.address)+'</p><button type="button" data-care-card="'+escapeHtml(x.id)+'">목록에서 보기</button>'+(er?telLink(x.erPhone,'응급실 전화'):telLink(x.phone,'전화'))+routeLink(x)).join('<hr>'),{maxWidth:260});
    g.items.forEach(x=>careMarkerById.set(x.id,marker));
  }
}
map.on('zoomend',()=>{if(mode==='explore'&&['pharmacy','er'].includes(exploreLayer))renderCareMarkers();});
exploreTools.addEventListener('click',e=>{const b=e.target.closest('[data-care-filter]');if(b){careFilter=b.dataset.careFilter;renderExplore();}});
feedEl.addEventListener('click',e=>{
  if(mode!=='explore'||!['pharmacy','er'].includes(exploreLayer))return;
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.careRegion){const m=muniByCode.get(b.dataset.careRegion);if(m)select(m,false);}
  if(b.hasAttribute('data-care-retry')){loadPharmacy(selection.center.code);renderExplore();}
  if(b.hasAttribute('data-care-reload')){loadExploreData([exploreLayer==='er'?'er':'pharmacy/index']);}
  if(b.dataset.careMap){const x=careShown.find(x=>x.id===b.dataset.careMap);if(!x||!careHas(x))return;atHome=false;selectionAutoFit=false;setSheetStage(0);clearTimeout(sheetFitTimer);map.setView([x.lat,x.lon],map.getMaxZoom(),{animate:false});renderCareMarkers();careMarkerById.get(x.id)?.openPopup();}
});
map.getContainer().addEventListener('click',e=>{const b=e.target.closest('[data-care-card]');if(!b)return;const el=[...feedEl.querySelectorAll('[data-care-id]')].find(el=>el.dataset.careId===b.dataset.careCard);if(el){setSheetStage(2);el.scrollIntoView({block:'nearest',behavior:'instant'});(el.querySelector('[data-care-map]')||el.querySelector('a'))?.focus({preventScroll:true});}});

function fuelColor(code) {
  const price=fuelData?.sgg?.[code]?.[fuelProduct], avg=fuelData?.national?.[fuelProduct]?.price;
  if (!Number.isFinite(price) || !Number.isFinite(avg)) return null;
  const d=price-avg; return fuelColors[d < -50?0:d < -10?1:d <= 10?2:d <= 50?3:4];
}
// 탐험 자료: 응답이 200이어도 필수 구조가 없으면 실패로 본다. 재시도에 성공하면 실패 표시를 지운다.
const EXPLORE_NAMES={fuel:'주유소',weather:'날씨','parking/index':'주차장','food/index':'식품안심업소','places':'소개된 식당'};
const exploreValid={fuel:d=>d.sgg&&Array.isArray(d.stations)&&d.national,'food/index':d=>d.counts,weather:d=>d.sgg,forecast:d=>d.sgg,'parking/index':d=>d.counts,'parking-live':d=>Array.isArray(d.items),'pharmacy/index':d=>d.complete===true&&d.counts&&typeof d.counts==='object',er:d=>d.complete===true&&Array.isArray(d.items)&&d.counts,'places':d=>Array.isArray(d.items)};
const exploreMissing=()=>Object.entries(EXPLORE_NAMES).filter(([k])=>exploreFailed.has(k)).map(x=>x[1]);
async function loadExploreData(keys=Object.keys(exploreValid)) {
  const first=!exploreReady; // 다시 시도할 때는 보고 있던 분류를 바꾸지 않는다
  await Promise.all(keys.map(async key=>{
    try {
      const r=await fetch('data/'+(DEMO&&key!=='places'?(key==='food/index'?'demo-food/index':'demo-'+key):key)+'.json',{cache:'no-store'});
      if (!r.ok) throw Error(); const data=await r.json();
      if(key==='pharmacy/index'||key==='er') careRaw[key]=data;
      if (!data || !exploreValid[key](data)) throw Error('invalid');
      if(key==='fuel') fuelData=data; else if(key==='weather') weatherData=data; else if(key==='forecast') forecastData=data;
      else if(key==='food/index') foodIndex=data; else if(key==='parking/index') parkingIndex=data; else if(key==='pharmacy/index') pharmacyIndex=data; else if(key==='er') erData=data; else if(key==='places') placesData=data; else parkingLive=data;
      exploreFailed.delete(key);
    } catch (_) { exploreFailed.add(key); if(key==='pharmacy/index') pharmacyIndex=null; if(key==='er') erData=null; }
  }));
  exploreReady=true;
  if(first&&availableLayers().some(x=>x[0]===preferredExploreLayer)) exploreLayer=preferredExploreLayer;
  if(mode==='explore') { syncCategories(); renderExplore(); fitSheet(); }
}
// 보고 있는 정보가 정상이어도 빠진 생활 정보가 있으면 한 줄로 알리고 다시 시도할 수 있게 한다
function noteExploreMissing() {
  const missing=exploreMissing(), alert=document.getElementById('collection-alert');
  if(!exploreReady || !missing.length || !alert.hidden) return missing;
  alert.hidden=false; setAlert('failed',missing.join('·')+' 자료를 불러오지 못해 분류에서 뺐어요','다시 시도','explore');
  return missing;
}
function updateExploreStatus() {
  if(exploreLayer==='festival') return updateFestivalStatus();
  if(exploreLayer==='pharmacy'||exploreLayer==='er') return updateCareStatus();
  if(exploreLayer==='places') {
    const status=document.getElementById('collection-status');
    status.textContent='목록 확인 '+String(placesData.listCheckedAt||'').slice(5).replace('-','.'); status.classList.remove('failed','stale');
    status.setAttribute('aria-label',status.textContent+'. 손으로 확인한 목록이에요. 상세 보기');
    document.getElementById('collection-alert').hidden=true; noteExploreMissing();
    document.getElementById('sources-detail').textContent='손으로 확인한 목록 · 목록 확인일 '+(placesData.listCheckedAt||'미제공')+' · 영상 소개는 공식 영상 설명란의 상호·주소, 운영자 추천은 날래 운영자의 주관적 의견이에요. 맛·위생·현재 영업을 보증하지 않아요. 자동 수집 자료가 아니에요.';
    return;
  }
  const data=exploreLayer==='fuel'?fuelData:exploreLayer==='weather'?weatherData:exploreLayer==='parking'?parkingIndex:exploreLayer==='pharmacy'?pharmacyIndex:exploreLayer==='er'?erData:foodIndex, date=new Date(data?.updated);
  const status=document.getElementById('collection-status'), stale=!validDate(date)||Date.now()-date>(exploreLayer==='weather'?2:exploreLayer==='fuel'?6:48)*3600000;
  status.textContent=!exploreReady?'불러오는 중':validDate(date)?ago(date):'시각 미제공'; status.classList.remove('failed'); status.classList.toggle('stale',stale);
  status.setAttribute('aria-label','자료 확인 시각: '+status.textContent+'. 상세 보기');
  const alert=document.getElementById('collection-alert'); alert.hidden=!stale;
  if(stale) setAlert('stale',validDate(date)?(availableLayers().find(x=>x[0]===exploreLayer)?.[1]||'자료')+' 자료가 '+ago(date)+' 기준이에요':'자료 확인 시각이 없어요','자세히');
  const missing=noteExploreMissing();
  document.getElementById('sources-detail').textContent=(missing.length?'불러오지 못한 자료: '+missing.join('·')+' · ':'')+(exploreLayer==='weather'?'기상청 초단기실황':exploreLayer==='fuel'?'오피넷(한국석유공사)':exploreLayer==='parking'?'전국주차장정보표준데이터 · 서울열린데이터광장':exploreLayer==='pharmacy'?'국립중앙의료원 전국 약국 정보 조회 서비스(공공데이터포털)':exploreLayer==='er'?'국립중앙의료원 전국 응급의료기관 정보 조회 서비스(공공데이터포털)':'식품안전나라(식품의약품안전처)')+' · 확인 시각: '+(validDate(date)?date.toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'미제공');
}
function renderExplore() {
  const available=availableLayers();
  if(!available.some(x=>x[0]===exploreLayer)) exploreLayer=available[0]?.[0] || 'festival';
  exploreTools.hidden=mode!=='explore'; exploreTools.innerHTML=''; fuelMarkers.clearLayers(); festivalMarkers.clearLayers(); parkingMarkers.clearLayers(); careMarkers.clearLayers(); placeMarkers.clearLayers(); map.attributionControl.removeAttribution(placeAttribution);
  munis.forEach(restyle); scheduleLabels();
  updateRainScene();
  if(mode!=='explore') return;
  if(exploreLayer==='festival') return renderFestivals();
  syncCategories(); newButton.hidden=true; updateExploreStatus();
  titleEl.textContent=selection?regionTitle(selection.center):'동네 탐험';
  subEl.textContent=exploreLayer==='weather'?'동네 날씨 실황(최근 관측)':exploreLayer==='fuel'?'지역 평균과 최저가 주유소':exploreLayer==='parking'?'동네 주차장':exploreLayer==='pharmacy'?'동네 약국 · 등록 운영시간':exploreLayer==='er'?'응급실 운영 기관 · 위급하면 119':exploreLayer==='places'?'영상에 소개된 식당·운영자 추천 (지역별 순차 제공)':'동네 식품안심업소';
  if(exploreLayer==='weather') renderWeather(); else if(exploreLayer==='fuel') renderFuel(); else if(exploreLayer==='parking') renderParking(); else if(exploreLayer==='pharmacy'||exploreLayer==='er') renderCare(); else if(exploreLayer==='places') renderPlaces(); else renderFood();
}
// extra: 요약 줄 오른쪽에 붙는 보기 전용 범례(색 띠) — 따로 한 줄을 쓰지 않아 지도 자리를 아낀다
function sourceDisclosure(summary, detail = summary, extra = '') { return '<details class="source-disclosure"><summary><span class="disclosure-text">'+escapeHtml(summary)+'</span>'+extra+'</summary><p>'+escapeHtml(detail)+'</p></details>'; }
// 한국 자료의 시각은 기기 시간대와 관계없이 한국 시간(UTC+9)으로 표기한다
const kstHour = d => String((d.getUTCHours()+9)%24).padStart(2,'0')+'시';
setInterval(async()=>{
  try {
    const r=await fetch('data/'+(DEMO?'demo-weather':'weather')+'.json',{cache:'no-store'});
    if(!r.ok) return;
    const data=await r.json(); if(!data.sgg) return; weatherData=data;
    try { const forecast=await fetch('data/'+(DEMO?'demo-forecast':'forecast')+'.json',{cache:'no-store'}); if(forecast.ok) { const next=await forecast.json(); if(next.sgg) forecastData=next; } } catch (_) {}
    if(mode==='explore'&&exploreLayer==='weather') renderExplore();
  } catch (_) {}
},3600000);
function precipSymbol(pty) { return [3,7].includes(pty)?'❄':[2,6].includes(pty)?'☂❄':'☂'; }
function weatherColor(code) {
  const t=weatherData?.sgg?.[code]?.t; if(!Number.isFinite(t)) return null;
  const stops=[[167,201,226],[216,226,222],[244,222,169],[239,185,142]], x=Math.max(0,Math.min(3,(t+10)/15)), i=Math.min(2,Math.floor(x)), f=x-i;
  return 'rgb('+stops[i].map((v,j)=>Math.round(v+(stops[i+1][j]-v)*f)).join(',')+')';
}
const koreaDate=date=>new Date(date.getTime()+9*3600000).toISOString().slice(0,10);
// 오늘의 지역별 예보를 보여주는 장식. 실제 비구름·강수 범위·강도를 뜻하지 않는다.
const rainScene = L.layerGroup().addTo(map);
function updateRainScene() {
  rainScene.clearLayers();
  if (document.hidden || mode !== 'explore' || exploreLayer !== 'weather' || !selection || decorationsPaused([selection.center.code])) return;
  const region = selection.center, preview = DEMO && (params.has('rain') || params.has('snow'));
  const age = Date.now() - new Date(forecastData?.base).getTime();
  const day = forecastData?.sgg?.[region.code]?.[koreaDate(new Date())];
  if (!preview && (!(age >= 0 && age <= 36*3600000) || ![1,2,3,4].includes(day?.pty))) return;
  if (!map.getBounds().contains(region.center)) return;
  const kind = preview ? (params.has('snow') ? 3 : 1) : day.pty;
  const name = kind === 3 ? '눈' : kind === 2 ? '비·눈' : '비';
  const caption = name + (preview ? ' 연출 미리보기' : ' 예보');
  const text = preview ? name+' 연출 미리보기. 실제 날씨가 아니에요.' : '오늘 '+name+' 예보 연출. 현재 강수나 정확한 범위가 아니에요.';
  const umbrella = kind !== 3 ? '<g class="rain-umbrella"><path class="umbrella-handle" d="M53 7v40q0 10 9 4"/><path d="M28 28a25 25 0 0 1 50 0Q72 22 65 28Q53 21 41 28Q34 22 28 28Z"/><circle class="weather-eye" cx="47" cy="17" r="1.4"/><circle class="weather-eye" cx="59" cy="17" r="1.4"/><ellipse class="weather-cheek" cx="43" cy="20" rx="2.4" ry="1.4"/><ellipse class="weather-cheek" cx="63" cy="20" rx="2.4" ry="1.4"/><path class="umbrella-smile" d="M50 20q3 3 6 0"/></g>' : '';
  const drops = kind !== 3 ? [22,36,73,87].map((x,i)=>'<path class="rain-drop" style="animation-delay:-'+(i*.29)+'s" d="M'+x+' 2q-6 7 0 8q6-1 0-8Z"/>').join('') : '';
  const flakes = kind !== 1 && kind !== 4 ? [24,44,65,83].map((x,i)=>'<g class="snow-flake" style="animation-delay:-'+i*.8+'s"><path d="M'+x+' 10v12m-5-9 10 6m-10 0 10-6"/></g>').join('') : '';
  const snowman = kind === 3 ? '<g class="snowman"><path class="snowman-arm" d="M39 39 29 33m40 6 10-6"/><ellipse class="snowman-body" cx="54" cy="43" rx="15" ry="13"/><circle class="snowman-body" cx="54" cy="22" r="10"/><path class="snowman-scarf" d="M44 30q10 5 20 0v5q-10 4-20 0Zm14 4 6 1-1 10-6-2Z"/><circle class="snowman-eye" cx="50" cy="21" r="1.3"/><circle class="snowman-eye" cx="58" cy="21" r="1.3"/><path class="snowman-nose" d="m53 24 8 2-8 1Z"/><circle class="snowman-eye" cx="54" cy="41" r="1.3"/><circle class="snowman-eye" cx="54" cy="47" r="1.3"/></g>' : '';
  L.marker(region.center, { pane:'decor', interactive:false, keyboard:false, icon:L.divIcon({className:'rain-scene-marker',iconSize:[108,80],iconAnchor:[54,65],html:'<span class="rain-scene" role="img" aria-label="'+text+'"><svg viewBox="0 0 108 60" aria-hidden="true">'+umbrella+drops+snowman+flakes+'</svg><span class="rain-scene-caption">'+(preview?'':'오늘 ')+caption+'</span></span>'}) }).addTo(rainScene);
}
map.on('moveend zoomend', updateRainScene);
document.addEventListener('visibilitychange', updateRainScene);
function forecastHour() {
 const date=new Date(forecastData?.base);
 return validDate(date)?'단기예보 '+kstHour(date)+' 발표':'단기예보 발표 시각 미제공';
}
function forecastCards(code) {
 if(!forecastData) return '';
 return '<h4 class="weather-kind">예보</h4><div class="forecast-days">'+[0,1].map(offset=>{
  const d=forecastData.sgg?.[code]?.[koreaDate(new Date(Date.now()+offset*86400000))], name=offset?'내일':'오늘';
  if(!d) return '<section><h4>'+name+'</h4><p>예보 미제공</p></section>';
  const sky=d.pty>0?({1:'비',2:'비/눈',3:'눈',4:'소나기'}[d.pty]||'강수'):({1:'맑음',3:'구름많음',4:'흐림'}[d.sky]||'하늘 미제공');
  const symbol=d.pty>0?precipSymbol(d.pty):({1:'☀',3:'☁',4:'☁'}[d.sky]||'');
  // 최저·최고 중 하나만 있으면(17시 발표의 오늘 등) 어느 쪽인지 밝힌다
  const lo=Number.isFinite(d.tmn), hi=Number.isFinite(d.tmx);
  const temps=lo&&hi ? d.tmn+'° / '+d.tmx+'°' : lo ? '최저 '+d.tmn+'°' : hi ? '최고 '+d.tmx+'°' : '';
  return '<section><h4>'+name+'</h4><p>'+symbol+' '+sky+'</p>'+(temps?'<strong>'+temps+'</strong>':'')+(Number.isFinite(d.pop)?'<p>강수확률 '+d.pop+'%</p>':'')+'</section>';
 }).join('')+'</div><p class="forecast-source">'+forecastHour()+'</p>';
}
function forecastSummary() {
 if(!forecastData) return '';
 const day=koreaDate(new Date(Date.now()+86400000)),groups=new Map();let count=0;
 Object.entries(forecastData.sgg).forEach(([code,days])=>{const d=days[day],m=muniByCode.get(code);if(!m||!d||!(d.pop>=60||d.pty>0))return;count++;const name=sidos.get(m.sido)?.short||m.sido;groups.set(name,(groups.get(name)||0)+1);});
 return '<li class="festival-card"><h3>내일 비 소식 있는 곳</h3><p>'+count+'개 시·군·구'+(count?' · '+escapeHtml([...groups].map(([name,n])=>name+' '+n+'곳').join(', ')):'')+'</p><p>'+forecastHour()+'</p></li>';
}
function renderWeather() {
  const code=selection?.center.code, region=muniByCode.get(code), w=weatherData.sgg[code];
  const hour=validDate(new Date(weatherData.base))?kstHour(new Date(weatherData.base))+' 발표':'발표 시각 미제공';
  exploreTools.innerHTML=sourceDisclosure('실황 '+hour+(forecastData?' · '+forecastHour():'')+' · 기상청','기상청 초단기실황 · '+hour+(forecastData?' · '+forecastHour():'')+' · 시·군·구 대표 지점 격자(5km) 값이라 동네 안에서도 다를 수 있어요 · 시각은 한국 시간이에요','<span class="weather-legend" role="img" aria-label="지도 색: 기온이 낮을수록 파랑, 높을수록 주황">차가움 <i></i> 따뜻함</span>');
  exploreTools.querySelector('.source-disclosure p').textContent += ' · 지도 우산·눈사람은 선택 지역의 오늘 비·눈 예보 연출이며 현재 강수 위치나 강도를 뜻하지 않아요. 지역을 선택하면 확인할 수 있어요.';
  const rows=Object.entries(weatherData.sgg).filter(([c,v])=>muniByCode.has(c)&&Number.isFinite(v.t)).sort((a,b)=>a[1].t-b[1].t);
  const line=([c,v])=>'<p>'+escapeHtml(label(muniByCode.get(c)))+' <strong>'+v.t+'°</strong>'+(v.pty>0?' '+precipSymbol(v.pty):'')+'</p>';
  if(code) {
    const warning=items.some(it=>it.src==='wrn'&&it.level!=='예비특보'&&it.onMap!==false&&(it.sgg?.includes(code)||it.sido?.includes(region?.sido)));
    feedEl.innerHTML=(warning?'<li><button class="weather-warning" type="button" data-weather-news>기상특보 발효 중 — 소식 탭에서 보기</button></li>':'')+'<li class="festival-card weather-card"><h3>'+escapeHtml(region?label(region):code)+'</h3>'+(w&&Number.isFinite(w.t)?'<p class="weather-kind">최근 관측 · 실황 '+escapeHtml(hour)+'</p><strong class="temperature">'+w.t+'°</strong> '+(w.pty>0?precipSymbol(w.pty):'')+'<p>습도 '+(w.reh??'미제공')+(w.reh==null?'':'%')+' · 바람 '+(w.wsd??'미제공')+(w.wsd==null?'':'m/s')+' · 1시간 강수 '+(w.rn??'미제공')+(w.rn==null?'':'mm')+'</p>':'<p>이 지역의 현재 날씨 자료가 없어요.</p>')+'<p>'+hour+'</p>'+forecastCards(code)+'</li>';
  } else {
    const wet=rows.filter(([,v])=>v.pty>0);
    feedEl.innerHTML=forecastSummary()+'<li class="festival-card"><h3>가장 따뜻한 곳</h3>'+rows.slice(-3).reverse().map(line).join('')+'</li><li class="festival-card"><h3>가장 쌀쌀한 곳</h3>'+rows.slice(0,3).map(line).join('')+'</li>'+(wet.length?'<li class="festival-card"><h3>비·눈 오는 곳</h3>'+wet.map(line).join('')+'</li>':'');
  }
}
feedEl.addEventListener('click',e=>{if(e.target.closest('[data-weather-news]')) document.querySelector('[data-mode-choice="news"]').click();});
exploreTools.addEventListener('click',e=>{const b=e.target.closest('[data-legend]');if(b) exploreTools.querySelector('.legend-detail').textContent=b.dataset.legend;});
function stationText(s) { return '<p class="price-line"><strong class="price">'+money(s.price[fuelProduct])+(Number.isFinite(s.price[fuelProduct])?'<small>/L</small>':'')+'</strong> '+productName()+'</p><h3>'+escapeHtml(s.name)+'</h3><p>'+escapeHtml(({GSC:'GS칼텍스',SKE:'SK에너지',HDO:'HD현대오일뱅크',SOL:'S-OIL',RTE:'알뜰주유소',RTX:'알뜰주유소',NHO:'농협알뜰',ETC:'자가상표',E1G:'E1',SKG:'SK가스'})[s.brand] || s.brand || '상표 미제공')+'</p><p>'+escapeHtml(s.address || '주소 미제공')+'</p>'+(s.asOf&&validDate(new Date(s.asOf))?'<p class="fuel-asof">'+escapeHtml(new Date(s.asOf).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Seoul'}))+' 수집 값</p>':'')+routeLink(s); }
// 카카오맵 연결 (키·요금 없는 공개 링크). 앱이 있으면 앱, 없으면 웹. 누를 때만 외부로 나간다.
// 좌표가 있으면 그 지점을 도착지로 길찾기, 주소만 있으면 주소 검색.
function routeLink(s) {
  if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon)) return addressLink(s.address);
  const url = 'https://map.kakao.com/link/to/' + encodeURIComponent(String(s.name).replace(/,/g, ' ')) + ',' + s.lat + ',' + s.lon;
  return '<a class="food-map" href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">길찾기 ↗</a>';
}
function addressLink(address) {
  const q = String(address || '').replace(/\s*\(.*\)\s*$/, '').trim(); // 끝의 '(공덕동, 1층)' 같은 꼬리는 검색을 방해한다
  if (!q) return '';
  return '<a class="food-map" href="' + escapeHtml('https://map.kakao.com/link/search/' + encodeURIComponent(q)) + '" target="_blank" rel="noopener noreferrer">카카오맵에서 보기 ↗</a>';
}
function renderFuel() {
  const avg=fuelData.national[fuelProduct], local=selection && fuelData.sgg[selection.center.code]?.[fuelProduct];
  const diff=Number.isFinite(local)&&Number.isFinite(avg?.price)?local-avg.price:null;
  // 지역을 고르면 그 시·군·구 평균을 먼저, 전국 평균은 비교용. 직전 수집 값을 유지한 경우 그 기준 시각을 밝힌다.
  const kept=selection&&fuelData.asOf?.[selection.center.code]?.[fuelProduct], keptAt=kept&&new Date(kept);
  const missing=selection&&!Number.isFinite(local)?(fuelData.partial||fuelData.lastFailure||!fuelData.areas?' · 수집 실패로 받지 못했어요':' · 오피넷 자료에 없어요'):'';
  const regional=selection?'<p class="fuel-local">'+escapeHtml(label(selection.center))+' '+productName()+' 평균 <strong>'+(Number.isFinite(local)?money(local)+'/L':'미제공')+'</strong>'+missing+(diff===null?'':Math.abs(diff)<=5?' · 전국과 비슷해요(±5원 안)':' · 전국보다 '+money(Math.abs(diff))+(diff>0?' 비싸요':' 싸요'))+(validDate(keptAt)?' · '+escapeHtml(keptAt.toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Seoul'}))+' 수집 값':'')+'</p>':'';
  const daily=!Number.isFinite(avg?.diff)?'전일 자료 미제공':Math.abs(avg.diff)<1?'어제와 비슷':'어제보다 '+money(Math.abs(avg.diff))+(avg.diff>0?' ↑':' ↓');
  exploreTools.innerHTML='<div class="fuel-summary"><div>'+regional+'<p>전국 평균 <strong>'+money(avg?.price)+'</strong> · '+daily+'</p></div><div class="explore-toggle">'+['B027','D047'].map(p=>'<button type="button" data-product="'+p+'" aria-pressed="'+(fuelProduct===p)+'">'+(p==='B027'?'휘발유':'경유')+'</button>').join('')+'</div></div>'+sourceDisclosure('오피넷 '+(fuelData.date || '날짜 미제공')+' 기준','오피넷(한국석유공사) 기준 · '+(fuelData.date || '날짜 미제공')+' · 주유소가 알린 가격이라 실제와 다를 수 있어요 · 지도 색은 '+productName()+' 전국 평균 대비: '+['50원 넘게 쌈','10~50원 쌈','비슷(±10원)','10~50원 비쌈','50원 넘게 비쌈'].join(' → '),'<span class="fuel-legend" role="img" aria-label="지도 색: 전국 평균보다 쌀수록 초록, 비쌀수록 보라"><span>쌈</span>'+fuelColors.map(c=>'<i style="background:'+c+'"></i>').join('')+'<span>비쌈</span></span>');
  const rank=s=>!selection?0:String(s.sgg)===selection.center.code?0:String(s.sgg).slice(0,2)===selection.center.sido?1:2;
  const stations=fuelData.stations.filter(s=>Number.isFinite(s.price?.[fuelProduct]) && (!selection || rank(s)<2)).sort((a,b)=>rank(a)-rank(b)||a.price[fuelProduct]-b.price[fuelProduct]);
  feedEl.innerHTML='<li class="explore-source">시·도별 최저가 10곳만 보여줘요</li>'+stations.map(s=>'<li class="festival-card">'+stationText(s)+'</li>').join('')+(stations.length?'':'<li class="empty">이 지역의 해당 유종 최저가 목록이 없어요.</li>');
  for(const s of stations) {
    if(!Number.isFinite(s.lat)||!Number.isFinite(s.lon)||Math.abs(s.lat)>90||Math.abs(s.lon)>180) continue;
    L.marker([s.lat,s.lon],{title:s.name,icon:L.divIcon({className:'fuel-marker',html:'<span class="fuel-hit"><i></i></span>',iconSize:[44,44],iconAnchor:[22,22]})}).bindPopup(()=>nearbyStations(s,stations),{maxWidth:280}).addTo(fuelMarkers);
  }
}
// 44px 터치 상자가 겹치면 맨 위 점이 눌려 다른 주유소가 열린다(실측: 전국 화면 93% 오선택).
// 누른 점의 상자와 겹치는 주유소가 여럿이면 그 목록을 보여 주고 고르게 한다. 좌표·자료는 그대로.
function nearbyStations(s,stations){
  const p=map.latLngToContainerPoint([s.lat,s.lon]);
  const near=stations.filter(o=>Number.isFinite(o.lat)&&Number.isFinite(o.lon)).filter(o=>{const q=map.latLngToContainerPoint([o.lat,o.lon]);return Math.abs(q.x-p.x)<44&&Math.abs(q.y-p.y)<44;});
  if(near.length<=1) return stationText(s);
  near.sort((a,b)=>a.price[fuelProduct]-b.price[fuelProduct]);
  nearbyZoom=near;
  // 모두 담는다(목록 안에서 스크롤). 많으면 그곳으로 확대해 따로 고를 수 있게 한다.
  return '<p class="nearby-head">이 근처 주유소 '+near.length+'곳 · '+productName()+' 싼 순</p>'+(near.length>5?'<button type="button" class="nearby-zoom" data-nearby-zoom>이곳 확대해서 고르기</button>':'')+'<ul class="nearby-list">'+near.map(o=>'<li>'+stationText(o)+'</li>').join('')+'</ul>';
}
let nearbyZoom=null;
// 지도 팝업(주유소·주차·축제): 열릴 때 지도 조작부 아래·시트 위의 안전 영역으로 자동 이동하고, 그 높이를 넘으면 안에서 스크롤
// (예전에는 큰 팝업 윗부분이 헤더·조작부에 가렸다). Leaflet 1.9.4 내장본의 onAdd 앞에서 옵션만 바꾼다.
const popupOnAdd=L.Popup.prototype.onAdd;
L.Popup.include({onAdd(m){
  const top=document.querySelector('.controls').getBoundingClientRect().bottom+8;
  const bottom=mobileSheet.matches?sheetTarget()+12:12;
  this.options.autoPanPaddingTopLeft=L.point(12,top);
  this.options.autoPanPaddingBottomRight=L.point(12,bottom);
  this.options.maxHeight=Math.max(160,innerHeight-top-bottom-40);
  return popupOnAdd.call(this,m);
}});
document.addEventListener('click',e=>{if(!e.target.closest('[data-nearby-zoom]')||!nearbyZoom)return;const bnds=L.latLngBounds(nearbyZoom.map(o=>[o.lat,o.lon]));map.closePopup();userMovedMap();map.fitBounds(bnds,{paddingTopLeft:leftPad(),paddingBottomRight:bottomPad(),maxZoom:14,animate:!reducedMotion.matches});});
async function loadFood(code) {
  foodPending.add(code); foodErrors.delete(code);
  try {
    const r=await fetch('data/'+(DEMO?'demo-food/':'food/')+encodeURIComponent(code)+'.json',{cache:'no-store'});
    if(!r.ok) throw Error(); const data=await r.json(); if(!Array.isArray(data.items)) throw Error(); foodCache.set(code,data);
  } catch (_) { foodErrors.add(code); }
  foodPending.delete(code);
  if(mode==='explore'&&exploreLayer==='food'&&selection?.center.code===code) renderExplore();
}
// 소개된 식당(전국 일부 지역, 손으로 확인한 정적 목록). 식품안심업소와 다른 자료이며 좌표 없이 목록으로 제공한다.
let placesQuery='', placesSource='', placesShowAll=false, placesForCode;
const PLACE_SOURCE={video:'영상 소개',operator:'운영자 추천'};
function renderPlaces() {
  const all=placesData.items, code=selection?.center.code;
  if(placesForCode!==code) { placesForCode=code; placesShowAll=false; } // 지역을 바꾸면 선택 지역으로 다시 거른다
  const day=String(placesData.listCheckedAt||'').slice(5).replace('-','.');
  exploreTools.innerHTML=sourceDisclosure('전국 수록 '+all.length+'곳 · 목록 확인 '+day+' · 지역별 순차 제공','영상 소개는 공식 영상 설명란의 상호·주소를 확인한 곳, 운영자 추천은 날래 운영자의 주관적 의견이에요. 맛·위생·현재 영업을 보증하지 않으니 방문 전에 매장 정보를 확인해 주세요. 식품안심업소(위생등급)와는 다른 목록이에요. 수록 지역부터 순차 제공하며 전국 모든 식당 목록은 아니에요. 정렬: 지역·이름 순.')
    +'<div class="food-controls"><label class="food-search"><input aria-label="식당 이름 검색" type="search" data-places-search placeholder="식당 이름 검색" value="'+escapeHtml(placesQuery)+'"></label><div class="explore-toggle">'+['','video','operator'].map(k=>'<button type="button" data-places-source="'+k+'" aria-pressed="'+(placesSource===k)+'">'+(k?PLACE_SOURCE[k]:'전체')+'</button>').join('')+'</div></div>';
  exploreTools.querySelector('.source-disclosure p').textContent += ' · 지도 위치 확인 '+all.filter(x=>placeLocation(x)).length+'/'+all.length+'곳. 포인트는 장소 또는 주소 건물 위치이며 입구를 뜻하지 않아요. 좌표를 확인하지 못한 곳도 주소 목록에서 볼 수 있어요.';
  renderPlaceCards();
}
function renderPlaceCards() {
  const all=placesData.items, code=selection?.center.code;
  let head='';
  let list=all;
  if(code&&!placesShowAll) { list=all.filter(x=>x.sgg===code); head='<li class="explore-source">'+escapeHtml(label(selection.center))+' · 전체 '+all.length+'곳 중 '+list.length+'곳</li>'; }
  else head='<li class="explore-source">전국 수록 목록 '+all.length+'곳 · 지역·이름 순</li>';
  const q=placesQuery.trim().toLocaleLowerCase();
  const shown=list.filter(x=>(!placesSource||x.source.type===placesSource)&&(!q||(x.name+' '+(x.branch||'')).toLocaleLowerCase().includes(q)))
    .sort((a,b)=>a.district.localeCompare(b.district,'ko')||a.name.localeCompare(b.name,'ko'));
  const empty=!list.length&&code ? '<li class="empty">이 지역에는 아직 수록한 식당이 없어요(자료 없음이지 식당이 없다는 뜻은 아니에요).<div class="empty-actions"><button type="button" data-places-all>전국 수록 목록 보기</button></div></li>'
    : '<li class="empty">조건에 맞는 식당이 없어요.</li>';
  feedEl.innerHTML=head+(shown.map(placeCard).join('')||empty);
  renderPlaceMarkers(shown);
}
function placeLocation(x) {
  const p=placeLocations?.items?.[x.id];
  return p&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&p.lat>=33&&p.lat<=39&&p.lon>=124&&p.lon<=132?p:null;
}
function renderPlaceMarkers(shown) {
  placeMarkers.clearLayers();placeMarkerById.clear();map.attributionControl.removeAttribution(placeAttribution);
  if(mode!=='explore'||exploreLayer!=='places')return;
  const list=shown || [...feedEl.querySelectorAll('[data-place-id]')].map(el=>placesData.items.find(x=>x.id===el.dataset.placeId)).filter(Boolean);
  const groups=[];
  for(const x of list){const loc=placeLocation(x);if(!loc)continue;const pt=map.latLngToContainerPoint([loc.lat,loc.lon]);let g=groups.find(g=>g.pt.distanceTo(pt)<40);if(!g){g={pt,items:[]};groups.push(g);}g.items.push(x);}
  if(groups.length)map.attributionControl.addAttribution(placeAttribution);
  for(const g of groups){
    const bounds=L.latLngBounds(g.items.map(x=>{const p=placeLocation(x);return[p.lat,p.lon];}));
    const count=g.items.length;
    const marker=L.marker(bounds.getCenter(),{title:count>1?'식당 '+count+'곳':g.items[0].name,icon:L.divIcon({className:'place-map-marker',iconSize:[44,44],iconAnchor:[22,22],html:'<span>'+(count>1?count:'🍴')+'</span>'})}).addTo(placeMarkers);
    if(count>1 && map.getZoom()<13){marker.on('click',()=>{atHome=false;map.fitBounds(bounds,{paddingTopLeft:leftPad(),paddingBottomRight:bottomPad(),maxZoom:13,animate:!reducedMotion.matches});});}
    else marker.bindPopup(g.items.map(x=>'<strong>'+escapeHtml(x.name+(x.branch?' '+x.branch:''))+'</strong><p>'+escapeHtml(x.address)+'</p><button type="button" data-place-card="'+escapeHtml(x.id)+'">목록에서 보기</button>'+addressLink(x.address)).join('<hr>')+'<p class="place-checked">장소·건물 위치 · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap · ODbL</a></p>',{maxWidth:260});
    g.items.forEach(x=>placeMarkerById.set(x.id,marker));
  }
}
map.on('zoomend',()=>renderPlaceMarkers());
map.getContainer().addEventListener('click',e=>{const b=e.target.closest('[data-place-card]');if(!b)return;const el=[...feedEl.querySelectorAll('[data-place-id]')].find(el=>el.dataset.placeId===b.dataset.placeCard);if(el){setSheetStage(2);el.scrollIntoView({block:'nearest',behavior:'instant'});el.querySelector('[data-place-map]')?.focus({preventScroll:true});}});
function placeCard(x) {
  const src=x.source.type==='video'
    ? escapeHtml(x.source.channel||'영상')+' 영상 소개'+(x.source.url&&/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(x.source.url)?' · <a class="food-map" href="'+escapeAttr(x.source.url)+'" target="_blank" rel="noopener noreferrer">공식 영상 보기 ↗</a>':'')
    : '운영자 추천 · 주관적 의견';
  return '<li class="festival-card place-card" data-place-id="'+escapeHtml(x.id)+'"><h3>'+escapeHtml(x.name+(x.branch?' '+x.branch:''))+'</h3><p>'+escapeHtml(x.food||'음식 분류 미확인')+' · '+escapeHtml(x.district)+'</p><p class="card-address">'+escapeHtml(x.address)+'</p><p class="place-source">'+src+'</p>'+(placeLocation(x)?'<button type="button" data-place-map="'+escapeHtml(x.id)+'">지도에서 보기</button>':'<p class="place-checked">지도 위치 미확인 · 주소로 찾아보세요</p>')+addressLink(x.address)+'<p class="place-checked">정보 확인 '+escapeHtml(x.checkedAt)+'</p></li>';
}
feedEl.addEventListener('click',e=>{const b=e.target.closest('[data-place-map]');if(!b)return;const x=placesData?.items.find(x=>x.id===b.dataset.placeMap),p=x&&placeLocation(x);if(!p)return;atHome=false;selectionAutoFit=false;setSheetStage(0);clearTimeout(sheetFitTimer);map.setView([p.lat,p.lon],13,{animate:false});renderPlaceMarkers();placeMarkerById.get(x.id)?.openPopup();});
exploreTools.addEventListener('input',e=>{ if(e.target.matches('[data-places-search]')) { placesQuery=e.target.value; renderPlaceCards(); } });
exploreTools.addEventListener('click',e=>{ const b=e.target.closest('[data-places-source]'); if(!b) return; placesSource=b.dataset.placesSource; renderExplore(); });
feedEl.addEventListener('click',e=>{ if(mode==='explore'&&exploreLayer==='places'&&e.target.closest('[data-places-all]')) { placesShowAll=true; renderPlaceCards(); } });
function renderFood() {
  const code=selection?.center.code;
  if(foodCode!==code) { foodCode=code; foodQuery=''; foodKind=''; foodLimit=50; }
  const data=foodCache.get(code);
  const foodDay=(data?.updated || foodIndex.updated || '').slice(5,10).replace('-', '.');
  exploreTools.innerHTML=sourceDisclosure('위생등급 지정 업소 · 맛 평가 아님 · '+foodDay+' 기준','위생 상태를 확인해 지정한 음식점이에요. 맛이나 서비스 평가는 아니에요 · 식품안전나라 '+foodDay+' 기준');
  if(!code) { feedEl.innerHTML='<li class="empty">지도에서 시·군·구를 고르면 그 동네 식품안심업소를 보여드려요<div class="explore-toggle">'+favorites.map(r=>'<button type="button" data-food-region="'+escapeHtml(r.code)+'" aria-pressed="false">'+escapeHtml(r.name)+'</button>').join('')+'</div></li>'; return; }
  if(!data) {
    if(foodIndex.counts[code]===0 || !(code in foodIndex.counts)) { feedEl.innerHTML='<li class="empty">이 지역에 제공된 식품안심업소 자료가 없어요.</li>'; return; }
    feedEl.innerHTML='<li class="empty">'+(foodErrors.has(code)?'지역 자료를 받지 못했어요. <button type="button" data-food-retry>다시 받기</button>':'지역 자료를 불러오는 중이에요.')+'</li>';
    if(!foodPending.has(code)&&!foodErrors.has(code)) loadFood(code); return;
  }
  const kinds=[...new Set(data.items.map(x=>x.kind).filter(Boolean))];
  exploreTools.innerHTML+='<div class="food-controls"><label class="food-search"><input aria-label="업소 이름 검색" type="search" placeholder="업소 이름 검색" value="'+escapeHtml(foodQuery)+'"></label><div class="explore-toggle">'+['',...kinds].map(k=>'<button type="button" data-kind="'+escapeHtml(k)+'" aria-pressed="'+(foodKind===k)+'">'+escapeHtml(k || '전체')+'</button>').join('')+'</div></div>';
  renderFoodCards();
}
function renderFoodCards() {
  const data=foodCache.get(foodCode); if(!data) return;
  const list=data.items.filter(x=>(!foodKind||x.kind===foodKind)&&String(x.name).toLocaleLowerCase().includes(foodQuery.toLocaleLowerCase()));
  feedEl.innerHTML=list.slice(0,foodLimit).map(x=>{
    const name=String(x.name).replace(/^(?:(?:\((?:주|유)\)|㈜|㈲|주식회사|유한회사)\s*)+/,'');
    return '<li class="festival-card food-card"><h3>'+escapeHtml(name)+'</h3><p>'+escapeHtml(x.kind || '업종 미제공')+(x.level&&x.level!=='적합'?' <span class="festival-day">'+escapeHtml(x.level)+'</span>':'')+' · 지정 ~'+escapeHtml(x.to?x.to.replaceAll('-','.'):'기간 미제공')+'</p>'+'<p class="card-address">'+escapeHtml(x.address || '주소 미제공')+'</p>'+addressLink(x.address)+'</li>';
  }).join('') || '<li class="empty">조건에 맞는 업소가 없어요.</li>';
  if(list.length>foodLimit) feedEl.insertAdjacentHTML('beforeend','<li><button type="button" data-food-more>더 보기 ('+Math.min(foodLimit,list.length)+' / '+list.length+')</button></li>');
}
exploreTools.addEventListener('input',e=>{ if(exploreLayer==='food'&&e.target.matches('input')) { foodQuery=e.target.value; foodLimit=50; renderFoodCards(); } });
exploreTools.addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b) return;
  if(b.dataset.product) { fuelProduct=b.dataset.product; try { localStorage.setItem('nallae-fuel-product',fuelProduct); } catch (_) {} renderExplore(); }
  if(b.hasAttribute('data-kind')) { foodKind=b.dataset.kind; foodLimit=50; renderExplore(); }
});
feedEl.addEventListener('click',e=>{
  if(mode!=='explore'||exploreLayer!=='food') return;
  const b=e.target.closest('button'); if(!b) return;
  if(b.dataset.foodRegion) { const m=muniByCode.get(b.dataset.foodRegion); if(m) select(m,false); }
  if(b.hasAttribute('data-food-more')) { foodLimit+=50; renderFoodCards(); }
  if(b.hasAttribute('data-food-retry')) { loadFood(foodCode); renderExplore(); }
});

let festivals = [], festivalUpdated = null, festivalFailed = false, festivalLoaded = false;
let festivalMarkers = L.layerGroup(), celebrated = false, newsScroll = 0, festivalScroll = 0;
try { celebrated = sessionStorage.getItem('nallae-celebrated') === '1'; } catch (_) {}
const dayNumber = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? Date.parse(value + 'T00:00:00+09:00') / 86400000 : NaN;
const today = () => dayNumber(new Date().toLocaleDateString('sv-SE', {timeZone:'Asia/Seoul'}));
const festivalCodes = f => Array.isArray(f.sgg) ? f.sgg.map(String) : [String(f.sgg || '')];
const emergencyCodes = () => new Set(items.filter(it => ['critical','urgent'].includes(it.urgency)).flatMap(it => itemMunis(it).map(m => m.code)));
const restrained = (f, codes) => festivalCodes(f).some(c => codes.has(c));
function festivalList() {
  const now = today();
  return festivals.filter(f => dayNumber(f.end) >= now && dayNumber(f.start) <= now + 30 && (!selection || festivalCodes(f).some(c => selection.codes.has(c)))).sort((a,b) => {
    const rank = f => dayNumber(f.end)-dayNumber(f.start)+1 >= 30 ? 2 : dayNumber(f.start) <= now ? 0 : 1;
    return rank(a)-rank(b) || (rank(a) === 0 ? dayNumber(a.end)-dayNumber(b.end) : dayNumber(a.start)-dayNumber(b.start)) || String(a.name).localeCompare(String(b.name),'ko');
  });
}
async function loadFestivals() {
  try {
    const res = await fetch(DEMO ? 'data/demo-festivals.json' : 'data/festivals.json', {cache:'no-store'});
    if (!res.ok) throw new Error('festival response');
    const data = await res.json();
    if (!Array.isArray(data.items)) throw new Error('festival data');
    festivals = data.items.filter(f => f && typeof f.name === 'string' && Number.isFinite(dayNumber(f.start)) && dayNumber(f.end) >= dayNumber(f.start));
    festivalUpdated = new Date(data.updated); festivalFailed = false; festivalLoaded = true;
  } catch (_) { festivalFailed = true; }
  if (mode === 'explore' && exploreLayer === 'festival') renderExplore();
}
function updateFestivalStatus() {
  const stale = !validDate(festivalUpdated) || Date.now()-festivalUpdated >= 86400000;
  const status = document.getElementById('collection-status');
  status.textContent = festivalFailed ? '갱신 실패' : validDate(festivalUpdated) ? ago(festivalUpdated) : '확인 중';
  status.classList.toggle('failed',festivalFailed); status.classList.toggle('stale',!festivalFailed && stale);
  status.setAttribute('aria-label','축제 수집 상태: ' + status.textContent + '. 상세 보기');
  const alert = document.getElementById('collection-alert');
  alert.hidden = !festivalFailed && !stale;
  setAlert(festivalFailed ? 'failed' : 'stale', festivalFailed ? (festivalLoaded ? '축제를 새로 확인하지 못했어요 · 이전 자료를 보여 줘요' : '축제 자료를 불러오지 못했어요') : '축제 자료가 ' + (validDate(festivalUpdated) ? ago(festivalUpdated) + ' 기준이에요' : '확인 시각이 없어요'), '자세히');
  document.getElementById('sources-detail').innerHTML = '<p>전국문화축제표준데이터</p><p>확인 시각: ' + escapeHtml(validDate(festivalUpdated) ? festivalUpdated.toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}) : '미제공') + '</p><p>진행 중 · 30일 안 시작하는 축제예요. 일정은 누리집에서 다시 확인해 주세요.</p>' + (festivalFailed ? '<p>새로 확인하지 못했어요. 이전 자료가 있으면 유지해요.</p>' : '');
  noteExploreMissing();
}
function renderFestivals() {
  // 상단 유머 문구는 '보고 있는 지역'(선택 지역+맞닿은 곳)에 위급·긴급 소식이 있을 때만 끈다. 카드별 억제는 따로(restrained).
  const list = festivalList(), codes = emergencyCodes(), quiet = loadFailed || !lastChecked || (!!selection && [...selection.codes].some(c => codes.has(c)));
  titleEl.textContent = selection ? regionTitle(selection.center) + ' 주변 축제' : '동네 탐험';
  const now = today(), ongoing = list.filter(f => dayNumber(f.start) <= now).length;
  const weekday = new Date((now + 9/24) * 86400000).getUTCDay();
  subEl.textContent = quiet ? '진행 중 · 30일 안 시작하는 축제예요' : !ongoing ? '지금은 쉬어 가는 중이에요. 다가올 축제를 만나 보세요.' : [0,5,6].includes(weekday) ? '이번 주말, 동네가 들썩여요' : '퇴근길에 들러볼 축제가 ' + ongoing + '곳 있어요';
  syncCategories(); newButton.hidden = true; updateFestivalStatus();
  const scroll = feedEl.scrollTop;
  const date = v => (v.slice(0,4) === new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}).slice(0,4) ? '' : v.slice(0,4) + '.') + Number(v.slice(5,7)) + '.' + Number(v.slice(8)) + '(' + '일월화수목금토'[new Date(v+'T00:00:00Z').getUTCDay()] + ')';
  const card = f => {
    const muted = restrained(f,codes), end = dayNumber(f.end), start = dayNumber(f.start);
    const badge = end === now ? '오늘 끝나요' : start <= now ? '진행 중' : 'D-' + Math.ceil(start-now);
    const region = festivalCodes(f).map(c => muniByCode.get(c)).filter(Boolean).map(label).join(', ');
    return '<li class="festival-card" data-festival="' + escapeAttr(f.id) + '"><details><summary><span class="festival-day ' + (end === now ? 'ending' : start <= now ? 'ongoing' : '') + '">' + badge + '</span><h3>' + escapeHtml(f.name) + '</h3><p>' + date(f.start) + ' – ' + date(f.end) + '</p><p class="festival-place">' + escapeHtml((f.place || f.address || '장소 미제공') + (region ? ' · ' + region : '')) + '</p>' + (f.content ? '<p class="festival-content">' + escapeHtml(f.content) + '</p>' : '') + (muted ? '<p class="festival-notice">이 지역에 긴급 소식이 있어요</p>' : end === now && !quiet ? '<p>오늘이 마지막 날이에요, 날래 가세요!</p>' : '') + '</summary><div class="festival-detail"><p>주최: ' + escapeHtml(f.host || '미제공') + '</p><p>전화: ' + escapeHtml(f.phone || '미제공') + '</p>' + (/^https?:\/\//i.test(f.url || '') ? '<a href="' + escapeAttr(f.url) + '" target="_blank" rel="noopener">누리집 ↗</a>' : '') + routeLink(f) + '<p class="src">출처: 전국문화축제표준데이터</p></div></details></li>';
  };
  const regular = list.filter(f => dayNumber(f.end)-dayNumber(f.start)+1 < 30), long = list.filter(f => dayNumber(f.end)-dayNumber(f.start)+1 >= 30);
  feedEl.innerHTML = regular.map(card).join('') + (long.length ? '<li class="festival-group"><details><summary>상시 진행 ' + long.length + '건</summary><ul>' + long.map(card).join('') + '</ul></details></li>' : '') || '<li class="empty"><p>' + (festivalFailed ? '축제를 불러오지 못했어요. 잠시 후 다시 확인해 주세요.' : !festivalLoaded ? '축제를 불러오는 중이에요.' : '진행 중이거나 30일 안에 시작하는 축제가 없어요.') + '</p><p>출처: 전국문화축제표준데이터 · 선택 지역과 맞닿은 지역 포함</p></li>';
  feedEl.scrollTop = scroll;
  renderFestivalMarkers();
  if (!celebrated && festivalLoaded) {
    celebrated = true;
    try { sessionStorage.setItem('nallae-celebrated','1'); } catch (_) {}
    if (!quiet && !decorationsPaused() && !reducedMotion.matches && list.length) {
      const confetti = document.createElement('div'); confetti.className = 'festival-confetti'; confetti.setAttribute('aria-hidden','true');
      confetti.innerHTML = Array.from({length:12},(_,i) => '<i style="--i:' + i + '"></i>').join('');
      panel.append(confetti); setTimeout(() => confetti.remove(),950);
    }
  }
}
function renderFestivalMarkers() {
  festivalMarkers.clearLayers();
  if (mode !== 'explore' || exploreLayer !== 'festival') return;
  const codes = emergencyCodes(), groups = [], zoomed = map.getZoom() >= MUNI_ZOOM;
  for (const f of festivalList()) {
    if (typeof f.lat !== 'number' || typeof f.lon !== 'number' || !Number.isFinite(f.lat) || !Number.isFinite(f.lon) || Math.abs(f.lat)>90 || Math.abs(f.lon)>180) continue;
    const at = [f.lat,f.lon], pt = map.latLngToContainerPoint(at);
    let group = groups.find(g => g.pt.distanceTo(pt)<44);
    if (!group) { group = {pt,at,items:[]}; groups.push(group); } group.items.push(f);
  }
  for (const g of groups) {
    const muted = g.items.some(f => restrained(f,codes));
    const svg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 20 2-12 7 7-9 5ZM12 4l1-3m4 7 4-1M8 5 6 3m12 10 3 2M15 6l3-3"/></svg>';
    const count = g.items.length, size = Math.min(36,24 + Math.floor(Math.log2(count))*3);
    const html = count > 1 ? '<b class="festival-cluster" style="width:' + size + 'px;height:' + size + 'px">' + count + '</b>' : zoomed ? svg : '<i class="festival-dot"></i>';
    const bounds = L.latLngBounds(g.items.map(f => [f.lat,f.lon]));
    const marker = L.marker(bounds.getCenter(),{icon:L.divIcon({className:'festival-marker',html:'<span class="festival-pin">' + html + '</span>',iconSize:[44,44],iconAnchor:[22,22]}),title:g.items.map(f=>f.name).join(' · ') + (count > 1 ? ' · 눌러서 확대해요' : '') + (muted ? ' · 이 지역에 긴급 소식이 있어요' : '')}).addTo(festivalMarkers);
    if (count > 1) {
      marker.on('click', () => { atHome=false; moveToBounds(bounds,{paddingTopLeft:leftPad(),paddingBottomRight:bottomPad(),maxZoom:Math.min(13,map.getZoom()+2),duration:.6}); });
      if (map.getZoom() < 13) continue;
    }
    const popup = document.createElement('div');
    g.items.forEach(f => { const p=document.createElement('p'); p.textContent=f.name; popup.append(p); popup.insertAdjacentHTML('beforeend', routeLink(f)); });
    if (muted) { const p=document.createElement('p'); p.textContent='이 지역에 긴급 소식이 있어요'; popup.append(p); }
    marker.bindPopup(popup);
  }
}
function applyMode() {
  rootMode();
  placeMarkers.clearLayers();map.attributionControl.removeAttribution(placeAttribution);
  updateRainScene();
  exploreTools.hidden=mode!=='explore'; fuelMarkers.clearLayers(); parkingMarkers.clearLayers(); careMarkers.clearLayers(); earthquakeMarkers.clearLayers();
  document.querySelectorAll('[data-mode-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.modeChoice===mode)));
  map.closePopup(); bubbleEl.hidden = true; bubbleAt = null; bubbleUntil = 0; replayEl.hidden = true;
  map.getPane('pulses').style.display = mode === 'explore' ? 'none' : '';
  if (mode === 'explore') festivalMarkers.addTo(map); else map.removeLayer(festivalMarkers);
  document.getElementById('map-legend').hidden = mode === 'explore';
  munis.forEach(m => { clearTimeout(m.flashTimer); m.flashing=false; m.layer.getElement()?.classList.remove('flash'); restyle(m); });
  syncCategories(); renderFeed(); fitSheet();
}
document.querySelectorAll('[data-mode-choice]').forEach(b=>b.addEventListener('click',()=>{
  if (mode === b.dataset.modeChoice) return;
  if (mode === 'news') newsScroll=feedEl.scrollTop; else festivalScroll=feedEl.scrollTop;
  mode=b.dataset.modeChoice;
  try { localStorage.setItem('nallae-mode',mode); } catch (_) {}
  applyMode(); feedEl.scrollTop=mode==='news' ? newsScroll : festivalScroll;
}));
map.on('moveend zoomend',renderFestivalMarkers);
fetch('data/regions.json')
  .then((r) => r.json())
  .then((topo) => {
    setupRegions(topo);
    initFavorites();
    if (params.has('debug')) window.nallae = { map, munis, sidos };
    if (DEMO && muniByCode.has(params.get('near'))) {
      const m = muniByCode.get(params.get('near'));
      locateBtn.classList.add('active');
      meMarker = L.marker(m.center, {
        pane: 'pulses', interactive: false,
        icon: L.divIcon({ className: '', iconSize: [0, 0], html: '<div class="pulse me"><span class="ring"></span><span class="dot"></span></div>' }),
      }).addTo(map);
      select(m, true);
    }
    applyMode();
    loadFestivals();
    loadExploreData();
    setInterval(loadFestivals, POLL_MS);
    load().then(() => {
      if (DEMO && params.has('open')) {
        const first = items.find(visible);
        if (first) { openId = first.id; renderFeed(); }
      }
    });
    setInterval(load, POLL_MS);
    setInterval(updateTimes, 30000); // "n분 전" 갱신
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { load(); loadFestivals(); } });
    // 다시 연결되면 바로 새로 받는다(예전에는 다음 주기까지 '인터넷에 연결되지 않았어요'가 남았다). 끊기면 안내를 바로 바꾼다.
    window.addEventListener('online', () => { load(); loadFestivals(); });
    window.addEventListener('offline', () => { if (mode === 'news') updateTimes(); });
  })
  .catch(() => toast('지도를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'));

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
function centroid(geom) {
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

// PC 마우스로도 가로 칩 줄을 넘길 수 있게: 끌기 + 세로 휠 → 가로 이동 (터치는 브라우저 기본 스크롤)
const H_SCROLL = '.chips, .favorites, .filter-row, .food-controls';
// 줄 안에 줄이 있을 수 있다(.filter-row > .chips) → 실제로 넘치는 가장 가까운 줄
const scrollRow = (el) => {
  for (let r = el?.closest?.(H_SCROLL); r; r = r.parentElement?.closest(H_SCROLL)) if (r.scrollWidth > r.clientWidth) return r;
  return null;
};
let hDrag = null;
document.addEventListener('pointerdown', (e) => {
  const row = e.pointerType === 'mouse' && e.button === 0 && scrollRow(e.target);
  if (!row || e.target.closest('input, textarea, select')) return;
  hDrag = { row, x: e.clientX, left: row.scrollLeft, moved: false };
});
window.addEventListener('pointermove', (e) => {
  if (!hDrag) return;
  const dx = e.clientX - hDrag.x;
  if (!hDrag.moved && Math.abs(dx) < 6) return; // 살짝 흔들린 클릭은 그대로 클릭
  hDrag.moved = true;
  hDrag.row.classList.add('dragging');
  hDrag.row.scrollLeft = hDrag.left - dx;
});
window.addEventListener('pointerup', () => {
  if (!hDrag) return;
  const { row, moved } = hDrag;
  hDrag = null;
  row.classList.remove('dragging');
  // 끌기를 끝낸 자리의 칩이 눌리지 않게 바로 뒤 클릭 한 번을 막는다
  if (moved) window.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); }, { capture: true, once: true });
});
document.addEventListener('wheel', (e) => {
  const row = scrollRow(e.target);
  if (!row || e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
  const max = row.scrollWidth - row.clientWidth;
  if ((e.deltaY < 0 && row.scrollLeft <= 0) || (e.deltaY > 0 && row.scrollLeft >= max - 1)) return; // 끝에 닿으면 원래대로 세로 스크롤
  row.scrollLeft += e.deltaY;
  e.preventDefault();
}, { passive: false });
})();

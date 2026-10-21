(() => {
'use strict';
const params = new URLSearchParams(location.search);
const DEMO = params.has('demo');
let mode = 'news';
try { if (localStorage.getItem('nallae-mode') === 'explore') mode = 'explore'; } catch (_) {}
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

const leftPad = () => (window.innerWidth >= 760 ? [370, 70] : [10, Math.min(110, Math.max(0, panel.getBoundingClientRect().top - 30))]);
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
let selection = null; // { center, codes:Set, fromLocation }
let category = null;
let meMarker = null;

const isSelected = (m) => !!selection && selection.codes.has(m.code);
function restyle(m) {
  if (!m.layer) return;
  const fuelFill = mode === 'explore' && exploreLayer === 'fuel' ? fuelColor(m.code) : mode === 'explore' && exploreLayer === 'weather' ? weatherColor(m.code) : null;
  const fill = fuelFill ? {fillColor:fuelFill,fillOpacity:root.dataset.theme==='dark'?.24:.72} : mode === 'news' && m.warning ? {fillColor:token(m.warning),fillOpacity:.18} : {fillColor:(mode === 'explore' && exploreLayer === 'food' ? selection?.center === m : isSelected(m)) ? token('selection-fill') : baseStyle.fillColor,fillOpacity:1};
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
  atHome = false;
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

const bubbleEl = document.createElement('div');
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
  if(item.src==='eqk') bubbleEl.innerHTML+='<span class="bubble-quake-detail">'+escapeHtml(item.body?.split(' · ')[0] || '진도 미제공')+' · '+escapeHtml(new Date(item.time).toLocaleString('ko-KR'))+'</span>';
  bubbleEl.hidden = false;
  placeMapOverlays();
  bubbleTimer = setTimeout(() => { bubbleEl.hidden = true; bubbleAt = null; bubbleUntil = 0; }, item.urgency === 'critical' ? 4000 : 2800);
}
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
    const marker=L.marker([it.lat,it.lon],{pane:'pulses',title:it.title,icon:L.divIcon({className:'earthquake-marker',iconSize:[size,size],iconAnchor:[size/2,size/2],html:'<span class="earthquake-pin'+(Date.now()-new Date(it.time)>86400000?' faded':'')+'" style="--eq-size:'+size+'px"><i></i><b>M'+escapeHtml(Number(it.mag).toFixed(1))+'</b></span>'})}).addTo(earthquakeMarkers);
    marker.on('click',()=>{pending.delete(it.id);openId=it.id;bubbleUntil=0;renderFeed(null,true);feedEl.querySelector('[data-id="'+it.id+'"]')?.scrollIntoView({block:'nearest'});showMapBubble(it,L.latLng(it.lat,it.lon));});
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
const pending = new Set();
const newButton = document.getElementById('new-items');
newButton.addEventListener('click', () => { pending.clear(); renderFeed(); feedEl.scrollTop = 0; });
function updateTimes() {
  if (mode === 'explore') { updateExploreStatus(); return; }
  feedEl.querySelectorAll('time').forEach(el => { el.textContent = ago(new Date(el.dateTime)); });
  const status = document.getElementById('collection-status');
  const states = ['sms','wrn','brief'].map(sourceState);
  const failed = loadFailed || states.some(s => s.rank === 2);
  const stale = states.some(s => s.rank === 1) || !validDate(updatedAt) || Date.now()-updatedAt >= 1800000;
  status.classList.toggle('failed', failed);
  status.classList.toggle('stale', !failed && stale);
  const statusText = loadFailed ? (lastChecked ? '마지막 확인 ' + lastChecked.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false}) + ' · ' : '') + '새로 고치지 못했어요' : (failed ? '출처 오류' : stale ? '갱신 지연' : '정상') + ' · ' + (validDate(updatedAt) ? ago(updatedAt) : '시각 미제공');
  status.textContent = validDate(updatedAt) ? ago(updatedAt) : '시각 미제공';
  status.setAttribute('aria-label', statusText + '. 출처별 수집 상태 보기');
  const alert = document.getElementById('collection-alert');
  alert.hidden = !failed && !stale;
  alert.textContent = failed ? '새 소식을 확인하지 못한 출처가 있어요.' : '소식 갱신이 늦어지고 있어요.';
  alert.classList.toggle('failed', failed);
  document.getElementById('sources-detail').innerHTML = sourceStatus() + '<p>' + escapeHtml(statusText) + '</p>';
}
const validDate = d => d instanceof Date && Number.isFinite(d.getTime());
function sourceState(key) {
  const v = sources[key], at = new Date(v?.at);
  if (v?.ok === false) return {rank:2,text:'오류 · 마지막 성공 시각은 확인할 수 없어요'};
  if (v?.ok !== true || !validDate(at)) return {rank:1,text:'지연 · 마지막 성공 시각 미제공'};
  return {rank:Date.now()-at >= 1800000 ? 1 : 0,text:(Date.now()-at >= 1800000 ? '지연' : '정상') + ' · 마지막 성공 ' + ago(at)};
}
function sourceStatus() {
  const names = {sms:'긴급재난문자',wrn:'기상특보',eqk:'지진정보',brief:'정책브리핑'};
  return ['sms','wrn','eqk','brief'].map(key => {
    const v = sources[key];
    return '<p class="source-status"><strong>' + names[key] + '</strong><br>' + sourceState(key).text + (v?.at ? '<br>확인 시각: ' + escapeHtml(v.at) : '') + (v?.note ? '<br>' + escapeHtml(v.note) : '') + '</p>';
  }).join('');
}
function card(it) {
  const open = it.id === openId;
  return '<button type="button" class="card-toggle" aria-expanded="' + open + '"><span class="meta">' + urgencyBadge(it) + '<span class="category-label">' + icon(it.cat) + escapeHtml(it.cat) + '</span><span class="place-label">' + escapeHtml(placeLabel(it)) + '</span><time datetime="' + escapeHtml(it.time) + '">' + ago(new Date(it.time)) + '</time></span><span class="title">' + escapeHtml(it.title) + '</span></button>' + (open ? detail(it) : '');
}
function renderFeed(newIds, preserve = false) {
  if (mode === 'explore') { renderExplore(); return; }
  renderEarthquakes();
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
  const opened = items.find(it => it.id === openId && visible(it) && !pending.has(it.id));
  if (opened && (category || opened.cat !== '정책') && !list.includes(opened)) list.push(opened);
  const existing = new Map([...feedEl.querySelectorAll('li[data-id]')].map(el => [el.dataset.id,el]));
  const desired = [];
  for (const it of list) {
    let li = existing.get(it.id);
    if (!li) { li = document.createElement('li'); li.dataset.id = it.id; }
    const signature = JSON.stringify(it) + (it.id === openId) + placeLabel(it);
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
  return '<div class="detail">' + (it.body ? '<p>' + escapeHtml(it.body) + '</p>' : '') + '<div class="src"><span>출처: ' + escapeHtml(it.source || '미제공') + (it.license ? ' · ' + escapeHtml(it.license) : '') + '</span><span>표시 근거: ' + escapeHtml(it.urgencyBasis || '구분 미제공') + (it.src==='eqk'?'</span><span>기상청 지진정보 · 진앙 위치는 발표 좌표':'') + '</span>' + (it.url ? '<a href="' + escapeAttr(it.url) + '" target="_blank" rel="noopener">원문 보기 ↗</a>' : '') + '</div></div>';
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
  if (mode === 'explore') { if (b.dataset.layer) { exploreLayer=b.dataset.layer; try { localStorage.setItem('nallae-explore-layer',exploreLayer); } catch (_) {} map.closePopup(); feedEl.scrollTop=0; renderExplore(); } return; }
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
function sheetHeights() {
  const full = Math.max(0, innerHeight - document.querySelector('.topbar').getBoundingClientRect().bottom - 8);
  const folded = handle.offsetHeight + sheetHead.offsetHeight + favoritesRow.offsetHeight + parseFloat(getComputedStyle(panel).paddingBottom);
  const low = Math.min(folded, full);
  return [low, Math.min(full, Math.max(low, innerHeight * .48)), full];
}
function feedTouchAction() {
  feedEl.classList.toggle('sheet-pull', mobileSheet.matches && sheetStage === 2 && feedEl.scrollTop <= 0);
}
function setSheetStage(stage, remember = true) {
  clearTimeout(sheetFitTimer);
  sheetStage = stage;
  panel.classList.remove('sheet-dragging');
  panel.dataset.sheetStage = stages[stage];
  handle.setAttribute('aria-label', '소식 목록 높이: ' + stageNames[stage] + '. 누르면 다음 높이로 바뀌어요');
  handle.setAttribute('aria-controls', 'feed');
  [chipsEl, feedEl, document.getElementById('new-items')].forEach(el => { el.inert = mobileSheet.matches && stage === 0; });
  if (mobileSheet.matches) panel.style.height = sheetHeights()[stage] + 'px';
  else panel.style.removeProperty('height');
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
  if (fromFeed ? sheetStage !== 2 || feedEl.scrollTop > 0 : !e.target.closest('.panel-handle, .panel-head')) return;
  if (!fromFeed && e.target.closest('button, a, input') && e.target !== handle) return;
  suppressSheetClick = false;
  sheetDrag = { id:e.pointerId, x:e.clientX, y:e.clientY, lastY:e.clientY, time:e.timeStamp,
    velocity:0, height:panel.getBoundingClientRect().height, fromFeed, active:false };
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
function resizeSheet() {
  const id = sheetDrag?.id;
  sheetDrag = null;
  if (id !== undefined && panel.hasPointerCapture(id)) panel.releasePointerCapture(id);
  setSheetStage(sheetStage, false);
}
window.addEventListener('resize', resizeSheet);
mobileSheet.addEventListener('change', resizeSheet);
const sheetContentObserver = new ResizeObserver(() => { if (!sheetDrag) setSheetStage(sheetStage, false); });
[sheetHead, favoritesRow, document.querySelector('.topbar')].forEach(el => sheetContentObserver.observe(el));
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
﻿let exploreLayer='festival', fuelProduct='B027', fuelData=null, foodIndex=null, weatherData=null, forecastData=null;
try { exploreLayer=localStorage.getItem('nallae-explore-layer') || 'festival'; fuelProduct=localStorage.getItem('nallae-fuel-product') === 'D047' ? 'D047' : 'B027'; } catch (_) {}
const preferredExploreLayer=exploreLayer;
const foodCache=new Map(), foodPending=new Set(), foodErrors=new Set();
let foodQuery='', foodKind='', foodLimit=50, foodCode=null;
const fuelMarkers=L.layerGroup().addTo(map);
const exploreTools=document.createElement('div'); exploreTools.className='explore-tools';
feedEl.before(exploreTools);
const fuelColors=['#b5d9d1','#c7ded5','#e0e4da','#d7dce6','#d9cee5'];
const productName=()=>fuelProduct==='B027'?'휘발유':'경유';
const money=v=>Number.isFinite(v)?v.toLocaleString('ko-KR',{maximumFractionDigits:0})+'원':'미제공';
const availableLayers=()=>[['festival','축제',festivals.length],['weather','날씨',weatherData],['fuel','주유소',fuelData],['food','식품안심업소',foodIndex]].filter(x=>x[2]);
function fuelColor(code) {
  const price=fuelData?.sgg?.[code]?.[fuelProduct], avg=fuelData?.national?.[fuelProduct]?.price;
  if (!Number.isFinite(price) || !Number.isFinite(avg)) return null;
  const d=price-avg; return fuelColors[d < -50?0:d < -10?1:d <= 10?2:d <= 50?3:4];
}
async function loadExploreData() {
  await Promise.all(['fuel','food/index','weather','forecast'].map(async key=>{
    try {
      const r=await fetch('data/'+(DEMO?(key==='food/index'?'demo-food/index':'demo-'+key):key)+'.json',{cache:'no-store'});
      if (!r.ok) throw Error(); const data=await r.json();
      if(key==='fuel' && data.sgg && Array.isArray(data.stations) && data.national) fuelData=data;
      if(key==='weather' && data.sgg) weatherData=data;
      if(key==='forecast' && data.sgg) forecastData=data;
      if(key==='food/index' && data.counts) foodIndex=data;
    } catch (_) {}
  }));
  if(availableLayers().some(x=>x[0]===preferredExploreLayer)) exploreLayer=preferredExploreLayer;
  if(mode==='explore') renderExplore();
}
function updateExploreStatus() {
  if(exploreLayer==='festival') return updateFestivalStatus();
  const data=exploreLayer==='fuel'?fuelData:exploreLayer==='weather'?weatherData:foodIndex, date=new Date(data?.updated);
  const status=document.getElementById('collection-status'), stale=!validDate(date)||Date.now()-date>(exploreLayer==='weather'?2:exploreLayer==='fuel'?6:48)*3600000;
  status.textContent=validDate(date)?ago(date):'확인 중'; status.classList.remove('failed'); status.classList.toggle('stale',stale);
  status.setAttribute('aria-label','자료 확인 시각: '+status.textContent+'. 상세 보기');
  const alert=document.getElementById('collection-alert'); alert.hidden=!stale; alert.classList.remove('failed'); alert.textContent='자료 갱신 시각을 확인해 주세요.';
  document.getElementById('sources-detail').textContent=(exploreLayer==='weather'?'기상청 초단기실황':exploreLayer==='fuel'?'오피넷(한국석유공사)':'식품안전나라(식품의약품안전처)')+' · 확인 시각: '+(validDate(date)?date.toLocaleString('ko-KR'):'미제공');
}
function renderExplore() {
  const available=availableLayers();
  if(!available.some(x=>x[0]===exploreLayer)) exploreLayer=available[0]?.[0] || 'festival';
  exploreTools.hidden=mode!=='explore'; exploreTools.innerHTML=''; fuelMarkers.clearLayers(); festivalMarkers.clearLayers();
  munis.forEach(restyle); scheduleLabels();
  if(mode!=='explore') return;
  if(exploreLayer==='festival') return renderFestivals();
  syncCategories(); newButton.hidden=true; updateExploreStatus();
  titleEl.textContent=selection?label(selection.center):'동네 탐험';
  subEl.textContent=exploreLayer==='weather'?'현재 동네 날씨':exploreLayer==='fuel'?'지역 평균과 최저가 주유소':'동네 식품안심업소';
  if(exploreLayer==='weather') renderWeather(); else if(exploreLayer==='fuel') renderFuel(); else renderFood();
}
function sourceDisclosure(text) { return '<details class="source-disclosure"><summary>'+escapeHtml(text)+'</summary><p>'+escapeHtml(text)+'</p></details>'; }
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
function forecastHour() {
 const date=new Date(forecastData?.base);
 return validDate(date)?'단기예보 '+String((date.getUTCHours()+9)%24).padStart(2,'0')+'시 발표':'단기예보 발표 시각 미제공';
}
function forecastCards(code) {
 if(!forecastData) return '';
 return '<div class="forecast-days">'+[0,1].map(offset=>{
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
  const hour=validDate(new Date(weatherData.base))?new Date(weatherData.base).getHours()+'시 발표':'발표 시각 미제공';
  exploreTools.innerHTML=sourceDisclosure('기상청 초단기실황 · '+hour+(forecastData?' · '+forecastHour():'')+' · 시·군·구 대표 지점 격자(5km) 값이라 동네 안에서도 다를 수 있어요')+'<div class="weather-legend">차가움 <i></i> 따뜻함</div>';
  const rows=Object.entries(weatherData.sgg).filter(([c,v])=>muniByCode.has(c)&&Number.isFinite(v.t)).sort((a,b)=>a[1].t-b[1].t);
  const line=([c,v])=>'<p>'+escapeHtml(label(muniByCode.get(c)))+' <strong>'+v.t+'°</strong>'+(v.pty>0?' '+precipSymbol(v.pty):'')+'</p>';
  if(code) {
    const warning=items.some(it=>it.src==='wrn'&&it.level!=='예비특보'&&it.onMap!==false&&(it.sgg?.includes(code)||it.sido?.includes(region?.sido)));
    feedEl.innerHTML=(warning?'<li><button class="weather-warning" type="button" data-weather-news>기상특보 발효 중 — 소식 탭에서 보기</button></li>':'')+'<li class="festival-card weather-card"><h3>'+escapeHtml(region?label(region):code)+'</h3>'+(w&&Number.isFinite(w.t)?'<strong class="temperature">'+w.t+'°</strong> '+(w.pty>0?precipSymbol(w.pty):'')+'<p>습도 '+(w.reh??'미제공')+(w.reh==null?'':'%')+' · 바람 '+(w.wsd??'미제공')+(w.wsd==null?'':'m/s')+' · 1시간 강수 '+(w.rn??'미제공')+(w.rn==null?'':'mm')+'</p>':'<p>이 지역의 현재 날씨 자료가 없어요.</p>')+'<p>'+hour+'</p>'+forecastCards(code)+'</li>';
  } else {
    const wet=rows.filter(([,v])=>v.pty>0);
    feedEl.innerHTML=forecastSummary()+'<li class="festival-card"><h3>가장 따뜻한 곳</h3>'+rows.slice(-3).reverse().map(line).join('')+'</li><li class="festival-card"><h3>가장 쌀쌀한 곳</h3>'+rows.slice(0,3).map(line).join('')+'</li>'+(wet.length?'<li class="festival-card"><h3>비·눈 오는 곳</h3>'+wet.map(line).join('')+'</li>':'');
  }
}
feedEl.addEventListener('click',e=>{if(e.target.closest('[data-weather-news]')) document.querySelector('[data-mode-choice="news"]').click();});
exploreTools.addEventListener('click',e=>{const b=e.target.closest('[data-legend]');if(b) exploreTools.querySelector('.legend-detail').textContent=b.dataset.legend;});
function stationText(s) { return '<h3>'+escapeHtml(s.name)+'</h3><p>'+escapeHtml(({GSC:'GS칼텍스',SKE:'SK에너지',HDO:'HD현대오일뱅크',SOL:'S-OIL',RTE:'알뜰주유소',RTX:'알뜰주유소',NHO:'농협알뜰',ETC:'자가상표',E1G:'E1',SKG:'SK가스'})[s.brand] || s.brand || '상표 미제공')+' · <strong>'+money(s.price[fuelProduct])+'</strong></p><p>'+escapeHtml(s.address || '주소 미제공')+'</p>'; }
function renderFuel() {
  const avg=fuelData.national[fuelProduct], local=selection && fuelData.sgg[selection.center.code]?.[fuelProduct];
  const diff=Number.isFinite(local)&&Number.isFinite(avg?.price)?local-avg.price:null;
  const regional=selection?'<p>'+escapeHtml(selection.center.name)+' 평균 <strong>'+money(local)+'</strong>'+(diff===null?'':Math.abs(diff)<=5?' · 전국과 비슷해요(±5원 안)':' · 전국보다 '+money(Math.abs(diff))+(diff>0?' 비싸요':' 싸요'))+'</p>':'';
  const daily=!Number.isFinite(avg?.diff)?'전일 자료 미제공':Math.abs(avg.diff)<1?'어제와 비슷':'어제보다 '+money(Math.abs(avg.diff))+(avg.diff>0?' ↑':' ↓');
  exploreTools.innerHTML='<div class="fuel-summary"><div><p>전국 평균 <strong>'+money(avg?.price)+'</strong> · '+daily+'</p>'+regional+'</div><div class="explore-toggle">'+['B027','D047'].map(p=>'<button type="button" data-product="'+p+'" aria-pressed="'+(fuelProduct===p)+'">'+(p==='B027'?'휘발유':'경유')+'</button>').join('')+'</div></div>'+sourceDisclosure('오피넷(한국석유공사) 기준 · '+(fuelData.date || '날짜 미제공')+' · 주유소가 알린 가격이라 실제와 다를 수 있어요')+'<div class="fuel-legend"><span>쌈</span>'+['50원 넘게 쌈','10~50원 쌈','비슷(±10원)','10~50원 비쌈','50원 넘게 비쌈'].map((v,i)=>'<button type="button" title="'+v+'" aria-label="전국 평균 대비 '+v+'" data-legend="'+v+'" style="background:'+fuelColors[i]+'"></button>').join('')+'<span>비쌈</span></div><small class="legend-detail" aria-live="polite"></small>';
  const rank=s=>!selection?0:String(s.sgg)===selection.center.code?0:String(s.sgg).slice(0,2)===selection.center.sido?1:2;
  const stations=fuelData.stations.filter(s=>Number.isFinite(s.price?.[fuelProduct]) && (!selection || rank(s)<2)).sort((a,b)=>rank(a)-rank(b)||a.price[fuelProduct]-b.price[fuelProduct]);
  feedEl.innerHTML='<li class="explore-source">시·도별 최저가 10곳만 보여줘요</li>'+stations.map(s=>'<li class="festival-card">'+stationText(s)+'</li>').join('')+(stations.length?'':'<li class="empty">이 지역의 해당 유종 최저가 목록이 없어요.</li>');
  for(const s of stations) {
    if(!Number.isFinite(s.lat)||!Number.isFinite(s.lon)||Math.abs(s.lat)>90||Math.abs(s.lon)>180) continue;
    L.marker([s.lat,s.lon],{title:s.name,icon:L.divIcon({className:'fuel-marker',html:'<span class="fuel-hit"><i></i></span>',iconSize:[44,44],iconAnchor:[22,22]})}).bindPopup(stationText(s)).addTo(fuelMarkers);
  }
}
async function loadFood(code) {
  foodPending.add(code); foodErrors.delete(code);
  try {
    const r=await fetch('data/'+(DEMO?'demo-food/':'food/')+encodeURIComponent(code)+'.json',{cache:'no-store'});
    if(!r.ok) throw Error(); const data=await r.json(); if(!Array.isArray(data.items)) throw Error(); foodCache.set(code,data);
  } catch (_) { foodErrors.add(code); }
  foodPending.delete(code);
  if(mode==='explore'&&exploreLayer==='food'&&selection?.center.code===code) renderExplore();
}
function renderFood() {
  const code=selection?.center.code;
  if(foodCode!==code) { foodCode=code; foodQuery=''; foodKind=''; foodLimit=50; }
  const data=foodCache.get(code);
  exploreTools.innerHTML=sourceDisclosure('위생 상태를 확인해 지정한 음식점이에요. 맛이나 서비스 평가는 아니에요 · 식품안전나라 '+(data?.updated || foodIndex.updated || '').slice(5,10).replace('-', '.')+' 기준');
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
    const url=/Android/i.test(navigator.userAgent)?'geo:0,0?q='+encodeURIComponent(x.address):'https://map.naver.com/p/search/'+encodeURIComponent(name+' '+x.address);
    return '<li class="festival-card food-card"><h3>'+escapeHtml(name)+'</h3><p>'+escapeHtml(x.kind || '업종 미제공')+(x.level&&x.level!=='적합'?' <span class="festival-day">'+escapeHtml(x.level)+'</span>':'')+' · 지정 ~'+escapeHtml(x.to?x.to.replaceAll('-','.'):'기간 미제공')+'</p>'+sourceDisclosure(x.address || '주소 미제공')+'<a class="food-map" href="'+escapeHtml(url)+'" target="_blank" rel="noopener noreferrer">지도에서 보기 ↗</a></li>';
  }).join('') || '<li class="empty">조건에 맞는 업소가 없어요.</li>';
  if(list.length>foodLimit) feedEl.insertAdjacentHTML('beforeend','<li><button type="button" data-food-more>더 보기 ('+Math.min(foodLimit,list.length)+' / '+list.length+')</button></li>');
}
exploreTools.addEventListener('input',e=>{ if(e.target.matches('input')) { foodQuery=e.target.value; foodLimit=50; renderFoodCards(); } });
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
  alert.textContent = festivalFailed ? '축제를 새로 확인하지 못했어요.' : '축제 갱신 시각을 확인해 주세요.';
  alert.classList.toggle('failed',festivalFailed);
  document.getElementById('sources-detail').innerHTML = '<p>전국문화축제표준데이터</p><p>확인 시각: ' + escapeHtml(validDate(festivalUpdated) ? festivalUpdated.toLocaleString('ko-KR') : '미제공') + '</p><p>진행 중 · 30일 안 시작하는 축제예요. 일정은 누리집에서 다시 확인해 주세요.</p>' + (festivalFailed ? '<p>새로 확인하지 못했어요. 이전 자료가 있으면 유지해요.</p>' : '');
}
function renderFestivals() {
  // 상단 유머 문구는 '보고 있는 지역'(선택 지역+맞닿은 곳)에 위급·긴급 소식이 있을 때만 끈다. 카드별 억제는 따로(restrained).
  const list = festivalList(), codes = emergencyCodes(), quiet = loadFailed || !lastChecked || (!!selection && [...selection.codes].some(c => codes.has(c)));
  titleEl.textContent = selection ? label(selection.center) + ' 주변 축제' : '동네 탐험';
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
    return '<li class="festival-card" data-festival="' + escapeAttr(f.id) + '"><details><summary><span class="festival-day ' + (end === now ? 'ending' : start <= now ? 'ongoing' : '') + '">' + badge + '</span><h3>' + escapeHtml(f.name) + '</h3><p>' + date(f.start) + ' – ' + date(f.end) + '</p><p class="festival-place">' + escapeHtml((f.place || f.address || '장소 미제공') + (region ? ' · ' + region : '')) + '</p>' + (f.content ? '<p class="festival-content">' + escapeHtml(f.content) + '</p>' : '') + (muted ? '<p class="festival-notice">이 지역에 긴급 소식이 있어요</p>' : end === now && !quiet ? '<p>오늘이 마지막 날이에요, 날래 가세요!</p>' : '') + '</summary><div class="festival-detail"><p>주최: ' + escapeHtml(f.host || '미제공') + '</p><p>전화: ' + escapeHtml(f.phone || '미제공') + '</p>' + (/^https?:\/\//i.test(f.url || '') ? '<a href="' + escapeAttr(f.url) + '" target="_blank" rel="noopener">누리집 ↗</a>' : '') + '<p class="src">출처: 전국문화축제표준데이터</p></div></details></li>';
  };
  const regular = list.filter(f => dayNumber(f.end)-dayNumber(f.start)+1 < 30), long = list.filter(f => dayNumber(f.end)-dayNumber(f.start)+1 >= 30);
  feedEl.innerHTML = regular.map(card).join('') + (long.length ? '<li class="festival-group"><details><summary>상시 진행 ' + long.length + '건</summary><ul>' + long.map(card).join('') + '</ul></details></li>' : '') || '<li class="empty"><p>' + (festivalFailed ? '축제를 불러오지 못했어요. 잠시 후 다시 확인해 주세요.' : !festivalLoaded ? '축제를 불러오는 중이에요.' : '진행 중이거나 30일 안에 시작하는 축제가 없어요.') + '</p><p>출처: 전국문화축제표준데이터 · 선택 지역과 맞닿은 지역 포함</p></li>';
  feedEl.scrollTop = scroll;
  renderFestivalMarkers();
  if (!celebrated && festivalLoaded) {
    celebrated = true;
    try { sessionStorage.setItem('nallae-celebrated','1'); } catch (_) {}
    if (!quiet && !reducedMotion.matches && list.length) {
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
    g.items.forEach(f => { const p=document.createElement('p'); p.textContent=f.name; popup.append(p); });
    if (muted) { const p=document.createElement('p'); p.textContent='이 지역에 긴급 소식이 있어요'; popup.append(p); }
    marker.bindPopup(popup);
  }
}
function applyMode() {
  rootMode();
  exploreTools.hidden=mode!=='explore'; fuelMarkers.clearLayers(); earthquakeMarkers.clearLayers();
  document.querySelectorAll('[data-mode-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.modeChoice===mode)));
  map.closePopup(); bubbleEl.hidden = true; bubbleAt = null; bubbleUntil = 0; replayEl.hidden = true;
  map.getPane('pulses').style.display = mode === 'explore' ? 'none' : '';
  if (mode === 'explore') festivalMarkers.addTo(map); else map.removeLayer(festivalMarkers);
  document.getElementById('map-legend').hidden = mode === 'explore';
  munis.forEach(m => { clearTimeout(m.flashTimer); m.flashing=false; m.layer.getElement()?.classList.remove('flash'); restyle(m); });
  syncCategories(); renderFeed();
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
})();

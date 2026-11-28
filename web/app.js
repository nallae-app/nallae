(() => {
'use strict';
const params = new URLSearchParams(location.search);
// 첫 방문처럼 서비스 워커가 아직 제어하지 않아도 본문 수신까지 기다림을 제한한다.
async function fetchJsonData(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { cache: 'no-store', ...options, signal: controller.signal });
    if (!response.ok) throw new Error('data response');
    return await response.json();
  } finally { clearTimeout(timeout); }
}
const DEMO = params.has('demo');
const directTravel=params.has('travel');
const requestedView=params.get('view');
const sectionEntry=['courses','places','saved','utilities'].includes(requestedView);
let locationRequestId = 0, routePicking = false;
let mode = 'explore', exploreChoiceChanged=false, savedView=false;
try { const saved=localStorage.getItem('nallae-mode');if(['news','explore'].includes(saved))mode=saved; } catch (_) {}
if(directTravel || sectionEntry)mode='explore';
if (DEMO && (params.has('rain') || params.has('snow'))) mode = 'explore';
rootMode();
function rootMode() { document.documentElement.dataset.mode = mode; }
const NEWS_URL = DEMO ? 'data/demo-news.json' : 'data/news.json';
// 검증된 일반 생활 소식만 표시한다. 새 범위 모듈이 없으면 과거 캐시를 노출하지 않는다.
const allowedNews = item => typeof item?.id === 'string' && !!item.id && typeof item.time === 'string' && Number.isFinite(Date.parse(item.time)) && globalThis.JippiReleaseScope?.isAllowedNewsItem?.(item) === true;
const POLL_MS = 60 * 1000;          // 소식 파일 다시 읽는 간격
const REPLAY_WINDOW_MIN = 60;       // 첫 진입 때 재생할 최근 소식 범위
const REPLAY_STEP_MS = 550;
const MUNI_ZOOM = 8.5;              // 이 배율부터 시·군·구 단위로 본다

const CATEGORIES = ['교통', '개발', '행정', '생활', '정책'];
const root = document.documentElement;
const token = (name) => getComputedStyle(root).getPropertyValue('--' + name).trim();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const signalName = () => 'brand';
const signalStyle = () => '--signal:var(--brand)';
const iconPaths = {
  '교통':'M5 16h14l-1-9H6l-1 9ZM5 12h14M7 16v4m10-4v4M8 7V4h8v3',
  '개발':'M4 21V9l8-6 8 6v12M2 21h20M9 21v-7h6v7',
  '행정':'M3 9h18L12 3 3 9ZM5 10v8m7-8v8m7-8v8M3 21h18',
  '생활':'M12 21S3 15 3 9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6-9 12-9 12Z',
  '정책':'M6 3h9l4 4v14H6V3ZM14 3v5h5M9 12h7m-7 4h7'
};
const icon = (cat) => '<svg class="category-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="' + (iconPaths[cat] || iconPaths['생활']) + '"/></svg>';
const themeButtons = [...document.querySelectorAll('[data-theme-choice]')];
function applyTheme() {
  const themeMode = root.dataset.themeMode;
  const theme = themeMode === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : themeMode;
  root.dataset.theme = theme;
  const favicon = document.getElementById('app-favicon');
  if (favicon) favicon.href = 'icons/favicon-' + theme + '-32.png';
  themeButtons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.themeChoice===themeMode)));
  document.querySelectorAll('meta[name="theme-color"]').forEach(meta=>meta.setAttribute('content',theme==='dark'?'#0B1B33':'#FFF7E8'));
}
function chooseTheme(themeMode) {
  if(!['system','light','dark'].includes(themeMode))return;
  root.dataset.themeMode=themeMode;
  try { localStorage.setItem('nallae-theme',themeMode); } catch (_) {}
  // An explicitly chosen setting supersedes a one-off preview link on reload.
  try { const url=new URL(location.href);if(url.searchParams.has('theme')){url.searchParams.delete('theme');history.replaceState(null,'',url.href);} } catch (_) {}
  applyTheme();
}
themeButtons.forEach(button=>button.addEventListener('click',()=>chooseTheme(button.dataset.themeChoice)));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
applyTheme();

if (DEMO) document.getElementById('badge-demo').hidden = false;
const panel = document.getElementById('panel');
const feedEl = document.getElementById('feed');
const titleEl = document.getElementById('panel-title');
const subEl = document.getElementById('panel-sub');
const chipsEl = document.getElementById('chips');
const locateBtn = document.getElementById('btn-locate');
document.getElementById('btn-settings').addEventListener('click', () => document.getElementById('settings-dialog').showModal());
const toastEl = document.getElementById('toast');
const map = L.map('map', { zoomControl: false, minZoom: 3, maxZoom: 18, zoomSnap: 0.25 });
/* MAP_GESTURE_GUARD_START */
(() => {
  const surface = document.getElementById('map');
  if (!surface) return;
  const editable = 'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]';
  let contacts = [], mapGesture = false;
  const element = target => target?.nodeType === 3 ? target.parentElement : target;
  const isEditable = target => Boolean(element(target)?.closest?.(editable));
  const inApp = target => {
    const node = element(target);
    return Boolean(node && (surface.contains(node) || node.closest?.('.topbar,.controls,#panel')));
  };
  const onMap = target => {
    const node = element(target);
    return Boolean(node && surface.contains(node) && !isEditable(node) && !node.closest?.('.leaflet-control,.leaflet-popup'));
  };
  const owns = targets => targets.length >= 2 && targets.some(onMap)
    && targets.every(target => inApp(target) && !isEditable(target));
  const cancelDefault = event => { if (event.cancelable) event.preventDefault(); };
  const track = event => {
    contacts = Array.from(event.touches || []);
    mapGesture = owns(contacts.map(touch => touch.target));
  };
  const touch = event => {
    track(event);
    // Cancel only the browser's page zoom. Leaflet still receives the event and
    // performs its own map pinch; never stop propagation or cancel a single drag.
    if (mapGesture) cancelDefault(event);
  };
  const reset = () => { contacts = []; mapGesture = false; };
  const listenerOptions = { capture: true, passive: false };
  document.addEventListener('touchstart', touch, listenerOptions);
  document.addEventListener('touchmove', touch, listenerOptions);
  document.addEventListener('touchend', track, { capture: true, passive: true });
  document.addEventListener('touchcancel', reset, { capture: true, passive: true });
  document.addEventListener('gesturestart', event => {
    if (isEditable(event.target) || contacts.some(touch => isEditable(touch.target))) { mapGesture = false; return; }
    if (!mapGesture) {
      const targets = contacts.map(touch => touch.target);
      // A gesture event can precede its second touch snapshot. Do not infer that
      // unknown contact: it may belong to an input or another reading surface.
      mapGesture = owns(targets);
    }
    if (mapGesture) cancelDefault(event);
  }, listenerOptions);
  document.addEventListener('gesturechange', event => {
    if (isEditable(event.target)) { mapGesture = false; return; }
    if (mapGesture) cancelDefault(event);
  }, listenerOptions);
  document.addEventListener('gestureend', event => {
    if (mapGesture) cancelDefault(event);
    reset();
  }, listenerOptions);
  window.addEventListener('blur', reset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
})();
/* MAP_GESTURE_GUARD_END */
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
    + '<g class="bukangi-tail"><path d="M47 19 Q55 13 61 11 Q58 20 62 29 Q54 28 47 24 Z"/></g>'
    + '<path class="bukangi-fin" d="M25 10 Q29 3 36 3 Q34 8 35 13 Z"/>'
    + '<path class="bukangi-body" d="M7 23 C5 13 15 7 28 8 C39 8 48 14 51 21 C49 30 40 35 27 35 C15 35 8 31 7 23 Z"/>'
    + '<path class="bukangi-belly" d="M8 25 Q18 20 33 24 Q42 26 44 29 C35 37 14 36 8 27 Z"/>'
    + '<path class="bukangi-pectoral" d="M25 29 Q33 28 37 35 Q27 39 23 33 Q22 30 25 29 Z"/>'
    + '<g class="bukangi-eyes"><circle class="bukangi-eye" cx="16" cy="18.5" r="2.7"/><circle class="bukangi-shine" cx="15.2" cy="17.6" r="0.9"/></g>'
    + '<circle class="bukangi-cheek" cx="21" cy="23" r="2.7"/>'
    + '<ellipse class="bukangi-highlight" cx="12" cy="12.5" rx="2.6" ry="1.1" transform="rotate(-25 12 12.5)"/>'
    + '<circle class="bukangi-highlight" cx="17" cy="10.5" r="0.8"/>'
    + '<path class="bukangi-smile" d="M10.5 24 Q13 28 17 24.5" fill="none"/>'
    + '<path class="bukangi-gill" d="M37 19 Q39 22 37 25 M40.5 18.5 Q43 22 40.5 25.5" fill="none"/>'
    + '</svg></span></span>' }) });
bukangi.bindPopup('<strong>🦈 부캉이</strong><p>부산 북항 친수공원 수로에서 발견된 상어의 애칭이에요.<br>지삐에서는 북항을 헤엄치는 기념 캐릭터로 만나요.</p><p>“지삐지기면 백전백승!”</p><small>현재 위치나 실제 이동 경로를 나타내지 않아요.</small>', { className: 'bukangi-popup', maxWidth: 250, autoPanPaddingTopLeft: [16, 90], autoPanPaddingBottomRight: [16, 260] });
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
  const show = !document.hidden && map.getBounds().pad(0.1).contains(BUKANGI);
  if (show && !map.hasLayer(bukangi)) bukangi.addTo(map);
  else if (!show && map.hasLayer(bukangi)) map.removeLayer(bukangi);
}
map.on('moveend zoomend', updateBukangi);
document.addEventListener('visibilitychange', updateBukangi);
map.createPane('pulses').style.zIndex = 650;

const paperCourseMap=()=>mode==='explore'&&exploreLayer==='outing'&&outingTheme!=='travel'&&!overseasView&&root.dataset.theme==='dark';
const baseStyle = { color: token('border-sgg'), weight: 0.35, opacity:.48, fillColor: token('land'), fillOpacity: 1 };
let provinceLayer, selectionOutline;
// 좌표와 관측값은 각 시·군·구의 것이다. 저배율에서는 하나의 대표 지점만 고른다.
const weatherRepresentatives = new Map([
  ['11110','서울'], ['26230','부산'], ['50110','제주'], ['51110','춘천'], ['12210','광주'],
  ['30140','대전'], ['47170','안동'], ['52111','전주'], ['27110','대구'], ['28200','인천'],
  ['48121','창원'], ['41115','수원'], ['43111','청주'], ['44800','홍성'], ['31110','울산'], ['36110','세종'],
]);
const weatherMarkers = new Map();
const observedPrecipitation = ['강수 없음','비','비·눈','눈','소나기','빗방울','빗방울·눈날림','눈날림'];

function weatherFreshness(source, failed, hours, now=Date.now()) {
  const age=now-Date.parse(source?.base);
  if (!Number.isFinite(age) || age<0) return 'unknown';
  if (age>=hours*3600000) return 'old';
  return failed?'unverified':'current';
}
function weatherTime(value) {
  const stamp=Date.parse(value);
  if (!Number.isFinite(stamp)) return '시각 미제공';
  const date=new Date(stamp+9*3600000);
  return (date.getUTCMonth()+1)+'월 '+date.getUTCDate()+'일 '+String(date.getUTCHours()).padStart(2,'0')+':'+String(date.getUTCMinutes()).padStart(2,'0');
}
function weatherStamp(state) {
  return ({current:'관측',old:'지난 관측',unverified:'갱신 확인 필요',unknown:'관측 시각 확인 필요'})[state];
}
function weatherTemperatureIcon() {
  return '<svg class="temperature-icon" viewBox="0 0 20 24" aria-hidden="true"><path d="M7 14V5a3 3 0 0 1 6 0v9a5 5 0 1 1-6 0Z"/><path d="M10 8v9"/><circle cx="10" cy="18" r="1.2"/></svg>';
}
function weatherPointPosition(point,width,size,occupied,blocked,allowShift,selected) {
  const height=44, half=width/2;
  if(point.x<0||point.x>size.x||point.y<0||point.y>size.y||blocked.some(r=>point.x>r.left&&point.x<r.right&&point.y>r.top&&point.y<r.bottom))return null;
  const placements=[[0,0]];
  if(allowShift||selected) {
    const shiftX=half+8,shiftY=height/2+10;
    placements.push([shiftX,0],[-shiftX,0],[0,shiftY],[0,-shiftY],[shiftX,-shiftY],[-shiftX,shiftY]);
    if(selected)placements.push([0,58],[0,-83],[-80,0],[80,0]);
  }
  for(const [dx,dy] of placements){
    const x=point.x+dx,y=point.y+dy;
    const box={left:x-half-2,right:x+half+2,top:y-height/2-2,bottom:y+height/2+2};
    if(box.left<2||box.right>size.x-2||box.top<2||box.bottom>size.y-2) continue;
    if(occupied.some(r=>box.left<r.right&&box.right>r.left&&box.top<r.bottom&&box.bottom>r.top))continue;
    occupied.push(box);return [dx,dy];
  }
  return null;
}
function renderWeatherMarkers() {
  const size=map.getSize(), mapBox=map.getContainer().getBoundingClientRect();
  function obstacleBox(node) {
    const rect=node?.getBoundingClientRect();
    return rect?.width&&rect.height?{left:rect.left-mapBox.left,right:rect.right-mapBox.left,top:rect.top-mapBox.top,bottom:rect.bottom-mapBox.top}:null;
  }
  const blocked=[panel,document.querySelector('.topbar'),document.querySelector('.controls')].map(obstacleBox).filter(Boolean);
  const occupied=[...blocked,...[bukangi.getElement(),...map.getPane('decor').querySelectorAll('.rain-scene-marker')].map(obstacleBox).filter(Boolean)];
  const detail=map.getZoom()>=MUNI_ZOOM;
  const selectionCode=selection?.center.code, state=weatherFreshness(weatherData,exploreFailed.has('weather'),2);
  const accepted=new Set();
  const cells=regionLabels.filter(r=>r.kind==='sgg'&&(detail||weatherRepresentatives.has(r.code)||r.code===selectionCode));
  const representatives=[...weatherRepresentatives.keys()];
  const priority=r=>r.code===selectionCode?-2:weatherRepresentatives.has(r.code)?representatives.indexOf(r.code):100;
  cells.sort((a,b)=>priority(a)-priority(b)||b.area-a.area||a.code.localeCompare(b.code));
  for(const cell of cells) {
    const point=map.latLngToContainerPoint(cell.at), region=muniByCode.get(cell.code);
    const observation=weatherData?.sgg?.[cell.code], hasTemp=Number.isFinite(observation?.t);
    const name=detail||!weatherRepresentatives.has(cell.code)?region.name:weatherRepresentatives.get(cell.code);
    const value=hasTemp?Math.round(observation.t)+'°':'미제공';
    const mark=hasTemp?(state==='old'?'지난 ':state!=='current'?'확인 ':''):'';
    const labelText=mark+value;
    // 실제 버튼 크기와 같은 배치 단위를 사용해 터치 영역까지 겹치지 않게 한다.
    const width=Math.max(56,Array.from(name).length*12+14,Array.from(labelText).length*9+30);
    const offset=weatherPointPosition(point,width,size,occupied,blocked,!detail,cell.code===selectionCode);
    if(!offset)continue;
    accepted.add(cell.code);
    const pty=hasTemp&&state==='current'?observation.pty:null;
    let marker=weatherMarkers.get(cell.code);
    if(!marker) {
      const button=document.createElement('button');
      button.type='button';button.className='weather-map-point';
      L.DomEvent.disableClickPropagation(button);
      button.addEventListener('click',event=>{
        if(mobileSheet.matches&&sheetStage===0)setSheetStage(1,false);
        select(region,false); resetSelectedFeed(); fitSheet();
        if(event.detail===0){titleEl.tabIndex=-1;titleEl.focus({preventScroll:true});}
      });
      marker=L.marker(cell.at,{pane:'labels',interactive:false,keyboard:false,
        icon:L.divIcon({className:'weather-map-anchor',html:button,iconSize:[0,0],iconAnchor:[0,0]})}).addTo(map);
      marker.weatherButton=button;
      weatherMarkers.set(cell.code,marker);
    }
    const button=marker.weatherButton, condition=observedPrecipitation[pty];
    const [dx,dy]=offset;
    const key=[name,labelText,pty,state,weatherData?.base,cell.code===selectionCode,dx,dy].join('|');
    if(marker.weatherKey!==key) {
      marker.weatherKey=key;
      button.style.width=width+'px';button.style.left=dx+'px';button.style.top=dy+'px';
      const anchor=marker.getElement();
      anchor.style.setProperty('--stem-size',Math.hypot(dx,dy)+'px');
      anchor.style.setProperty('--stem-direction',Math.atan2(dy,dx)+'rad');
      button.dataset.state=hasTemp?state:'missing';
      button.dataset.weatherRegion=cell.code;
      button.setAttribute('aria-pressed',String(cell.code===selectionCode));
      const info=hasTemp?weatherStamp(state)+' '+value+(condition?' · '+condition:'')+' · '+weatherTime(weatherData.base):'관측 미제공';
      button.setAttribute('aria-label',label(region)+' · '+info+' · 날씨 상세');
      const art=weatherArtwork(pty,true);
      button.innerHTML='<span class="weather-map-name">'+escapeHtml(name)+'</span><span class="weather-map-reading">'+(art|| (hasTemp?weatherTemperatureIcon():''))+'<strong>'+escapeHtml(labelText)+'</strong></span>';
    }
    if(accepted.size>=(detail?24:size.x<600?7:10)) break;
  }
  for(const [code,marker] of weatherMarkers) if(!accepted.has(code)){marker.remove();weatherMarkers.delete(code);}
}

const regionLabels = [];
let labelFrame, outlinedRegion;
function scheduleLabels() {
  if (labelFrame) return;
  labelFrame = requestAnimationFrame(() => {
    labelFrame = null;
    renderLabels();
  });
}
function syncRegionPreviewOutline(){
  const code=mode==='explore'&&exploreLayer==='outing'&&!savedView&&!overseasView&&!selection?regionPreviewCode:'';
  if(code!==regionPreviewOutlineCode){regionPreviewOutline?.remove();regionPreviewOutline=null;regionPreviewOutlineCode=code;const feature=sidos.get(code)?.feature;if(feature)regionPreviewOutline=L.geoJSON(feature,{pane:'selection',interactive:false,style:{color:token('brand'),weight:2,opacity:.9,fill:false}}).addTo(map);}
  regionPreviewOutline?.setStyle({color:token('brand')});
}
function renderLabels() {
  syncRegionPreviewOutline();
  const previewRegion=mode==='explore'&&exploreLayer==='outing'&&!savedView&&!overseasView&&!selection?regionPreviewCode:'';
  if (outlinedRegion !== selection?.center) {
    if (selectionOutline) map.removeLayer(selectionOutline);
    outlinedRegion = selection?.center;
    selectionOutline = selection ? L.geoJSON(selection.center.feature, { pane:"selection", interactive:false, style:{color:token("brand"),weight:2,fill:false} }).addTo(map) : null;
  }
  selectionOutline?.setStyle({color:paperCourseMap()?'#FFD16D':token("brand")});
  const weatherLayer = mode==='explore' && exploreLayer==='weather' && Boolean(weatherData || forecastData);
  if (weatherLayer) {
    for (const entry of regionLabels) entry.el.hidden = true;
    renderWeatherMarkers();
    return;
  }
  if (weatherMarkers.size) {
    for (const marker of weatherMarkers.values()) marker.remove();
    weatherMarkers.clear();
  }
  const occupied = replayEl.hidden ? [] : [replayEl.getBoundingClientRect()];
  const controlsBounds=document.querySelector('.controls').getBoundingClientRect();
  if(controlsBounds.width)occupied.push(controlsBounds);
  for(const marker of discoveryMarkers){const bounds=marker.getElement()?.getBoundingClientRect();if(bounds?.width)occupied.push(bounds);}
  const zoomed = map.getZoom() >= MUNI_ZOOM;
  const sorted = regionLabels.slice().sort((a,b) => {
    const rank = r => selection?.center.code === r.code ? 0 : previewRegion?(r.kind==='sgg'&&r.code.startsWith(previewRegion)?1:r.kind==='sido'?2:3):r.kind==='sido'?1:2;
    const priority=r=>({'11':0,'26':1,'28':2,'50':3}[r.code]??4);
    return rank(a)-rank(b) || priority(a)-priority(b) || b.area-a.area || a.code.localeCompare(b.code);
  });
  // 텍스트 변경과 크기 측정을 모아 강제 레이아웃 계산을 줄인다.
  const measure = [];
  for (const r of sorted) {
    const selected = selection?.center.code === r.code;
    const text=r.name;
    r.eligible = zoomed || r.kind === 'sido' || selected || Boolean(previewRegion&&r.kind==='sgg'&&r.code.startsWith(previewRegion));
    if (r.text !== text || r.selected !== selected || !r.width) {
      r.text = text;
      r.selected = selected;
      r.el.textContent = text;
      r.el.hidden = false;
      measure.push(r);
    }
    r.el.classList.toggle("selected", !!selected);
  }
  for (const r of measure) {
    r.width = r.el.offsetWidth;
    r.height = r.el.offsetHeight;
  }
  for (const r of sorted) {
    if (!r.eligible) { r.el.hidden = true; continue; }
    const pt = map.latLngToContainerPoint(r.at);
    const w = r.width, h = r.height;
    const box = {left:pt.x-w/2-2,right:pt.x+w/2+2,top:pt.y-h/2-1,bottom:pt.y+h/2+1};
    if (occupied.some(b => box.left < b.right && box.right > b.left && box.top < b.bottom && box.bottom > b.top)) { r.el.hidden=true; continue; }
    occupied.push(box);
    r.el.hidden = false;
    // Leaflet owns marker movement; only visibility and text change here.
  }
}
function addRegionLabel(f, kind) {
  const p=f.properties;
  if (!Number.isFinite(p.lx) || !Number.isFinite(p.ly)) return;
  const el=document.createElement("span");
  el.className="region-label"; el.textContent=kind === "sido" ? p.short || p.name : p.name;
  el.hidden=true; el.setAttribute("aria-hidden","true");
  const marker=L.marker([p.ly,p.lx],{pane:"labels",interactive:false,keyboard:false,icon:L.divIcon({className:"region-label-anchor",html:el,iconSize:[0,0],iconAnchor:[0,0]})}).addTo(map);
  regionLabels.push({el,marker,kind,name:el.textContent,code:p.code,area:p.la || 0,at:[p.ly,p.lx]});
}
// Leaflet Marker synchronizes pan, pinch and animated zoom with the geometry.
// Collision filtering runs after a gesture instead of rewriting hundreds of
// label positions and measuring the layout on every animation frame.
map.on("moveend zoomend resize", scheduleLabels);
document.fonts?.ready.then(() => {
  regionLabels.forEach(r => { r.width = 0; });
  scheduleLabels();
});
const moveToBounds = (bounds, options) => reducedMotion.matches ? map.fitBounds(bounds, { ...options, animate:false }) : map.flyToBounds(bounds, options);
let munis = [], muniByCode = new Map(), sidos = new Map(), neighborIdx = [], homeBounds = null;

const sheetTarget = () => parseFloat(panel.style.height) || panel.offsetHeight;
const leftPad = () => (window.innerWidth >= 760 ? [Math.min(innerWidth-140,panel.getBoundingClientRect().right+14),Math.max(70,document.querySelector('.topbar').getBoundingClientRect().bottom+8)] : [10, Math.max(0, Math.min(document.querySelector('.topbar').getBoundingClientRect().bottom + 8, innerHeight - sheetTarget() - 120))]);
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
  sidoGeo.features.forEach((f) => { const s = sidos.get(f.properties.code); if (s) {s.short = f.properties.short; s.feature=f;} });
  provinceLayer = L.geoJSON(sidoGeo, {
    pane: 'provs', interactive: false, style: { color: token('border-sido'), weight: 1.05, opacity:.85, fill: false },
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
  root.dataset.mapDetail=z?'local':'national';
  baseStyle.weight = z ? .8 : .35;
  baseStyle.opacity = z ? .85 : .48;
  baseStyle.color = token('border-sgg');
  munis.forEach((m) => { if (!m.flashing) restyle(m); });
});
let selection = null; // { center, codes:Set, fromLocation }
let category = null;
let meMarker = null;

const isSelected = (m) => !!selection && selection.codes.has(m.code);
function restyle(m) {
  if (!m.layer) return;
  const paper=paperCourseMap(),land=paper?'#42606C':baseStyle.fillColor,selectedFill=paper?'#807143':token('selection-fill'),selectedStroke=paper?'#FFD16D':token('brand');
  const fuelFill = mode === 'explore' && exploreLayer === 'fuel' ? fuelColor(m.code) : mode === 'explore' && exploreLayer === 'weather' ? weatherColor(m.code) : null;
  const fill = fuelFill ? {fillColor:fuelFill,fillOpacity:root.dataset.theme==='dark'?.24:.72} : {fillColor:(mode === 'explore' && ['food','parking'].includes(exploreLayer) ? selection?.center === m : isSelected(m)) ? selectedFill : land,fillOpacity:1};
  if (selection && selection.center === m) m.layer.setStyle({ ...baseStyle, ...fill, color:selectedStroke, weight:2.5, opacity:1 });
  else if (isSelected(m)) m.layer.setStyle({ ...baseStyle, ...fill, color:selectedStroke, weight:1.3, opacity:1 });
  else m.layer.setStyle({...baseStyle,...fill});
}

function onRegionClick(m) {
  if(routePicking)return;
  if(overseasView){overseasView=false;travelMapContext=false;syncTravelMap();renderOutings();}
  if(mode==='explore'&&exploreLayer==='outing'&&!savedView&&regionPreviewCode===m.sido){
    select(m,false);if(mobileSheet.matches)setSheetStage(2,false);fitSheet();return;
  }
  atHome = false;
  if (map.getZoom() < MUNI_ZOOM) {
    if(mode==='explore'&&exploreLayer==='outing'&&!savedView){
      if(selection)clearSelection();
      locationRequestId++;regionPreviewCode=m.sido;atHome=false;selectionAutoFit=false;
      renderOutings();if(mobileSheet.matches&&sheetStage===0)setSheetStage(1,false);fitSheet();
    }
    moveToBounds(sidos.get(m.sido).bounds, { paddingTopLeft: leftPad(), paddingBottomRight: bottomPad(), duration: 0.8 });
    return;
  }
  select(m, false);
}

function select(m, fromLocation, origin=m.center) {
  regionPreviewCode='';
  overseasView=false;travelMapContext=false;syncTravelMap();
  locationRequestId++;
  atHome = false; selectionAutoFit = true;
  const prev = selection;
  const codes = NallaeLocalScope.regionCodes(m,neighborIdx[m.i].map(j=>munis[j]),origin);
  selection = { center: m, codes, fromLocation, origin };
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
  locationRequestId++;
  regionPreviewCode='';
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
  const header = document.querySelector('.topbar').getBoundingClientRect();
  const desktop = matchMedia('(min-width:760px)').matches;
  const left = desktop ? sheet.right + 16 : 12;
  const right = innerWidth - 12;
  const legendEl = document.getElementById('map-legend');
  const legend = (legendEl.open ? legendEl.querySelector('.legend-content') : legendEl).getBoundingClientRect();
  const top = Math.max(header.bottom, legend.bottom) + 8;
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
  bubbleUntil = 0;
  bubbleEl.innerHTML = '<span class="bubble-title">' + escapeHtml(placeLabel(item)) + ' · ' + escapeHtml(displayTitle(item)) + '</span>';
  bubbleItem = item;
  const openable = mode === 'news' && visible(item);
  bubbleEl.classList.toggle('openable', openable);
  bubbleEl.disabled = !openable; // 목록 범위 밖 소식은 누를 수 없다(사건 하나를 임의로 고르지 않게)
  bubbleEl.setAttribute('aria-label', (openable ? '이 소식 카드 열기: ' : '') + placeLabel(item) + ' · ' + displayTitle(item));
  bubbleEl.hidden = false;
  placeMapOverlays();
  bubbleHideLater(2800);
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
  if (mode !== 'news' || !onMap(item) || !visible(item)) return;
  const signal = signalName(item);
  const targets = localItemMunis(item);
  const point = hasPoint(item) ? L.latLng(item.lat, item.lon) : null;
  if (!targets.length && !point) return;
  targets.forEach((m) => flash(m, signal));
  const at = point || (selection ? targets.find(m=>m.code===selection.center.code)?.center || targets[0]?.center : item.sgg?.length ? muniByCode.get(item.sgg[0])?.center : sidos.get(item.sido?.[0])?.center);
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
function localItemMunis(item) {
  return selection ? NallaeLocalScope.relevantRegions(item,selection.codes,munis) : itemMunis(item);
}
function displayTitle(item) {
  return item.title;
}

// 선택한 중심 지역과 이 소식의 관계. 데이터에 적힌 시·군·구/시·도만 근거로 하고 새 관계를 만들지 않는다.
//  centerPlus: 중심 구 + 다른 곳 · centerWide: 중심 구를 포함한 시·도 전체 · neighbor: 맞닿은 시·군·구만 · neighborWide: 맞닿은 지역의 시·도 전체만
//  중심 구만 지정된 소식·전국 모드·목록 전용(정책)에는 붙이지 않는다.
function selectionRelation(item) {
  if (!selection || !onMap(item)) return null;
  const c = selection.center.code;
  const sgg = item.sgg || [], sido = item.sido || [];
  if (sgg.includes(c)) return sgg.length > 1 || sido.length ? 'centerPlus' : null;
  if (sido.includes(selection.center.sido)) return 'centerWide';
  if (sgg.some((x) => selection.codes.has(x))) return 'neighbor';
  if (itemMunis(item).some((m) => selection.codes.has(m.code))) return 'neighborWide';
  return null;
}
const RELATION_TEXT = { centerPlus: '선택 지역 포함', centerWide: '시·도 전체 · 선택 지역 포함', neighbor: '인접 지역', neighborWide: '인접 시·도 전체' };
const relationHtml = (it) => { const t = RELATION_TEXT[selectionRelation(it)]; return t ? '<span class="relation-label">' + t + '</span>' : ''; };
function placeLabel(item) {
  if(selection && onMap(item)) {
    const local=localItemMunis(item).sort((a,b)=>Number(b.code===selection.center.code)-Number(a.code===selection.center.code));
    if(local.length) {
      const names=local.slice(0,2).map(label);
      const wider=itemMunis(item).length>local.length;
      return names.join(', ')+(local.length>2?' 외 인접 '+(local.length-2)+'곳':'')+(wider?' · 다른 지역에도 발표':'');
    }
  }
  const sgg = (item.sgg || []).map((c) => muniByCode.get(c)).filter(Boolean);
  const sido = (item.sido || []).map((c) => sidos.get(c)).filter(Boolean);
  const names = [...sido.map((s) => `${s.short} 전체`), ...sgg.map(label)];
  if (!names.length) return '전국';
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
    data = await fetchJsonData(NEWS_URL);
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
  sources = {brief:data.sources?.brief};
  const incoming = (data.items || [])
    .filter(allowedNews)
    .sort((a, b) => new Date(b.time) - new Date(a.time));
  const fresh = incoming.filter((it) => !seen.has(it.id));
  incoming.forEach((it) => seen.add(it.id));
  items = incoming;
  updateDecorations();
  updatedAt = data.updated ? new Date(data.updated) : null;
  syncCategories();
  munis.forEach(m => { if (!m.flashing) restyle(m); });

  if (firstLoad) {
    firstLoad = false;
    renderFeed();
    const cutoff = Date.now() - REPLAY_WINDOW_MIN * 60000;
    const replay = incoming.filter((it) => onMap(it) && new Date(it.time) >= cutoff).slice(0, 20).reverse();
    const replayStatus = document.getElementById('replay-status');
    replayStatus.hidden = mode !== 'news' || !replay.length;
    setTimeout(() => { replayStatus.hidden = true; }, 500 + replay.length * REPLAY_STEP_MS + 5600);
    replay.forEach((it, k) => setTimeout(() => pulse(it, k === replay.length - 1 || k % 3 === 0), 500 + k * REPLAY_STEP_MS));
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

setInterval(()=>{if(mode==='news') renderFeed(null,true);},60000);
function visible(item) {
  if (!allowedNews(item)) return false;
  if (category && item.cat !== category) return false;
  if (selection && !onMap(item)) return false;
  if (selection && !localItemMunis(item).length) return false;
  return true;
}

let sources = {}, loadFailed = false, lastChecked = null;
function updateDecorations() {
  updateBukangi();
  updateRainScene();
}
const pending = new Set();
const newButton = document.getElementById('new-items');
newButton.addEventListener('click', () => { pending.clear(); renderFeed(); feedEl.scrollTop = 0; });
function updateTimes() {
  if (mode === 'explore') { updateExploreStatus(); updateBeforeOuting(); return; }
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
const SOURCE_NAMES = {brief:'정책브리핑'};
const newsSourceKeys = () => ['brief'];
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
  return newsSourceKeys().map(key => {
    const v = sources[key];
    return '<p class="source-status"><strong>' + names[key] + '</strong><br>' + sourceState(key).text + (v?.at ? '<br>확인 시각: ' + escapeHtml(v.at) : '') + (v?.note ? '<br>' + escapeHtml(v.note) : '') + '</p>';
  }).join('');
}
function card(it) {
  const open = it.id === openId;
  return '<button type="button" class="card-toggle" aria-expanded="' + open + '"><span class="meta">' + '<span class="category-label">' + icon(it.cat) + escapeHtml(it.cat) + '</span>' + relationHtml(it) + '<span class="place-label">' + escapeHtml(placeLabel(it)) + '</span><time datetime="' + escapeHtml(it.time) + '"' + (it.timeBasis === 'collected' ? ' data-prefix="확인 "' : '') + '>' + (it.timeBasis === 'collected' ? '확인 ' : '') + ago(new Date(it.time)) + '</time></span><span class="title">' + escapeHtml(displayTitle(it)) + '</span></button>' + (open ? detail(it) : '');
}
function renderFeed(newIds, preserve = false) {
  if (mode === 'explore') { renderExplore(); return; }
  if (!preserve) pending.clear();
  titleEl.textContent = selection ? regionTitle(selection.center) + ' 주변 생활 소식' : '일반 생활 소식';
  subEl.textContent = '일반 정책·생활 소식 · 최근 72시간';
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
      li.innerHTML = '<p>' + (category ? escapeHtml(category) + ' 분류에 수집된 소식이 없어요' : selection ? '선택한 지역에 수집된 소식이 없어요' : '지금 확인된 일반 생활 소식이 없어요') + '</p>'
        + '<p class="empty-note">최근 72시간 · 포함 지역 ' + (selection ? selection.codes.size : munis.length) + '곳 기준이에요. 코스·날씨·축제 등 생활정보는 계속 이용할 수 있어요.</p>'
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
// 일반 정책·생활 소식은 게시 시각을 표시한다.
const TIME_KIND = { brief: '게시' };
const kstFull = (d) => d.toLocaleString('ko-KR', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false, timeZone:'Asia/Seoul' });
function timeLine(it, when) {
  const at = escapeHtml(kstFull(when)) + ' (한국 시간)';
  return TIME_KIND[it.src] + ' ' + at;
}
function detail(it) {
  const when = new Date(it.time);
  return '<div class="detail">' + (TIME_KIND[it.src] && validDate(when) ? '<p class="detail-time">' + timeLine(it, when) + '</p>' : '') + (it.body ? '<p>' + escapeHtml(it.body) + '</p>' : '') + '<div class="src"><span>출처: ' + escapeHtml(it.source || '미제공') + (it.license ? ' · ' + escapeHtml(it.license) : '') + '</span>' + (it.url && /^https?:\/\//i.test(it.url) ? '<a href="' + escapeAttr(it.url) + '" target="_blank" rel="noopener noreferrer">' + '원문 보기 ↗' + '</a>' : '') + '</div></div>';
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
  const targets = onMap(item) ? localItemMunis(item) : [];
  if (targets.length) {
    const b = L.latLngBounds([]);
    targets.forEach((m) => b.extend(m.layer.getBounds()));
    moveToBounds(b, { paddingTopLeft: leftPad(), paddingBottomRight: bottomPad(), duration: 0.8, maxZoom: 10.5 });
    setTimeout(() => pulse(item, true), 700);
  } else if (onMap(item) && hasPoint(item)) {
    // 좌표가 있는 일반 소식은 그 위치 둘레로 이동
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
  if (mode === 'explore') { if (b.dataset.layer) { exploreChoiceChanged=true;exploreLayer=b.dataset.layer; try { localStorage.setItem('nallae-explore-layer',exploreLayer); } catch (_) {} map.closePopup(); renderExplore(); fitSheet(); resetSelectedFeed(); } return; }
  category = b.dataset.cat || null;
  chipsEl.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  renderFeed(); resetSelectedFeed();
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
  favoritesEl.innerHTML = favorites.map(r => '<button type="button" data-code="' + r.code + '" aria-pressed="' + (selection?.center.code === r.code) + '" aria-label="' + escapeHtml(r.name + (startCode === r.code ? ', 시작 지역' : '')) + '">' + favoriteIcon(favoriteType(r.name)) + escapeHtml(r.name) + (startCode === r.code ? favoriteIcon('pin') : '') + '</button>').join('') + '<button type="button" data-new>' + favoriteIcon('plus') + '동네 추가</button><button type="button" data-manage>' + favoriteIcon('edit') + '관리</button>' + (selection && !favorites.some(r => r.code === selection.center.code) ? '<button type="button" data-add>' + favoriteIcon('plus') + '현재 동네 저장</button>' : '');
}
function chooseFavorite(code) {
  chosenCode = code;
  document.getElementById('favorite-choice').textContent = code ? label(muniByCode.get(code)) : '저장할 지역을 골라 주세요.';
  document.getElementById('favorite-save').disabled = !code || !editingCode && (favorites.length >= 5 || favorites.some(r => r.code === code));
}
favoritesEl.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  document.getElementById('settings-dialog').close();
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
function locationErrorMessage(error) {
  return error?.code === 1 ? '위치 권한이 없어요. 지도에서 동네를 눌러 고르세요.'
    : error?.code === 3 ? '위치를 찾는 데 시간이 오래 걸려요. 다시 시도하거나 동네를 직접 골라 주세요.'
    : '현재 위치를 확인하지 못했어요. 잠시 후 다시 시도하거나 동네를 직접 골라 주세요.';
}
locateBtn.addEventListener('click', requestLocation);
function requestLocation() {
  if (!munis.length) return;
  if (!navigator.geolocation) return toast('이 기기에서는 위치 기능을 쓸 수 없어요. 지도에서 동네를 눌러 고르세요.');
  const requestId = ++locationRequestId;
  toast('내 위치를 찾는 중…');
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      if (requestId !== locationRequestId) return;
      if(Number.isFinite(coords.accuracy) && coords.accuracy>30000) { toast('위치 오차가 커요. 지도에서 동네를 골라 주세요.'); return; }
      const pt = [coords.longitude, coords.latitude];
      const m = munis.find((x) => containsPoint(x.feature.geometry, pt));
      if (!m) return toast('국내 위치가 아니라서 찾지 못했어요. 지도에서 동네를 눌러 고르세요.');
      locateBtn.classList.add('active');
      if (meMarker) map.removeLayer(meMarker);
      meMarker = L.marker([coords.latitude, coords.longitude], {
        pane: 'pulses', interactive: false,
        icon: L.divIcon({ className: '', iconSize: [0, 0], html: '<div class="pulse me"><span class="ring"></span><span class="dot"></span></div>' }),
      }).addTo(map);
      select(m, true, [coords.latitude,coords.longitude]);
      toast(`${label(m)} 주변을 보여드려요.`);
    },
    error => { if (requestId === locationRequestId) toast(locationErrorMessage(error)); },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

document.getElementById('btn-all').addEventListener('click', () => { overseasView=false;travelMapContext=false;travelPins.clearLayers();syncTravelMap();clearSelection();atHome=true;fitHome(); });
const mobileSheet = matchMedia('(max-width:759px)');
const handle = document.getElementById('panel-handle');
const sheetHead = panel.querySelector('.panel-head');
const stages = ['collapsed', 'middle', 'full'], stageNames = ['접힘', '중간', '전체'];
let sheetStage = 1, sheetDrag = null, suppressSheetClick = false, sheetFitTimer;
try {
  const saved = stages.indexOf(localStorage.getItem('nallae-sheet-stage'));
  if (saved >= 0) sheetStage = saved===2&&mode==='explore'?1:saved;
  else if(mode==='explore'&&localStorage.getItem('nallae-explore-layer')&&localStorage.getItem('nallae-explore-layer')!=='outing')sheetStage=1;
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
  const folded = handleH + sheetHead.offsetHeight + (document.querySelector('.panel-footer')?.offsetHeight || 0) + pad;
  const low = Math.min(folded, full);
  // 상태 안내·분류 줄·탐험 도구의 실제 높이를 더한다. 접힘에서는 숨어서 0이 되므로 마지막 측정값을 쓴다.
  const outer = el => {
    if (!el || el.hidden) return 0;
    if (!el.offsetHeight) return el._sheetH || 0;
    const cs = getComputedStyle(el);
    return el._sheetH = el.offsetHeight + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
  };
  const dedicated=mode==='explore'&&['places','outing'].includes(panel.dataset.exploreLayer);
  const extra = outer(document.getElementById('collection-alert')) + (dedicated?0:outer(document.querySelector('.category-row'))) + outer(document.querySelector('.explore-tools'));
  if(dedicated&&root.dataset.courseWelcome==='true'){
    const welcome=feedEl.querySelector('.discover-shelf,.outing-welcome');
    const discover=welcome?.classList.contains('discover-shelf');
    const body=(discover?(welcome.querySelector('.discover-welcome,.region-cover')?.offsetHeight||324):welcome?.offsetHeight||218)+outer(feedEl.querySelector('.next-outing'));
    const fixed=folded+extra;
    const middle=Math.min(full,Math.max(low+180,Math.min(fixed+body+8,H*(discover?(welcome?.classList.contains('region-photo-intro')?.64:H<620?.60:H<=740?.64:.58):.40))));
    const heights=[low,middle,full];heights.fixed=fixed;heights.fits=discover?middle-fixed>=body-2||middle===full:!feedEl.querySelector('.next-outing')||middle-fixed>=body-2||middle===full;return heights;
  }
  const cards = mode === 'news' ? firstTwoHeight() : TWO_CARDS;
  const want = folded + extra + cards;
  const mapRoom = H - document.querySelector('.topbar').getBoundingClientRect().bottom - MAP_MIN;
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
  root.style.setProperty('--map-sheet-height',h+'px');
  syncMapControls();
  // 중간에서 앞 두 소식을 다 담지 못하면 손잡이에 '전체 목록 보기'를 보여 준다(글자를 줄이거나 제목을 자르지 않는다)
  const hint = sheetStage === 1 && !heights.fits;
  panel.classList.toggle('needs-expand', hint);
  handle.setAttribute('aria-label', '목록 높이: ' + stageNames[sheetStage] + (hint ? '. 내용이 다 보이지 않아요. 누르면 전체 목록' : '. 누르면 다음 높이로 바뀌어요'));
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
panel.addEventListener('transitionend',e=>{if(e.propertyName==='height'){syncTravelMap();scheduleLabels();}});
function feedTouchAction() {
  const top = panel.classList.contains('sheet-scroll') ? panel.scrollTop : feedEl.scrollTop;
  feedEl.classList.toggle('sheet-pull', mobileSheet.matches && sheetStage === 2 && top <= 0);
  panel.classList.toggle('sheet-pull', mobileSheet.matches && sheetStage === 2 && top <= 0 && panel.classList.contains('sheet-scroll'));
}
// 명시적으로 다른 화면/분류를 고를 때만 호출한다. 작은 전체 시트는 panel이,
// 그 외에는 feed가 스크롤하므로 양쪽을 비워 새 화면의 첫 정보를 보여 준다.
function resetSelectedFeed() {
  panel.scrollTop = 0;
  feedEl.scrollTop = 0;
  feedTouchAction();
}
// 소식 ↔ 생활 전환의 읽던 위치는 화면별로 보관한다. 코스·날씨·주차의
// 서로 다른 목록 위치를 같은 생활 모드 슬롯에 덮어쓰지 않는다.
const selectedFeedPositions = new Map();
function selectedFeedKey() {
  if(overseasView)return 'outing:travel:'+overseasCityId;
  return mode === 'news' ? 'news' : exploreLayer + ':' + (savedView ? 'saved:' + outingTheme : 'browse');
}
function rememberSelectedFeed() {
  selectedFeedPositions.set(selectedFeedKey(), { panel:panel.scrollTop, feed:feedEl.scrollTop });
}
function restoreSelectedFeed() {
  const position = selectedFeedPositions.get(selectedFeedKey());
  panel.scrollTop = position?.panel || 0;
  feedEl.scrollTop = position?.feed || 0;
  feedTouchAction();
}
function setSheetStage(stage, remember = true) {
  if (stage > 0) cancelRoutePicking();
  clearTimeout(sheetFitTimer);
  sheetStage = stage;
  panel.classList.remove('sheet-dragging');
  panel.dataset.sheetStage = stages[stage];
  handle.setAttribute('aria-label', '목록 높이: ' + stageNames[stage] + '. 누르면 다음 높이로 바뀌어요');
  handle.setAttribute('aria-controls', 'feed');
  [chipsEl, feedEl, document.getElementById('new-items')].forEach(el => { el.inert = mobileSheet.matches && stage === 0; });
  if (mobileSheet.matches) applySheetHeight(sheetHeights());
  else { panel.style.removeProperty('height'); panel.classList.remove('sheet-scroll'); }
  if (mobileSheet.matches && stage === 0) {
    sheetFitTimer = setTimeout(() => {
      if (!mobileSheet.matches || sheetStage !== 0 || sheetDrag || overseasView || (savedView && outingTheme==='travel')) return;
      if (selection && selectionAutoFit) {
        const bounds = L.latLngBounds([]);
        selection.codes.forEach(code => bounds.extend(muniByCode.get(code).layer.getBounds()));
        map.fitBounds(bounds, { paddingTopLeft:leftPad(), paddingBottomRight:bottomPad(), maxZoom:11, animate:false });
      } else if (!selection && atHome && homeBounds) fitHome();
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
  if (!mobileSheet.matches || !e.isPrimary || e.button !== 0 || sheetDrag || e.target.closest('.main-navigation')) return;
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
function syncMapControls(){
  const header=document.querySelector('.topbar').getBoundingClientRect();
  const room=innerHeight-sheetTarget()-header.bottom;
  const inHeader=innerWidth<760&&room<120;
  root.dataset.mapControlsPlacement=inHeader?'header':'map';
  root.style.setProperty('--map-controls-top',(inHeader?header.top+(header.height-44)/2:header.bottom+14)+'px');
}
function resizeSheet() {
  const id = sheetDrag?.id;
  sheetDrag = null;
  if (id !== undefined && panel.hasPointerCapture(id)) panel.releasePointerCapture(id);
  root.style.setProperty('--kb', keyboardInset() + 'px');root.classList.toggle('keyboard-open',keyboardInset()>100);
  setSheetStage(sheetStage, false);
  syncMapControls();
}
window.addEventListener('resize', resizeSheet);
window.visualViewport?.addEventListener('resize', resizeSheet);
mobileSheet.addEventListener('change', resizeSheet);
// 시트 안 줄(상태 안내·분류·탐험 도구)의 높이가 바뀌면 현재 단계 높이만 다시 맞춘다
const sheetContentObserver = new ResizeObserver(fitSheet);
[sheetHead, document.getElementById('collection-alert'), document.querySelector('.category-row'), document.querySelector('.topbar')].forEach(el => sheetContentObserver.observe(el));
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
let exploreLayer='outing', fuelProduct='B027', fuelData=null, placesData=null, placeLocations=null, foodIndex=null, weatherData=null, forecastData=null, parkingIndex=null, parkingLive=null;
try { const storedLayer=localStorage.getItem('nallae-explore-layer'); if(['outing','places','festival','weather','fuel','parking','food'].includes(storedLayer)) exploreLayer=storedLayer; fuelProduct=localStorage.getItem('nallae-fuel-product') === 'D047' ? 'D047' : 'B027'; } catch (_) {}
let fuelRadius=5000, fuelSort='distance';
const nearbyFuelClient=NallaeNearbyFuel.createClient();
let fuelShown=[], fuelLookupAllowed=false, fuelSampleFallback=false;
try{const radius=Number(localStorage.getItem('nallae-fuel-radius'));if([5000,10000,15000].includes(radius))fuelRadius=radius;if(localStorage.getItem('nallae-fuel-sort')==='price')fuelSort='price';}catch(_){}
if(sectionEntry) {
  if(requestedView==='places') exploreLayer='places';
  else if(requestedView==='utilities') {
    if(params.get('layer')==='weather'||['places','outing'].includes(exploreLayer)) exploreLayer='weather';
  } else exploreLayer='outing';
  savedView=requestedView==='saved';
}
const preferredExploreLayer=DEMO && (params.has('rain') || params.has('snow')) ? 'weather' : exploreLayer;
let lastUtilityLayer=['places','outing'].includes(exploreLayer)?'weather':exploreLayer;
let heritageData=null,heritageLoadState='idle',heritageRequest=null,savedRestaurantRetryPending=false;
function allPlaceItems() {
  const curated=placesData?.items||[], known=new Set(curated.map(x=>(x.name+'|'+x.address).replace(/\s/g,'')));
  return [...curated,...(heritageData?.items||[]).filter(x=>!known.has((x.name+'|'+x.address).replace(/\s/g,'')))];
}
function loadHeritageData() {
  if(heritageRequest)return heritageRequest;
  heritageLoadState='loading';
  heritageRequest=fetchJsonData('data/heritage-restaurants.json').then(data=>{
    if(!Array.isArray(data?.items))throw Error('heritage data');
    heritageData=data;heritageLoadState='ready';
  }).catch(()=>{heritageLoadState='error';}).finally(()=>{
    heritageRequest=null;
    if(mode==='explore'&&exploreLayer==='outing'&&savedView&&outingTheme==='restaurants')refreshSavedRestaurants();
    else if(mode==='explore'&&['places','outing'].includes(exploreLayer)&&placesData){const scroll=feedEl.scrollTop;renderExplore();feedEl.scrollTop=scroll;}
  });
  return heritageRequest;
}
loadHeritageData();
const foodCache=new Map(), foodPending=new Set(), foodErrors=new Set();
let outingIndex=null, outingQuery='', outingTheme=savedView?'plans':'date', outingLimit=30, outingCode=null, outingNonce=0, outingShown=[], outingPlans=[], outingRadius=5000, outingStopCount=2, outingPlanLimit=3;
const outingCache=new Map(), outingPending=new Set(), outingErrors=new Set(), outingMarkers=L.layerGroup().addTo(map);
const outingPlanMemo=new Map();let outingRevision=0,outingSearchTimer,outingDataTimer;
let discoveryCatalog=null,discoveryIndex=0,discoveryError=false,discoveryRequest=null,discoveryDialog=null,discoveryMarkers=[],discoveryMarkerId='';
let regionPhotoCatalog=null,regionPreviewCode='',regionPhotoRequest=null,regionPhotoState='loading',regionPreviewOutline=null,regionPreviewOutlineCode='';
function loadRegionPhotos(){
  if(regionPhotoRequest)return regionPhotoRequest;
  regionPhotoState='loading';
  regionPhotoRequest=fetchJsonData('data/region-covers.json').then(data=>{
    const catalog=JippiRegionCovers.validate(data);if(!catalog)throw Error('Invalid region photo catalog');regionPhotoCatalog=catalog;regionPhotoState='ready';
    if(mode==='explore'&&exploreLayer==='outing'&&!savedView&&!overseasView){renderOutings();fitSheet();}
  }).catch(()=>{regionPhotoState='error';if(regionPreviewCode&&mode==='explore'&&exploreLayer==='outing'&&!savedView&&!overseasView){renderOutings();fitSheet();}}).finally(()=>regionPhotoRequest=null);return regionPhotoRequest;
}
function regionCoverCard(code,compact=false){
  const item=JippiRegionCovers.get(regionPhotoCatalog,code),province=sidos.get(code);if(!item&&(!province||compact))return '';
  const districts=compact?[]:munis.filter(m=>m.sido===code).map(m=>({code:m.code,name:label(m)}));
  const html=item?JippiRegionCovers.render({item,compact,districts}):JippiRegionCovers.renderUnavailable({regionCode:code,name:province.short||province.name,districts,loading:regionPhotoState==='loading'});
  return '<li class="'+(compact?'region-photo-summary':'discover-shelf region-photo-intro')+'">'+html+'</li>';
}
function regionPhotoSourceDialog(code){
  const item=JippiRegionCovers.get(regionPhotoCatalog,code);if(!item)return;const cover=item.cover;
  discoveryUtilityDialog('사진 출처','<p>'+escapeHtml(item.name+' 풍경 · '+cover.placeName)+'</p><p>'+escapeHtml(cover.author)+' · '+escapeHtml(cover.publisher)+'</p><p>'+escapeHtml(cover.dateLabel||cover.year+'년 출처 표기')+'</p><p>'+escapeHtml(cover.licenseName)+'</p><p>지역을 소개하는 사진이며 코스 방문지와 다를 수 있어요. 크기·형식을 바꾸고 화면에 맞춰 잘라 보여요. 변경된 사진도 표시된 라이선스를 따릅니다.</p><p><a href="'+escapeAttr(cover.sourceUrl)+'" target="_blank" rel="noopener noreferrer">사진 원본 안내 ↗</a></p><p><a href="'+escapeAttr(cover.licenseUrl)+'" target="_blank" rel="noopener noreferrer">사진 이용 조건 ↗</a></p>','[data-region-photo-source="'+code+'"]');
}
feedEl.addEventListener('error',event=>{
  const image=event.target;if(!image.matches?.('.region-cover-photo'))return;
  const frame=image.closest('.region-cover-figure'),fallback=frame?.querySelector('.region-cover-fallback');if(!fallback)return;
  image.hidden=true;fallback.hidden=false;frame.querySelector('.region-cover-credit')?.setAttribute('hidden','');
},true);
feedEl.addEventListener('change',event=>{
  const control=event.target.closest('[data-region-cover-muni]');if(!control||mode!=='explore'||exploreLayer!=='outing')return;
  const m=muniByCode.get(control.value);if(m&&m.sido===control.dataset.regionCoverMuni){select(m,false);if(mobileSheet.matches)setSheetStage(2,false);fitSheet();}
});

// A failed cover must keep the real course and its usable actions visible.
feedEl.addEventListener('error',event=>{
  const image=event.target;if(!image.matches?.('.discover-cover-photo'))return;
  const cover=image.closest('.discover-cover'),fallback=cover?.querySelector('.discover-photo-fallback');
  if(!fallback)return;
  image.hidden=true;cover.classList.add('photo-unavailable');fallback.hidden=false;
  cover.querySelectorAll('.discover-cover-caption,.discover-photo-source').forEach(el=>el.hidden=true);
},true);

function syncDiscoveryMarker(){
  const active=mode==='explore'&&exploreLayer==='outing'&&outingTheme==='date'&&!selection&&!regionPreviewCode&&!overseasView&&!savedView&&map.getZoom()<MUNI_ZOOM;
  const items=active?discoveryCatalog?.items||[]:[];
  const key=items.map(x=>x.id).join('|')+':'+discoveryIndex;
  if(discoveryMarkerId===key)return;
  discoveryMarkers.forEach(marker=>marker.remove());discoveryMarkers=[];discoveryMarkerId=key;
  items.forEach((item,index)=>{
    const first=item.stops[0],name=item.city+' 코스';
    const marker=L.marker([first.lat,first.lon],{title:name+' · '+item.title,icon:L.divIcon({className:'discover-map-marker'+(index===discoveryIndex?' is-active':''),html:'<span aria-hidden="true">'+escapeHtml(name)+'</span>',iconSize:[84,44],iconAnchor:[42,22]})}).addTo(map);
    marker.getElement()?.setAttribute('aria-label',name+' · '+item.title+' 보기');
    marker.getElement()?.setAttribute('aria-pressed',String(index===discoveryIndex));
    marker.on('click',()=>{discoveryIndex=index;renderOutingCards();fitSheet();openDiscoveryPlan(index);});
    discoveryMarkers.push(marker);
  });
  scheduleLabels();
}
map.on('zoomend',syncDiscoveryMarker);
function loadDiscoveryShelf(){
  if(discoveryRequest)return discoveryRequest;
  discoveryError=false;
  discoveryRequest=fetchJsonData('data/discovery-shelf.json').then(data=>{
    const catalog=JippiDiscoveryShelf.validate(data);if(!catalog)throw Error('Invalid discovery catalog');
    discoveryCatalog=catalog;
    if(mode==='explore'&&exploreLayer==='outing'&&!selection&&!savedView&&!overseasView){renderExplore();fitSheet();}
  }).catch(()=>{discoveryError=true;}).finally(()=>{discoveryRequest=null;});
  return discoveryRequest;
}

const savedOutings=new Map();
const savedPlans=new Map();
const communityUI=NallaeCommunityUI.create({toast,onReview:()=>{if(mode==='explore'&&exploreLayer==='outing')renderOutings();}});
let communityCatalog={items:[]},communityState='loading';
async function loadCommunity(){communityState='loading';try{const d=NallaeCommunity.parseCatalog(await fetchJsonData('data/community.json'));if(!d.valid||d.rejected)throw Error();communityCatalog=d;communityState='ready';}catch(_){communityState='error';}if(mode==='explore'&&exploreLayer==='outing'&&outingIndex)renderOutingCards();}
loadCommunity();
document.addEventListener('click',e=>{if(e.target.closest('[data-outings-load]'))loadExploreData(['outings/index']);if(e.target.closest('[data-contribution-open]')){document.getElementById('settings-dialog').close();communityUI.contribution();}});
try{const r=Number(localStorage.getItem('nallae-outing-radius'));if([5000,10000,15000].includes(r))outingRadius=r;const xs=JSON.parse(localStorage.getItem('nallae-plans-v1')||'[]');if(Array.isArray(xs))xs.slice(0,100).forEach(x=>{const p=NallaeDiscovery.snapshotPlan(x,x?.createdAt);if(p)savedPlans.set(p.id,p);});}catch(_){}
try{const xs=JSON.parse(localStorage.getItem('nallae-outings-v1')||'[]');if(Array.isArray(xs))xs.slice(0,300).filter(x=>typeof x.id==='string'&&NallaeDiscovery.point(x)).forEach(x=>savedOutings.set(x.id,x));}catch(_){}
let nextPlanId=null;
try{const id=localStorage.getItem('nallae-next-plan-v1');if(savedPlans.has(id))nextPlanId=id;}catch(_){}
let foodQuery='', foodKind='', foodLimit=50, foodCode=null;
const fuelMarkers=L.layerGroup().addTo(map);
const placeMarkers=L.layerGroup().addTo(map), placeMarkerById=new Map();
const placeAttribution='식당 위치 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> (ODbL)';
// 식당 좌표도 아래 초기 수집에서 함께 관리한다. 좌표 없이 코스를 먼저 확정하지 않는다.
const exploreTools=document.createElement('div'); exploreTools.className='explore-tools';
feedEl.before(exploreTools); sheetContentObserver.observe(exploreTools);
const exploreFailed=new Set(); let exploreReady=false;
const fuelColors=['#b5d9d1','#c7ded5','#e0e4da','#d7dce6','#d9cee5'];
const productName=()=>fuelProduct==='B027'?'휘발유':'경유';
const money=v=>Number.isFinite(v)?v.toLocaleString('ko-KR',{maximumFractionDigits:0})+'원':'미제공';
const availableLayers=()=>[['places','맛집 찾기',placesData],['outing','놀거리·데이트',outingIndex||discoveryCatalog||overseasData||overseasView],['festival','축제',festivals.length],['weather','날씨',weatherData||forecastData],['fuel','주유소',fuelData||exploreReady],['parking','주차장',parkingIndex],['food','식품안심업소',foodIndex]].filter(x=>x[2]);

const parkingCache=new Map(), parkingPending=new Set(), parkingErrors=new Set();
const parkingMarkers=L.layerGroup().addTo(map);
let parkingFilter='', parkingCode=null, parkingShown=[];
const liveFor=x=>parkingLive?.items.find(l=>l.matchId===x.id&&Number.isFinite(l.now)&&Number.isFinite(l.total));
// 수집·앱 조회는 10분 간격. 관측과 파일 생성이 모두 30분 안일 때만 최근 현황으로 쓴다.
// 서울 원자료의 시간대 없는 관측 시각은 한국 시간이며 기기 시간대에 맡기지 않는다.
function parkingObservation(l,data,now=Date.now(),failed=false) {
 const parse=value=>{
  if(typeof value!=='string'||!value.trim())return NaN;
  const raw=value.trim(),local=/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/.test(raw);
  if(!local&&!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(raw))return NaN;
  const calendar=Date.parse(raw.slice(0,10)+'T00:00:00Z');
  if(!Number.isFinite(calendar)||new Date(calendar).toISOString().slice(0,10)!==raw.slice(0,10)||Number(raw.slice(11,13))>23||Number(raw.slice(14,16))>59||Number(raw.slice(17,19)||0)>59)return NaN;
  return Date.parse(local?raw.replace(' ','T')+'+09:00':raw);
 };
 const at=parse(l?.at),updated=parse(data?.updated),limit=30*60000;
 const future=Number.isFinite(at)&&at>now||Number.isFinite(updated)&&updated>now;
 const recentFailure=failed||(Number.isFinite(parse(data?.lastFailure?.at))&&parse(data.lastFailure.at)>updated);
 const reason=future?'시각 확인 필요':recentFailure?'최근 갱신 실패':!Number.isFinite(at)?'관측 시각 미제공':!Number.isFinite(updated)?'수집 시각 미제공':now-at>=limit||now-updated>=limit?'오래된 자료':'';
 return {current:!reason,at:Number.isFinite(at)?at:null,reason};
}
function parkingLiveState(l) { return parkingObservation(l,parkingLive,Date.now(),exploreFailed.has('parking-live')); }
function parkingObservedTime(state) {
 return state.at===null?'관측 시각 미제공':new Date(state.at).toLocaleString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Seoul'})+' 관측';
}
function parkingLiveText(l) {
 const space=parkingSpace(l),state=parkingLiveState(l),stamp=parkingObservedTime(state);
 return (state.current?'최근 관측 빈자리 ':'마지막 관측 빈자리 ')+space.free+'면 · '+(state.current?space.state+' · ':'')+stamp+(state.current?'':' · '+state.reason+' · 현재 현황 확인 필요');
}
const parkingDistance=x=>selection&&NallaeDiscovery.point(x)?NallaeLocalScope.distance(selection.origin,[x.lat,x.lon]):Infinity;
function parkingSpace(l) { const free=Math.max(0,l.total-l.now), r=l.total>0?free/l.total:0;return {free,state:r>=.3?'여유':r<.1?'혼잡':'보통',tone:r>=.3?'easy':r<.1?'busy':'normal'}; }
function parkingText(x,only=false) {
 const l=only?(Number.isFinite(x.now)&&Number.isFinite(x.total)?x:null):liveFor(x), a=l&&parkingSpace(l);
 const fee=x.fee==='무료'?'무료':[x.fee,x.basic&&Number.isFinite(x.basic.won)&&Number.isFinite(x.basic.min)?'기본 '+x.basic.min+'분 '+money(x.basic.won):'',x.add&&Number.isFinite(x.add.won)&&Number.isFinite(x.add.min)?'추가 '+x.add.min+'분 '+money(x.add.won):'',Number.isFinite(x.dayMax)?'하루 최대 '+money(x.dayMax):''].filter(Boolean).join(' · ');
 const hours=[['평일',x.weekday],['토',x.sat],['공휴일',x.holiday]].filter(v=>v[1]).map(v=>v.join(' ')).join(' · ');
 const distance=parkingDistance(x),distanceText=Number.isFinite(distance)?'직선 '+(distance<1000?Math.round(distance)+'m':(distance/1000).toFixed(1)+'km'):'거리 미확인';
 return '<h3>'+escapeHtml(x.name)+'</h3><p class="place-distance">'+distanceText+'</p><p>'+escapeHtml([x.kind,x.type,Number.isFinite(x.spaces)?x.spaces+'면':only?x.total+'면':''].filter(Boolean).join(' · '))+'</p><p>'+escapeHtml(fee||'요금 미제공')+'</p>'+(hours?'<p>'+escapeHtml(hours)+'</p>':'')+'<p>'+escapeHtml(x.address||'주소 미제공')+'</p>'+(a?'<p class="parking-live '+(parkingLiveState(l).current?a.tone:'')+'" data-parking-observation="'+escapeHtml(l.code||l.matchId||'')+'">'+escapeHtml(parkingLiveText(l))+'</p>':'')+(x.ref?'<p class="src">자료 기준일 '+escapeHtml(x.ref)+'</p>':'')+(only?addressLink(x.address):locationActions(x,'parking'));
}
async function loadParking(code) {
 parkingPending.add(code);parkingErrors.delete(code);
 try { const d=await fetchJsonData('data/'+(DEMO?'demo-parking/':'parking/')+encodeURIComponent(code)+'.json');if(!Array.isArray(d.items)) throw Error();parkingCache.set(code,d); }catch(_){parkingErrors.add(code);}
 parkingPending.delete(code);if(mode==='explore'&&exploreLayer==='parking'&&selection?.center.code===code) renderExplore();
}
function renderParking() {
 const code=muniByCode.has(selection?.center.code)?selection.center.code:null;
 if(parkingCode!==code){parkingCode=code;parkingFilter='';}parkingShown=[];
 exploreTools.innerHTML=sourceDisclosure('전국주차장정보표준데이터 · 기준일은 지자체마다 달라요','전국주차장정보표준데이터 · 기준일은 지자체마다 달라요 · 서울은 서울시 공영주차장 안내로 보충(위치 없는 곳은 목록만) · 시영주차장 실시간은 서울열린데이터광장, 현장과 다를 수 있어요');
 if(!code){feedEl.innerHTML='<li class="empty">지도에서 시·군·구를 고르면 그 동네 주차장을 보여드려요<div class="explore-toggle">'+favorites.map(r=>'<button type="button" data-parking-region="'+escapeHtml(r.code)+'">'+escapeHtml(r.name)+'</button>').join('')+'</div></li>';return;}
 const data=parkingCache.get(code), extra=(parkingLive?.items||[]).filter(x=>x.sgg===code&&!x.matchId);
 if(!data&&parkingIndex.counts[code]>0){feedEl.innerHTML='<li class="empty">'+(parkingErrors.has(code)?'지역 자료를 받지 못했어요. <button type="button" data-parking-retry>다시 받기</button>':'지역 자료를 불러오는 중이에요.')+'</li>';if(!parkingPending.has(code)&&!parkingErrors.has(code)) loadParking(code);return;}
 const items=data?.items||[], hasFree=x=>{const l=liveFor(x);return l&&parkingLiveState(l).current&&parkingSpace(l).free>0;};
 const filters=[['','전체'],...(items.concat(extra).some(x=>x.fee==='무료')?[['free','무료']]:[]),...(items.some(x=>x.kind==='공영')||extra.length?[['public','공영']]:[]),...(items.some(hasFree)||extra.some(x=>Number.isFinite(x.now)&&x.total>x.now&&parkingLiveState(x).current)?[['live','최근 관측 빈자리(서울)']]:[])];
 if(!filters.some(x=>x[0]===parkingFilter)) parkingFilter='';
 exploreTools.innerHTML+='<div class="explore-toggle">'+filters.map(([k,n])=>'<button type="button" data-parking-filter="'+k+'" aria-pressed="'+(k===parkingFilter)+'">'+n+'</button>').join('')+'</div>';
 const accept=(x,only=false)=>!parkingFilter||parkingFilter==='free'&&x.fee==='무료'||parkingFilter==='public'&&(x.kind==='공영'||only)||parkingFilter==='live'&&(only?Number.isFinite(x.now)&&x.total>x.now&&parkingLiveState(x).current:hasFree(x));
 parkingShown=items.filter(x=>accept(x)).sort((a,b)=>parkingDistance(a)-parkingDistance(b)||Number(!!liveFor(b))-Number(!!liveFor(a))||Number(b.fee==='무료')-Number(a.fee==='무료')||a.name.localeCompare(b.name,'ko'));
 const rest=extra.filter(x=>accept(x,true));
 feedEl.innerHTML='<li class="explore-source">'+(selection.fromLocation?'내 위치':'선택한 동네 대표 지점')+'에서 가까운 순 · 직선거리 · 선택 동네에 수록된 주차장</li>'+parkingShown.map(x=>'<li class="festival-card">'+parkingText(x)+'</li>').join('')+(rest.length?'<li class="explore-source">위치·거리 미확인 · 실시간만 있는 곳</li>'+rest.map(x=>'<li class="festival-card">'+parkingText(x,true)+'</li>').join(''):'')+(!parkingShown.length&&!rest.length?'<li class="empty">이 지역에 해당하는 주차장 자료가 없어요.</li>':'');renderParkingMarkers();
}
function renderParkingMarkers(){
 parkingMarkers.clearLayers();if(mode!=='explore'||exploreLayer!=='parking')return;
 const groups=[];for(const x of parkingShown){if(!Number.isFinite(x.lat)||!Number.isFinite(x.lon)||Math.abs(x.lat)>90||Math.abs(x.lon)>180)continue;const pt=map.latLngToContainerPoint([x.lat,x.lon]);let g=groups.find(g=>g.pt.distanceTo(pt)<(map.getZoom()>=16?1:map.getZoom()<MUNI_ZOOM?44:26));if(!g){g={pt,items:[]};groups.push(g);}g.items.push(x);}
 for(const g of groups){const bounds=L.latLngBounds(g.items.map(x=>[x.lat,x.lon])), x=g.items[0],l=g.items.length===1&&liveFor(x),a=l&&parkingLiveState(l).current&&parkingSpace(l);
 const marker=L.marker(g.items.length===1?[x.lat,x.lon]:bounds.getCenter(),{title:g.items.length>1?'주차장 '+g.items.length+'곳 묶음 · 확대해서 개별 위치 보기':x.name,icon:L.divIcon({className:'parking-marker',html:'<span class="parking-pin '+(g.items.length>1?'place-cluster':x.fee==='무료'?'free':'')+'">'+(g.items.length>1?g.items.length:'P')+'</span>'+(a?'<span class="parking-tag '+a.tone+'" data-parking-live-tag="'+escapeHtml(l.code||l.matchId||'')+'" title="'+escapeHtml(parkingObservedTime(parkingLiveState(l)))+'">빈 '+a.free+' · '+a.state+'</span>':''),iconSize:[44,44],iconAnchor:[22,g.items.length>1?22:40]})}).addTo(parkingMarkers);
 if(g.items.length>1)marker.on('click',()=>moveToBounds(bounds,{paddingTopLeft:leftPad(),paddingBottomRight:bottomPad(),maxZoom:Math.min(18,map.getZoom()+3),duration:.6}));if(g.items.length===1||map.getZoom()>=18)marker.bindPopup(g.items.map(x=>parkingText(x)).join('<hr>'));
 }
}
map.on('moveend zoomend',renderParkingMarkers);
exploreTools.addEventListener('click',e=>{const b=e.target.closest('[data-parking-filter]');if(b){parkingFilter=b.dataset.parkingFilter;renderExplore();}});
feedEl.addEventListener('click',e=>{if(mode!=='explore'||exploreLayer!=='parking')return;const b=e.target.closest('button');if(!b)return;if(b.dataset.parkingRegion){const m=muniByCode.get(b.dataset.parkingRegion);if(m)select(m,false);}if(b.hasAttribute('data-parking-retry')){loadParking(parkingCode);renderExplore();}});
function updateParkingLiveLabels() {
 if(mode!=='explore'||exploreLayer!=='parking')return;
 const records=new Map((parkingLive?.items||[]).map(l=>[l.code||l.matchId||'',l]));let staleInFilter=false;
 for(const el of document.querySelectorAll('[data-parking-observation]')) {
  const l=records.get(el.dataset.parkingObservation);if(!l)continue;
  const state=parkingLiveState(l),text=parkingLiveText(l);if(el.textContent!==text)el.textContent=text;
  el.className='parking-live '+(state.current?parkingSpace(l).tone:'');if(!state.current)staleInFilter=true;
 }
 for(const el of document.querySelectorAll('[data-parking-live-tag]')) {
  const l=records.get(el.dataset.parkingLiveTag);el.hidden=!l||!parkingLiveState(l).current;
 }
 if(parkingFilter==='live'&&staleInFilter){const scroll=feedEl.scrollTop;renderParking();feedEl.scrollTop=scroll;}
}
setInterval(updateParkingLiveLabels,30000);
setInterval(async()=>{
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
 try{
  const r=await fetch('data/'+(DEMO?'demo-parking-live':'parking-live')+'.json',{cache:'no-store',signal:controller.signal});if(!r.ok)throw Error('parking response');
  const d=await r.json();if(!Array.isArray(d.items))throw Error('parking data');parkingLive=d;exploreFailed.delete('parking-live');
  if(mode==='explore'&&exploreLayer==='parking'){const scroll=feedEl.scrollTop;renderExplore();feedEl.scrollTop=scroll;}
 }catch(_){exploreFailed.add('parking-live');updateParkingLiveLabels();}finally{clearTimeout(timeout);}
},10*60*1000);
function fuelColor(code) {
  const price=fuelData?.sgg?.[code]?.[fuelProduct], avg=fuelData?.national?.[fuelProduct]?.price;
  if (!Number.isFinite(price) || !Number.isFinite(avg)) return null;
  const d=price-avg; return fuelColors[d < -50?0:d < -10?1:d <= 10?2:d <= 50?3:4];
}
// 탐험 자료: 응답이 200이어도 필수 구조가 없으면 실패로 본다. 재시도에 성공하면 실패 표시를 지운다.
const EXPLORE_NAMES={fuel:'주유소',weather:'날씨','parking/index':'주차장','food/index':'식품안심업소','places':'소개된 식당','outings/index':'놀거리'};
const exploreValid={fuel:d=>d.sgg&&Array.isArray(d.stations)&&d.national,'food/index':d=>d.counts,weather:d=>d.sgg,forecast:d=>d.sgg,'parking/index':d=>d.counts,'parking-live':d=>Array.isArray(d.items),'places':d=>Array.isArray(d.items),'place-locations':d=>d.items&&typeof d.items==='object'&&!Array.isArray(d.items),'outings/index':d=>d.counts&&Array.isArray(d.featured)&&d.total>0};
const exploreMissing=()=>Object.entries(EXPLORE_NAMES).filter(([k])=>exploreFailed.has(k)).map(x=>x[1]);
async function loadExploreData(keys=Object.keys(exploreValid)) {
  const first=!exploreReady; // 다시 시도할 때는 보고 있던 분류를 바꾸지 않는다
  let rendered=false, renderedLayer=null;
  await Promise.all(keys.map(async key=>{
    const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),12000);
    try {
      const r=await fetch('data/'+(DEMO&&!['places','place-locations','outings/index'].includes(key)?(key==='food/index'?'demo-food/index':'demo-'+key):key)+'.json',{cache:'no-store',signal:controller.signal});
      if (!r.ok) throw Error(); const data=await r.json();
      if (!data || !exploreValid[key](data)) throw Error('invalid');
      if(key==='fuel') fuelData=data; else if(key==='weather') weatherData=data; else if(key==='forecast') forecastData=data;
      else if(key==='food/index') foodIndex=data; else if(key==='parking/index') parkingIndex=data; else if(key==='places') placesData=data; else if(key==='place-locations') placeLocations=data; else if(key==='outings/index') outingIndex=data; else parkingLive=data;
      exploreFailed.delete(key);
    } catch (_) { exploreFailed.add(key); }
    finally {
      clearTimeout(timeout); if(key==='weather')updateBeforeOuting();
      // コスに必要な場所・食堂・座標だけを待つ。生活情報の遅延からは独立する。
      // 食堂や座標が失敗しても、成功した公園・観光地のコースを表示する。
      const courseReady=outingIndex&&(placesData||exploreFailed.has('places'))&&(placeLocations||exploreFailed.has('place-locations'));
      if(first&&mode==='explore'&&((['outings/index','places','place-locations'].includes(key)&&exploreLayer==='outing'&&courseReady)||(['places','place-locations'].includes(key)&&exploreLayer==='places'&&placesData))&&!exploreTools.querySelector('.outing-filters-dialog[open]')) {
        const scroll=feedEl.scrollTop;renderExplore();feedEl.scrollTop=scroll;fitSheet();rendered=true;renderedLayer=exploreLayer;
      }
    }
  }));
  exploreReady=true;
  if(first&&!exploreChoiceChanged&&availableLayers().some(x=>x[0]===preferredExploreLayer)) exploreLayer=preferredExploreLayer;
  if(mode==='explore') { syncCategories(); if(!rendered||exploreLayer!==renderedLayer||!['outing','places'].includes(exploreLayer)){const scroll=feedEl.scrollTop;renderExplore();feedEl.scrollTop=scroll;fitSheet();} }
}
// 보고 있는 정보가 정상이어도 빠진 생활 정보가 있으면 한 줄로 알리고 다시 시도할 수 있게 한다
function noteExploreMissing() {
  const missing=exploreMissing(), alert=document.getElementById('collection-alert');
  if(!exploreReady || !missing.length || !alert.hidden) return missing;
  alert.hidden=false; setAlert('failed',missing.join('·')+' 자료를 불러오지 못해 분류에서 뺐어요','다시 시도','explore');
  return missing;
}
function updateExploreStatus() {
  if(exploreLayer==='fuel'&&selection&&!DEMO&&!fuelSampleFallback){
    const query={lat:selection.origin[0],lon:selection.origin[1],radius:fuelRadius,product:fuelProduct},entry=nearbyFuelClient.peek(query),status=document.getElementById('collection-status');
    status.textContent=entry?.status==='ready'?ago(new Date(entry.data.asOf)):entry?.status==='error'?'조회 미완료':'반경 조회';
    status.classList.toggle('failed',entry?.status==='error');status.classList.remove('stale');status.setAttribute('aria-label','주유소 반경 조회: '+status.textContent);
    document.getElementById('collection-alert').hidden=true;document.getElementById('sources-detail').textContent='오피넷 반경 내 조회 · 가격과 관계없이 수집한 동일 목록을 거리순·최저가순으로 정렬해요. '+(entry?.status==='ready'?'자료 기준: '+entry.data.asOf:'아직 완료된 반경 조회가 없어요.');return;
  }
  if(exploreLayer==='outing') {
    const status=document.getElementById('collection-status');status.textContent='장소 자료·출처';status.classList.remove('failed','stale');
    status.setAttribute('aria-label',status.textContent+'. 자료 기준일과 출처 보기');document.getElementById('collection-alert').hidden=true;
    document.getElementById('sources-detail').textContent='전국관광지·도시공원 표준데이터 · 가져온 날 '+(outingIndex?.updated||'미확인').slice(0,10)+' · 각 장소의 자료 기준일은 카드에 표시해요. 현재 개방·안전·요금은 방문 전에 확인해 주세요.';return;
  }
  if(exploreLayer==='festival') return updateFestivalStatus();
  if(exploreLayer==='places') {
    const status=document.getElementById('collection-status');
    status.textContent='식당 '+allPlaceItems().length+'곳'; status.classList.remove('failed','stale');
    status.setAttribute('aria-label',status.textContent+'. 출처와 자료 기준일 보기');
    document.getElementById('collection-alert').hidden=true; noteExploreMissing();
    document.getElementById('sources-detail').textContent='영상 소개·운영자 추천 확인일 '+(placesData.listCheckedAt||'미제공')+' · 백년가게 지정 자료 2026-08-20, 업종 자료 2022-07-13 · 행정안전부 착한가격업소 자료 2026-09-30 · 매장 공식 메뉴는 각 카드에 확인일을 표시해요. 맛·위생·현재 영업을 보증하지 않아요.';
    return;
  }
  const data=exploreLayer==='fuel'?fuelData:exploreLayer==='weather'?weatherData:exploreLayer==='parking'?parkingIndex:foodIndex, date=new Date(exploreLayer==='weather'?weatherData?.base:data?.updated);
  const status=document.getElementById('collection-status'), stale=exploreLayer==='weather'?weatherFreshness(weatherData,exploreFailed.has('weather'),2)!=='current':!validDate(date)||Date.now()-date>(exploreLayer==='fuel'?6:48)*3600000;
  status.textContent=!exploreReady?'불러오는 중':validDate(date)?ago(date):'시각 미제공'; status.classList.remove('failed'); status.classList.toggle('stale',stale);
  status.setAttribute('aria-label','자료 확인 시각: '+status.textContent+'. 상세 보기');
  const alert=document.getElementById('collection-alert'); alert.hidden=!stale;
  if(stale) setAlert('stale',validDate(date)?(availableLayers().find(x=>x[0]===exploreLayer)?.[1]||'자료')+' 자료가 '+ago(date)+' 기준이에요':'자료 확인 시각이 없어요','자세히');
  const missing=noteExploreMissing();
  document.getElementById('sources-detail').textContent=(missing.length?'불러오지 못한 자료: '+missing.join('·')+' · ':'')+(exploreLayer==='weather'?'기상청 초단기실황':exploreLayer==='fuel'?'오피넷(한국석유공사)':exploreLayer==='parking'?'전국주차장정보표준데이터 · 서울열린데이터광장':'식품안전나라(식품의약품안전처)')+' · 확인 시각: '+(validDate(date)?date.toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'미제공');
}
function renderExplore() {
  if(exploreTools.querySelector('.outing-filters-dialog[open]'))return;
  // A direct tab link keeps its destination while the first batch is loading.
  if(sectionEntry && !exploreChoiceChanged &&
      ['places','utilities'].includes(requestedView) && !availableLayers().some(([key])=>key===exploreLayer)) {
    syncModeNavigation();
    panel.dataset.exploreLayer=exploreLayer;
    exploreTools.hidden=true;
    newButton.hidden=true;
    titleEl.textContent=requestedView==='places'?'맛집':'생활정보';
    subEl.textContent='';
    syncCategories();
    feedEl.innerHTML=exploreReady
      ? '<li class="empty">자료를 받지 못했어요. <button type="button" data-entry-retry>다시 받기</button></li>'
      : '<li class="empty" role="status">자료를 불러오는 중이에요…</li>';
    return;
  }
  if(exploreLayer==='outing'&&(overseasView||savedView&&outingTheme==='travel')){syncModeNavigation();panel.dataset.exploreLayer='outing';exploreTools.hidden=false;syncCategories();newButton.hidden=true;if(exploreTools.dataset.travelView!==travelViewKey())renderTravel();return;}
  if(exploreLayer==='outing'&&!outingIndex&&!savedView&&!overseasView&&!(discoveryCatalog&&!selection)){syncModeNavigation();panel.dataset.exploreLayer='outing';exploreTools.hidden=false;exploreTools.innerHTML='';titleEl.textContent='오늘 뭐 할까?';subEl.textContent='';feedEl.innerHTML=nextOutingCard()+(exploreReady?'<li class="empty">코스에 필요한 장소 자료를 받지 못했어요. <button type="button" data-outings-load>다시 받기</button></li>':'<li class="empty" role="status">가까운 코스를 준비하고 있어요…</li>');return;}
  locationFocus.clearLayers();
  outingMarkers.clearLayers();
  const available=availableLayers();
  if(!available.some(x=>x[0]===exploreLayer)&&!(savedView&&exploreLayer==='outing')) exploreLayer=available[0]?.[0] || 'festival';
  syncModeNavigation();
  panel.dataset.exploreLayer=exploreLayer;
  exploreTools.hidden=mode!=='explore'; exploreTools.innerHTML=''; fuelMarkers.clearLayers(); festivalMarkers.clearLayers(); parkingMarkers.clearLayers(); placeMarkers.clearLayers(); map.attributionControl.removeAttribution(placeAttribution);
  munis.forEach(restyle); scheduleLabels();
  updateRainScene();
  if(mode!=='explore') return;
  if(exploreLayer==='outing'&&(overseasView||savedView&&outingTheme==='travel')){syncCategories();newButton.hidden=true;renderTravel();return;}
  if(exploreLayer==='festival') return renderFestivals();
  syncCategories(); newButton.hidden=true; updateExploreStatus();
  titleEl.textContent=selection?regionTitle(selection.center):exploreLayer==='weather'?'날씨 지도':'동네 탐험';
  subEl.textContent=exploreLayer==='weather'?'지도에서 동네를 누르면 실황과 예보를 볼 수 있어요':exploreLayer==='fuel'?'주변 주유소 · 거리순·최저가순':exploreLayer==='parking'?'동네 주차장':exploreLayer==='places'?'영상에 소개된 식당·운영자 추천 (지역별 순차 제공)':'동네 식품안심업소';
  if(exploreLayer==='outing') renderOutings(); else if(exploreLayer==='weather') renderWeather(); else if(exploreLayer==='fuel') renderFuel(); else if(exploreLayer==='parking') renderParking(); else if(exploreLayer==='places') renderPlaces(); else renderFood();
}
// extra: 요약 줄 오른쪽에 붙는 보기 전용 범례(색 띠) — 따로 한 줄을 쓰지 않아 지도 자리를 아낀다
function sourceDisclosure(summary, detail = summary, extra = '') { return '<details class="source-disclosure"><summary><span class="disclosure-text">'+escapeHtml(summary)+'</span>'+extra+'</summary><p>'+escapeHtml(detail)+'</p></details>'; }
// 한국 자료의 시각은 기기 시간대와 관계없이 한국 시간(UTC+9)으로 표기한다
setInterval(async()=>{
  await loadExploreData(['weather','forecast']);
  updateBeforeOuting();
},3600000);
function weatherColor(code) {
  const t=weatherData?.sgg?.[code]?.t;
  if(!Number.isFinite(t) || weatherFreshness(weatherData,exploreFailed.has('weather'),2)!=='current') return null;
  const stops=[[167,201,226],[216,226,222],[244,222,169],[239,185,142]], x=Math.max(0,Math.min(3,(t+10)/15)), i=Math.min(2,Math.floor(x)), f=x-i;
  return 'rgb('+stops[i].map((v,j)=>Math.round(v+(stops[i+1][j]-v)*f)).join(',')+')';
}
const koreaDate=date=>new Date(date.getTime()+9*3600000).toISOString().slice(0,10);
// 오늘의 지역별 예보를 보여주는 장식. 실제 비구름·강수 범위·강도를 뜻하지 않는다.
const rainScene = L.layerGroup().addTo(map);
// 실황 마커와 단기예보는 같은 원본 우산·눈사람을 각각의 자료에 맞춰 사용한다.
function weatherArtwork(pty, compact=false) {
  if (![1,2,3,4,5,6,7].includes(pty)) return '';
  const kind = ({5:1,6:2,7:3})[pty] || pty;
  const umbrella = kind !== 3 ? '<g class="rain-umbrella"><path class="umbrella-handle" d="M53 7v40q0 10 9 4"/><path d="M28 28a25 25 0 0 1 50 0Q72 22 65 28Q53 21 41 28Q34 22 28 28Z"/><circle class="weather-eye" cx="47" cy="17" r="1.4"/><circle class="weather-eye" cx="59" cy="17" r="1.4"/><ellipse class="weather-cheek" cx="43" cy="20" rx="2.4" ry="1.4"/><ellipse class="weather-cheek" cx="63" cy="20" rx="2.4" ry="1.4"/><path class="umbrella-smile" d="M50 20q3 3 6 0"/></g>' : '';
  const drops = kind !== 3 ? [22,36,73,87].map((x,i)=>'<path class="rain-drop" style="animation-delay:-'+(i*.29)+'s" d="M'+x+' 2q-6 7 0 8q6-1 0-8Z"/>').join('') : '';
  const flakes = kind !== 1 && kind !== 4 ? [24,44,65,83].map((x,i)=>'<g class="snow-flake" style="animation-delay:-'+i*.8+'s"><path d="M'+x+' 10v12m-5-9 10 6m-10 0 10-6"/></g>').join('') : '';
  const snowman = kind === 3 ? '<g class="snowman"><path class="snowman-arm" d="M39 39 29 33m40 6 10-6"/><ellipse class="snowman-body" cx="54" cy="43" rx="15" ry="13"/><circle class="snowman-body" cx="54" cy="22" r="10"/><path class="snowman-scarf" d="M44 30q10 5 20 0v5q-10 4-20 0Zm14 4 6 1-1 10-6-2Z"/><circle class="snowman-eye" cx="50" cy="21" r="1.3"/><circle class="snowman-eye" cx="58" cy="21" r="1.3"/><path class="snowman-nose" d="m53 24 8 2-8 1Z"/><circle class="snowman-eye" cx="54" cy="41" r="1.3"/><circle class="snowman-eye" cx="54" cy="47" r="1.3"/></g>' : '';
  const view=compact?'23 0 62 57':'0 0 108 60';
  return '<svg viewBox="'+view+'" aria-hidden="true">'+umbrella+drops+snowman+flakes+'</svg>';
}
function updateRainScene() {
  rainScene.clearLayers();
  if (document.hidden || mode !== 'explore' || exploreLayer !== 'weather' || !selection) return;
  const region = selection.center, preview = DEMO && (params.has('rain') || params.has('snow'));
  const age = Date.now() - Date.parse(forecastData?.base);
  const day = forecastData?.sgg?.[region.code]?.[koreaDate(new Date())];
  if (!preview && (exploreFailed.has('forecast') || !(age >= 0 && age <= 36*3600000) || ![1,2,3,4].includes(day?.pty))) return;
  if (!map.getBounds().contains(region.center)) return;
  const kind = preview ? (params.has('snow') ? 3 : 1) : day.pty;
  const name = kind === 3 ? '눈' : kind === 2 ? '비·눈' : '비';
  const caption = name + (preview ? ' 연출 미리보기' : ' 예보');
  const text = preview ? name+' 연출 미리보기. 실제 날씨가 아니에요.' : '오늘 '+name+' 예보 연출. 현재 강수나 정확한 범위가 아니에요.';
  L.marker(region.center, { pane:'decor', interactive:false, keyboard:false, icon:L.divIcon({className:'rain-scene-marker',iconSize:[108,80],iconAnchor:[54,65],html:'<span class="rain-scene" role="img" aria-label="'+text+'">'+weatherArtwork(kind)+'<span class="rain-scene-caption">'+(preview?'':'오늘 ')+caption+'</span></span>'}) }).addTo(rainScene);
}
map.on('moveend zoomend', updateRainScene);
document.addEventListener('visibilitychange', updateRainScene);
function forecastHour() {
  const state=weatherFreshness(forecastData,exploreFailed.has('forecast'),36);
  const note=state==='old'?' · 지난 발표':state==='unverified'?' · 갱신 확인 필요':state==='unknown'?' · 시각 확인 필요':'';
  return '단기예보 '+weatherTime(forecastData?.base)+' 발표'+note;
}
function forecastCards(code) {
 const state=weatherFreshness(forecastData,exploreFailed.has('forecast'),36);
 return '<h4 class="weather-kind">오늘·내일 예보</h4><div class="forecast-days">'+[0,1].map(offset=>{
  const d=forecastData?.sgg?.[code]?.[koreaDate(new Date(Date.now()+offset*86400000))], name=offset?'내일':'오늘';
  if(!d) return '<section><h4>'+name+'</h4><p>예보 미제공</p></section>';
  const midday={1:'맑음',3:'구름많음',4:'흐림'}[d.sky];
  const sky=d.pty>0?'한때 '+(observedPrecipitation[d.pty]||'강수'):midday?'낮 12시 '+midday:'하늘 미제공';
  const art=state==='current'?weatherArtwork(d.pty,true):'';
  const skyIcon=state==='current'&&!(d.pty>0)?({1:'☀',3:'☁',4:'☁'}[d.sky]||''):'';
  const lo=Number.isFinite(d.tmn), hi=Number.isFinite(d.tmx);
  const temps=lo&&hi ? d.tmn+'° / '+d.tmx+'°' : lo ? '최저 '+d.tmn+'°' : hi ? '최고 '+d.tmx+'°' : '';
  return '<section><h4>'+name+'</h4><p class="forecast-condition">'+(art?'<span class="weather-inline-art">'+art+'</span>':skyIcon?'<span aria-hidden="true">'+skyIcon+'</span>':'')+sky+'</p>'+(temps?'<strong>'+temps+'</strong>':'')+(Number.isFinite(d.pop)?'<p>최대 강수확률 '+d.pop+'%</p>':'')+'</section>';
 }).join('')+'</div>'+(forecastData?'<p class="forecast-source">'+forecastHour()+'</p>':'');
}
function forecastSummary() {
 if(!forecastData || weatherFreshness(forecastData,exploreFailed.has('forecast'),36)!=='current') return '';
 const day=koreaDate(new Date(Date.now()+86400000)),groups=new Map();let count=0,available=0;
 Object.entries(forecastData.sgg).forEach(([code,days])=>{
   const d=days?.[day],m=muniByCode.get(code);
   if(!m||!d||(!Number.isFinite(d.pop)&&!Number.isFinite(d.pty)))return;
   available++;
   if(!(d.pop>=60||d.pty>0))return;
   count++;const name=sidos.get(m.sido)?.short||m.sido;groups.set(name,(groups.get(name)||0)+1);
 });
 if(!available)return '';
 return '<li class="festival-card"><h3>내일 강수 예보</h3><p>자료가 있는 '+available+'곳 중 '+count+'곳'+(count?' · '+escapeHtml([...groups].map(([name,n])=>name+' '+n+'곳').join(', ')):'')+'</p><p>강수형태가 있거나 최대 강수확률 60% 이상 · '+forecastHour()+'</p></li>';
}
let lastWeatherTimeKey='';
function weatherTimeKey() {
  return [weatherFreshness(weatherData,exploreFailed.has('weather'),2),weatherFreshness(forecastData,exploreFailed.has('forecast'),36),koreaDate(new Date())].join('|');
}
function updateWeatherTime() {
  if(!document.hidden && mode==='explore' && exploreLayer==='weather' && (weatherData || forecastData) && lastWeatherTimeKey!==weatherTimeKey())renderExplore();
}
document.addEventListener('visibilitychange',updateWeatherTime);
setInterval(updateWeatherTime,60000);
function renderWeather() {
  lastWeatherTimeKey=weatherTimeKey();
  const code=selection?.center.code, region=muniByCode.get(code), data=weatherData?.sgg||{}, w=data[code];
  const state=weatherFreshness(weatherData,exploreFailed.has('weather'),2), current=state==='current';
  const rows=Object.entries(data).filter(([c,v])=>muniByCode.has(c)&&Number.isFinite(v?.t)).sort((a,b)=>a[1].t-b[1].t);
  const observation=weatherData?weatherStamp(state)+' · '+weatherTime(weatherData.base):'관측 미제공';
  exploreTools.innerHTML=sourceDisclosure('기상청 · '+observation, '기상청 초단기실황 · '+observation+' (한국 시간). '+rows.length+'개 시·군·구의 대표 격자 값이에요. 확대하면 더 많은 동네가 보여요. 우산·눈사람은 지도 표식 안에서는 관측, 날짜가 붙은 상세와 예보 연출에서는 예보를 뜻해요.'+(forecastData?' '+forecastHour()+' (한국 시간).':''));
  const retry=(!weatherData||!forecastData||!current||exploreFailed.has('forecast')||rows.length<munis.length)?'<button type="button" data-entry-retry data-weather-retry>날씨 다시 받기</button>':'';
  const line=([c,v])=>'<p>'+escapeHtml(label(muniByCode.get(c)))+' <strong>'+v.t+'°</strong>'+(v.pty>0?' · '+(observedPrecipitation[v.pty]||'강수'):'')+'</p>';
  if(code) {
    const art=current&&w?weatherArtwork(w.pty,true):'';
    const reading=w&&Number.isFinite(w.t)?'<p class="weather-kind">'+observation+'</p><div class="weather-detail-reading"><strong class="temperature">'+w.t+'°</strong>'+(art?'<span class="weather-inline-art">'+art+'</span>':'')+'<span>'+(observedPrecipitation[w.pty]||'강수형태 미제공')+'</span></div><p>습도 '+(Number.isFinite(w.reh)?w.reh+'%':'미제공')+' · 바람 '+(Number.isFinite(w.wsd)?w.wsd+'m/s':'미제공')+' · 1시간 강수 '+(Number.isFinite(w.rn)?w.rn+'mm':'미제공')+'</p>':'<p>이 동네의 관측값이 없어요.</p>';
    feedEl.innerHTML='<li class="festival-card weather-card"><h3>'+escapeHtml(region?label(region):code)+'</h3>'+reading+forecastCards(code)+retry+'</li>';
  } else {
    const wet=rows.filter(([,v])=>v.pty>0);
    feedEl.innerHTML='<li class="festival-card"><h3>전국 날씨 지도</h3><p>'+observation+' · '+rows.length+' / '+munis.length+'곳</p><p>표식을 누르면 그 동네의 오늘·내일 예보를 볼 수 있어요.</p>'+retry+'</li>'+forecastSummary()+(rows.length?'<li class="festival-card"><h3>높게 관측된 기온</h3>'+rows.slice(-3).reverse().map(line).join('')+'</li><li class="festival-card"><h3>낮게 관측된 기온</h3>'+rows.slice(0,3).map(line).join('')+'</li>':'')+(wet.length?'<li class="festival-card"><h3>비·눈을 관측한 곳</h3>'+wet.map(line).join('')+'</li>':'');
  }
}
exploreTools.addEventListener('click',e=>{const b=e.target.closest('[data-legend]');if(b) exploreTools.querySelector('.legend-detail').textContent=b.dataset.legend;});
function stationText(s) { return '<p class="price-line"><strong class="price">'+money(s.price[fuelProduct])+(Number.isFinite(s.price[fuelProduct])?'<small>/L</small>':'')+'</strong> '+productName()+'</p><h3>'+escapeHtml(s.name)+'</h3><p>'+escapeHtml(({GSC:'GS칼텍스',SKE:'SK에너지',HDO:'HD현대오일뱅크',SOL:'S-OIL',RTE:'알뜰주유소',RTX:'알뜰주유소',NHO:'농협알뜰',ETC:'자가상표',E1G:'E1',SKG:'SK가스'})[s.brand] || s.brand || '상표 미제공')+'</p><p>'+escapeHtml(s.address || '주소 미제공')+'</p>'+(s.asOf&&validDate(new Date(s.asOf))?'<p class="fuel-asof">'+escapeHtml(new Date(s.asOf).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Seoul'}))+' 수집 값</p>':'')+locationActions(s,'fuel'); }
// 카카오맵 연결 (키·요금 없는 공개 링크). 앱이 있으면 앱, 없으면 웹. 누를 때만 외부로 나간다.
// 좌표가 있으면 그 지점을 도착지로 길찾기, 주소만 있으면 주소 검색.
const locationFocus=L.layerGroup().addTo(map);
const hasLocationPoint=p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180;
function locationActions(place,kind) {
  return '<div class="location-actions">'+(hasLocationPoint(place)?'<button type="button" data-location-kind="'+kind+'" data-location-id="'+escapeHtml(place.id)+'">지도에서 위치 보기</button>':'')+routeLink(place)+'</div>';
}
document.addEventListener('click',e=>{
  const button=e.target.closest('[data-location-id]');if(!button)return;
  const list=button.dataset.locationKind==='parking'?parkingShown:fuelShown;
  const place=list.find(p=>String(p.id)===button.dataset.locationId);if(!place||!hasLocationPoint(place))return;
  locationFocus.clearLayers();map.closePopup();userMovedMap();setSheetStage(0);clearTimeout(sheetFitTimer);
  const pin='<svg viewBox="0 0 44 44" aria-hidden="true"><path d="M22 40C18 32 8 25 8 17a14 14 0 0 1 28 0c0 8-10 15-14 23Z"/><circle cx="22" cy="17" r="5"/></svg>';
  const marker=L.marker([place.lat,place.lon],{title:place.name,icon:L.divIcon({className:'location-focus-pin',html:pin,iconSize:[44,44],iconAnchor:[22,40]})}).addTo(locationFocus);
  const popup=document.createElement('div');const name=document.createElement('strong');name.textContent=place.name;popup.append(name);
  const address=document.createElement('p');address.textContent=place.address||'출처에서 제공한 좌표예요.';popup.append(address);
  popup.insertAdjacentHTML('beforeend',routeLink(place));marker.bindPopup(popup);
  map.setView([place.lat,place.lon],17,{animate:false});marker.openPopup();
  toast('출처 제공 위치예요. 길찾기는 카카오맵으로 이어져요.');
});
function routeLink(s) {
  if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon)) return addressLink(s.address);
  const url = 'https://map.kakao.com/link/to/' + encodeURIComponent(String(s.name).replace(/,/g, ' ')) + ',' + s.lat + ',' + s.lon;
  return '<a class="food-map" data-route-destination data-route-name="'+escapeHtml(s.name)+'" data-route-lat="'+s.lat+'" data-route-lon="'+s.lon+'" href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">길찾기 ↗</a>';
}
function addressLink(address) {
  const q = String(address || '').replace(/\s*\(.*\)\s*$/, '').trim(); // 끝의 '(공덕동, 1층)' 같은 꼬리는 검색을 방해한다
  if (!q) return '';
  return '<a class="food-map" href="' + escapeHtml('https://map.kakao.com/link/search/' + encodeURIComponent(q)) + '" target="_blank" rel="noopener noreferrer">카카오맵에서 보기 ↗</a>';
}
// 출발점 선택은 앱 안에서, 실제 도로 경로·음성 안내는 카카오맵으로 연결한다.
const routeDialog=document.createElement('dialog');routeDialog.className='route-dialog';routeDialog.setAttribute('aria-labelledby','route-heading');document.body.append(routeDialog);
let routeDestination=null, routeStart=null, routeReturnStage=1;
const routePins=L.layerGroup().addTo(map);
function cancelRoutePicking() {
  if (!routePicking) return;
  routePicking=false;routePins.clearLayers();toast('출발점 선택을 취소했어요.');
}
function renderRouteDialog() {
  if(!routeDestination)return;
  routeDialog.innerHTML='<div class="route-dialog-head"><h2 id="route-heading">어떻게 갈까요?</h2><button type="button" data-route-close aria-label="길찾기 닫기">닫기</button></div><p class="route-destination"><strong>'+escapeHtml(routeDestination.name)+'</strong></p><p>'+ (routeStart?'출발: '+escapeHtml(routeStart.name):'출발점을 고르면 이동수단별 길찾기를 열 수 있어요.')+'</p><div class="route-origin-actions"><button type="button" data-route-pick>지도에서 출발점 고르기</button>'+(selection?.fromLocation?'<button type="button" data-route-location>내 위치를 출발점으로</button>':'')+'</div>'
    +(routeStart?'<div class="route-travel">'+[['walk','도보'],['traffic','대중교통'],['car','자동차'],['bicycle','자전거']].map(([travel,name])=>'<a href="'+escapeHtml(NallaeDiscovery.route([routeStart,routeDestination],travel))+'" target="_blank" rel="noopener noreferrer">'+name+' 길찾기 ↗</a>').join('')+'</div><p class="place-checked">출발점·목적지를 카카오맵으로 전달해 실제 경로를 확인해요.</p>':'')
    +'<a class="food-map" href="'+escapeHtml(NallaeDiscovery.route([routeDestination]))+'" target="_blank" rel="noopener noreferrer">카카오맵에서 출발지 선택 ↗</a><p class="place-checked">실제 도로 경로·이동 시간·음성 안내는 카카오맵에서 제공해요.</p>';
}
document.addEventListener('click',e=>{
  const link=e.target.closest('[data-route-destination]');if(!link||e.ctrlKey||e.metaKey||e.shiftKey)return;
  const dest={name:link.dataset.routeName,lat:Number(link.dataset.routeLat),lon:Number(link.dataset.routeLon)};if(!NallaeDiscovery.point(dest))return;
  e.preventDefault();routePicking=false;routePins.clearLayers();routeDestination=dest;routeStart=null;routeReturnStage=sheetStage;renderRouteDialog();routeDialog.showModal();
});
routeDialog.addEventListener('click',e=>{
  if(e.target.closest('[data-route-close]'))routeDialog.close();
  if(e.target.closest('[data-route-location]')&&selection?.fromLocation){routeStart={name:'내 위치',lat:selection.origin[0],lon:selection.origin[1]};renderRouteDialog();}
  if(e.target.closest('[data-route-pick]')){routeDialog.close();routePicking=true;setSheetStage(0);toast('지도에서 출발할 지점을 눌러 주세요. 목록을 다시 올리면 취소돼요.');}
});
map.on('click',e=>{
  if(!routePicking)return;routePicking=false;
  routeStart={name:'지도에서 고른 출발점',lat:e.latlng.lat,lon:e.latlng.lng};if(!NallaeDiscovery.point(routeStart)){toast('국내 지도 안에서 출발점을 골라 주세요.');return;}
  routePins.clearLayers();for(const [i,p] of [routeStart,routeDestination].entries())L.marker([p.lat,p.lon],{title:(i?'도착: ':'출발: ')+p.name,icon:L.divIcon({className:'route-point',html:'<span>'+(i?'도착':'출발')+'</span>',iconSize:[44,44],iconAnchor:[22,40]})}).addTo(routePins);
  setSheetStage(routeReturnStage);renderRouteDialog();routeDialog.showModal();
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&routePicking){cancelRoutePicking();setSheetStage(routeReturnStage);}});
routeDialog.addEventListener('close',()=>{if(!routePicking)routePins.clearLayers();});
function renderFuel() {
  fuelData??={national:{},sgg:{},stations:[]};
  const avg=fuelData.national[fuelProduct], local=selection && fuelData.sgg[selection.center.code]?.[fuelProduct];
  const diff=Number.isFinite(local)&&Number.isFinite(avg?.price)?local-avg.price:null;
  // 지역을 고르면 그 시·군·구 평균을 먼저, 전국 평균은 비교용. 직전 수집 값을 유지한 경우 그 기준 시각을 밝힌다.
  const kept=selection&&fuelData.asOf?.[selection.center.code]?.[fuelProduct], keptAt=kept&&new Date(kept);
  const missing=selection&&!Number.isFinite(local)?(fuelData.partial||fuelData.lastFailure||!fuelData.areas?' · 수집 실패로 받지 못했어요':' · 오피넷 자료에 없어요'):'';
  const regional=selection?'<p class="fuel-local">'+escapeHtml(label(selection.center))+' '+productName()+' 평균 <strong>'+(Number.isFinite(local)?money(local)+'/L':'미제공')+'</strong>'+missing+(diff===null?'':Math.abs(diff)<=5?' · 전국과 비슷해요(±5원 안)':' · 전국보다 '+money(Math.abs(diff))+(diff>0?' 비싸요':' 싸요'))+(validDate(keptAt)?' · '+escapeHtml(keptAt.toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Seoul'}))+' 수집 값':'')+'</p>':'';
  const daily=!Number.isFinite(avg?.diff)?'전일 자료 미제공':Math.abs(avg.diff)<1?'어제와 비슷':'어제보다 '+money(Math.abs(avg.diff))+(avg.diff>0?' ↑':' ↓');
  exploreTools.innerHTML='<div class="fuel-summary"><div>'+regional+'<p>전국 평균 <strong>'+money(avg?.price)+'</strong> · '+daily+'</p></div><div class="explore-toggle">'+['B027','D047'].map(p=>'<button type="button" data-product="'+p+'" aria-pressed="'+(fuelProduct===p)+'">'+(p==='B027'?'휘발유':'경유')+'</button>').join('')+'</div></div>'+sourceDisclosure('오피넷 '+(fuelData.date || '날짜 미제공')+' 기준','오피넷(한국석유공사) 기준 · '+(fuelData.date || '날짜 미제공')+' · 주유소가 알린 가격이라 실제와 다를 수 있어요 · 지도 색은 '+productName()+' 전국 평균 대비: '+['50원 넘게 쌈','10~50원 쌈','비슷(±10원)','10~50원 비쌈','50원 넘게 비쌈'].join(' → '),'<span class="fuel-legend" role="img" aria-label="지도 색: 전국 평균보다 쌀수록 초록, 비쌀수록 보라"><span>쌈</span>'+fuelColors.map(c=>'<i style="background:'+c+'"></i>').join('')+'<span>비쌈</span></span>');
  const near=s=>selection?NallaeLocalScope.distance(selection.origin,[s.lat,s.lon]):0;
  const sort=selection?fuelSort:'price',basis=selection?.fromLocation?'내 위치':'선택한 동네 대표 지점';
  exploreTools.innerHTML+='<div class="fuel-filters"><div class="explore-toggle" role="group" aria-label="주유소 반경">'+[5000,10000,15000].map(r=>'<button type="button" data-fuel-radius="'+r+'" aria-pressed="'+(fuelRadius===r)+'"'+(!selection?' disabled':'')+'>'+r/1000+'km 이내</button>').join('')+'</div><div class="explore-toggle" role="group" aria-label="주유소 정렬">'+[['distance','거리순'],['price','최저가순']].map(([k,n])=>'<button type="button" data-fuel-sort="'+k+'" aria-pressed="'+(sort===k)+'"'+(!selection&&k==='distance'?' disabled':'')+'>'+n+'</button>').join('')+'</div></div>';
  fuelShown=[];
  let sourceStations=fuelData.stations,entry=null;
  const query=selection?{lat:selection.origin[0],lon:selection.origin[1],radius:fuelRadius,product:fuelProduct}:null;
  if(selection&&!DEMO&&!fuelSampleFallback){
    if(selection.fromLocation&&!fuelLookupAllowed){feedEl.innerHTML='<li class="empty"><h3>가까운 주유소를 가격과 관계없이 찾아요</h3><p>조회에 필요한 위치 좌표와 유종·반경을 지삐 조회 서버(Vercel)와 오피넷에 전달해요. 좌표를 기기에 저장하거나 앱 로그에 남기지 않아요.</p><button type="button" data-fuel-query>내 위치로 주유소 조회</button><p>위치 전달을 원하지 않으면 지도에서 동네를 직접 골라 조회할 수 있어요.</p></li>';return;}
    entry=nearbyFuelClient.peek(query);
    if(!entry){loadNearbyFuel(query);entry=nearbyFuelClient.peek(query);}
    if(!entry||entry.status==='loading'){feedEl.innerHTML='<li class="empty" role="status">반경 '+fuelRadius/1000+'km 안 주유소를 조회하고 있어요.'+(fuelRadius>5000?' 여러 구역의 주유소를 합치고 있어 잠시 걸릴 수 있어요.':'')+'</li>';return;}
    if(entry.status==='error'){
      const message=entry.error==='not-configured'?'반경 조회 서버의 인증키 설정이 아직 준비되지 않았어요.':entry.error==='quota'?'주유소 조회 한도에 도달했어요. 잠시 후 다시 확인해 주세요.':'주유소 전체 반경 조회를 완료하지 못했어요. 일부 결과를 전체 목록으로 표시하지 않아요.';
      feedEl.innerHTML='<li class="empty">'+message+'<div class="empty-actions"><button type="button" data-fuel-retry>다시 조회</button><button type="button" data-fuel-samples>저가 표본만 보기 · 일부 주유소</button></div>'+addressLink(label(selection.center)+' 주유소')+'</li>';return;
    }
    sourceStations=entry.data.stations;
  }
  const stations=sourceStations.filter(s=>Number.isFinite(s.price?.[fuelProduct])&&NallaeDiscovery.point(s)&&(!selection||near(s)<=fuelRadius)).sort((a,b)=>sort==='distance'?near(a)-near(b)||a.price[fuelProduct]-b.price[fuelProduct]:a.price[fuelProduct]-b.price[fuelProduct]||near(a)-near(b));
  fuelShown=stations;
  const allSearch=selection?'<a class="food-map fuel-search-all" href="'+escapeHtml('https://map.kakao.com/link/search/'+encodeURIComponent(label(selection.center)+' 주유소'))+'" target="_blank" rel="noopener noreferrer">'+escapeHtml(label(selection.center))+' 주유소 더 찾기 ↗</a>':'';
  const scopeNote=entry?.status==='ready'?'오피넷 반경 내 조회 · '+escapeHtml(new Date(entry.data.asOf).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Seoul'}))+' 기준 · 가격과 관계없이 조회해요.':'시·도별 저가 표본이라 모든 주유소를 포함하지 않아요.';
  feedEl.innerHTML='<li class="explore-source">'+(selection?basis+'에서 직선 '+fuelRadius/1000+'km 이내 · '+(sort==='distance'?'거리순':'최저가순')+' · '+stations.length+'곳. ':'‘내 주변’ 또는 지도에서 동네를 고르면 실제 반경 내 주유소를 조회해요. 전국 목록은 저가 표본이에요. ')+scopeNote+(fuelSampleFallback?'<button type="button" data-fuel-full>전체 반경 조회로 돌아가기</button>':'')+allSearch+'</li>'+stations.map(s=>'<li class="festival-card">'+(selection?'<p class="place-distance">'+basis+'에서 직선 '+(near(s)/1000).toFixed(1)+'km</p>':'')+stationText(s)+'</li>').join('')+(stations.length?'':'<li class="empty">선택한 반경 안에 조회된 주유소가 없어요. 반경을 직접 넓히거나 ‘주유소 더 찾기’로 확인해 주세요.</li>');
  for(const s of stations) {
    if(!Number.isFinite(s.lat)||!Number.isFinite(s.lon)||Math.abs(s.lat)>90||Math.abs(s.lon)>180) continue;
    L.marker([s.lat,s.lon],{title:s.name,icon:L.divIcon({className:'fuel-marker',html:'<span class="fuel-location-pin">주유</span>',iconSize:[44,44],iconAnchor:[22,40]})}).bindPopup(()=>nearbyStations(s,stations),{maxWidth:280}).addTo(fuelMarkers);
  }
}
function loadNearbyFuel(query,retry=false) {
  const key=nearbyFuelClient.keyFor(query);
  nearbyFuelClient.load(query,{retry}).catch(()=>{}).finally(()=>{
    if(mode!=='explore'||exploreLayer!=='fuel'||!selection)return;
    const current={lat:selection.origin[0],lon:selection.origin[1],radius:fuelRadius,product:fuelProduct};
    if(nearbyFuelClient.keyFor(current)===key)renderExplore();
  });
}
feedEl.addEventListener('click',e=>{
  if(mode!=='explore'||exploreLayer!=='fuel'||!selection)return;
  if(e.target.closest('[data-fuel-query]')){fuelLookupAllowed=true;renderExplore();}
  if(e.target.closest('[data-fuel-samples]')){fuelSampleFallback=true;renderExplore();}
  if(e.target.closest('[data-fuel-full]')){fuelSampleFallback=false;renderExplore();}
  if(e.target.closest('[data-fuel-retry]')){loadNearbyFuel({lat:selection.origin[0],lon:selection.origin[1],radius:fuelRadius,product:fuelProduct},true);renderExplore();}
});
// 44px 터치 상자가 겹치면 맨 위 점이 눌려 다른 주유소가 열린다(실측: 전국 화면 93% 오선택).
// 누른 점의 상자와 겹치는 주유소가 여럿이면 그 목록을 보여 주고 고르게 한다. 좌표·자료는 그대로.
function nearbyStations(s,stations){
  const p=map.latLngToContainerPoint([s.lat,s.lon]);
  const near=stations.filter(o=>Number.isFinite(o.lat)&&Number.isFinite(o.lon)).filter(o=>{const q=map.latLngToContainerPoint([o.lat,o.lon]);return Math.abs(q.x-p.x)<44&&Math.abs(q.y-p.y)<44;});
  if(near.length<=1) return stationText(s);
  // 이미 반경·정렬을 적용한 stations의 순서를 그대로 유지한다.
  nearbyZoom=near;
  // 모두 담는다(목록 안에서 스크롤). 많으면 그곳으로 확대해 따로 고를 수 있게 한다.
  return '<p class="nearby-head">겹쳐 보이는 주유소 '+near.length+'곳 · '+(selection&&fuelSort==='distance'?'거리순':'최저가순')+'</p>'+(near.length>5?'<button type="button" class="nearby-zoom" data-nearby-zoom>이곳 확대해서 고르기</button>':'')+'<ul class="nearby-list">'+near.map(o=>'<li>'+stationText(o)+'</li>').join('')+'</ul>';
}
let nearbyZoom=null;
// 지도 팝업(주유소·주차·축제): 열릴 때 지도 조작부 아래·시트 위의 안전 영역으로 자동 이동하고, 그 높이를 넘으면 안에서 스크롤
// (예전에는 큰 팝업 윗부분이 헤더·조작부에 가렸다). Leaflet 1.9.4 내장본의 onAdd 앞에서 옵션만 바꾼다.
const popupOnAdd=L.Popup.prototype.onAdd;
L.Popup.include({onAdd(m){
  const top=document.querySelector('.topbar').getBoundingClientRect().bottom+8;
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
    const data=await fetchJsonData('data/'+(DEMO?'demo-food/':'food/')+encodeURIComponent(code)+'.json');
    if(!Array.isArray(data.items)) throw Error(); foodCache.set(code,data);
  } catch (_) { foodErrors.add(code); }
  foodPending.delete(code);
  if(mode==='explore'&&exploreLayer==='food'&&selection?.center.code===code) renderExplore();
}
// 소개된 식당(전국 일부 지역, 손으로 확인한 정적 목록). 식품안심업소와 다른 자료이며 좌표 없이 목록으로 제공한다.
let placesQuery='', placesSource='', placesShowAll=false, placesForCode, placesOnlySaved=false, placesLimit=40, placeMapItems=[];
const savedPlaces=new Set();
try { const saved=JSON.parse(localStorage.getItem('nallae-saved-places-v1')||'[]');if(Array.isArray(saved))saved.filter(id=>typeof id==='string'&&id.length<200).slice(0,500).forEach(id=>savedPlaces.add(id)); } catch(_) {}
const PLACE_SOURCE={video:'영상 소개',operator:'운영자 추천',heritage:'백년가게 지정',goodprice:'착한가격업소',menu:'매장 공식 메뉴'};
function renderPlaces() {
  const all=allPlaceItems(), code=selection?.center.code;
  if(placesForCode!==code) { placesForCode=code; placesShowAll=false; } // 지역을 바꾸면 선택 지역으로 다시 거른다
  titleEl.textContent=selection?regionTitle(selection.center)+' 맛집 찾기':'전국 맛집 찾기';
  subEl.textContent='동네나 먹고 싶은 메뉴로 식당을 찾아보세요';
  exploreTools.innerHTML=sourceDisclosure('전국 수록 '+all.length+'곳 · 수록 기준과 출처','영상 소개는 공식 영상 설명란의 상호·주소를 확인한 곳, 운영자 추천은 지삐 운영자의 주관적 의견이에요. 맛·위생·현재 영업을 보증하지 않으니 방문 전에 매장 정보를 확인해 주세요. 식품안심업소(위생등급)와는 다른 목록이에요. 수록 지역부터 순차 제공하며 전국 모든 식당 목록은 아니에요. 백년가게는 2026년 지정 목록과 2022년 음식 업종 자료의 상호·지역을 대조한 곳이며 현재 메뉴·영업을 보증하지 않아요. 착한가격업소는 행정안전부 지정 현황(2026-09-30)의 메뉴와 주소를 실었어요. 매장 공식 메뉴는 해당 지점이나 운영 시설이 공개한 메뉴와 주소를 대조했어요. 방문 전 메뉴와 영업 여부를 확인해 주세요. 정렬: 지역·이름 순.')
    +'<div class="food-controls"><label class="food-search"><input aria-label="지역·음식·식당 이름 검색" type="search" data-places-search placeholder="지역·음식·식당명, 예: 부산, 냉면" value="'+escapeHtml(placesQuery)+'"></label><div class="explore-toggle">'+['',...Object.keys(PLACE_SOURCE)].map(k=>'<button type="button" data-places-source="'+k+'" aria-pressed="'+(placesSource===k)+'">'+(k?PLACE_SOURCE[k]:'전체')+'</button>').join('')+'</div></div>';
  exploreTools.querySelector('.source-disclosure p').textContent += ' · 지도 위치 확인 '+all.filter(x=>placeLocation(x)).length+'/'+all.length+'곳. 포인트는 장소 또는 주소 건물 위치이며 입구를 뜻하지 않아요. 좌표를 확인하지 못한 곳도 주소 목록에서 볼 수 있어요.';
  if(selection&&foodIndex?.counts?.[code]>0)exploreTools.insertAdjacentHTML('beforeend','<button type="button" class="food-map" data-more-food>이 동네 식품안심업소 '+foodIndex.counts[code].toLocaleString('ko-KR')+'곳도 보기 · 맛 평가 아님</button>');
  exploreTools.querySelector('.food-controls').classList.add('places-controls');
  exploreTools.insertAdjacentHTML('beforeend','<div class="explore-toggle places-shortcuts"><button type="button" data-places-saved aria-pressed="'+placesOnlySaved+'">가보고 싶은 곳 '+all.filter(x=>savedPlaces.has(x.id)).length+'</button>'+(code?'<button type="button" data-places-scope="local" aria-pressed="'+!placesShowAll+'">선택 지역</button><button type="button" data-places-scope="all" aria-pressed="'+placesShowAll+'">전국 찾기</button>':'')+'</div>');
  renderPlaceCards();
}
function renderPlaceCards() {
  const all=allPlaceItems(), code=selection?.center.code;
  let head='';
  let list=all;
  if(code&&!placesShowAll) { list=all.filter(x=>x.sgg===code); head='<li class="explore-source">'+escapeHtml(label(selection.center))+' · 전체 '+all.length+'곳 중 '+list.length+'곳</li>'; }
  else head='<li class="explore-source">전국 수록 목록 '+all.length+'곳 · 지역·이름 순</li>';
  const q=placesQuery.trim().toLocaleLowerCase();
  const shown=list.filter(x=>(!placesOnlySaved||savedPlaces.has(x.id))&&(!placesSource||x.source.type===placesSource)&&(!q||(x.name+' '+(x.branch||'')+' '+x.district+' '+(x.food||'')).toLocaleLowerCase().includes(q)))
    .sort((a,b)=>a.district.localeCompare(b.district,'ko')||a.name.localeCompare(b.name,'ko'));
  const empty=!list.length&&code ? '<li class="empty">이 지역에는 아직 수록한 식당이 없어요(자료 없음이지 식당이 없다는 뜻은 아니에요).<div class="empty-actions"><button type="button" data-places-all>전국 수록 목록 보기</button></div></li>'
    : '<li class="empty">조건에 맞는 식당이 없어요.'+(code&&!placesShowAll?'<div class="empty-actions"><button type="button" data-places-all>전국에서 같은 검색 보기</button></div>':'')+'</li>';
  const scroll=feedEl.scrollTop;
  feedEl.innerHTML=head+(shown.slice(0,placesLimit).map(placeCard).join('')||(placesOnlySaved?'<li class="empty">이 조건에 저장한 식당이 없어요. 마음에 드는 식당에서 ‘가보고 싶어요’를 눌러 모아보세요.</li>':empty))+(shown.length>placesLimit?'<li><button type="button" data-places-more>식당 더 보기 ('+placesLimit+' / '+shown.length+')</button></li>':'');
  feedEl.scrollTop=scroll;
  placeMapItems=shown;
  renderPlaceMarkers(shown);
}
function placeLocation(x) {
  const p=placeLocations?.items?.[x.id];
  return p&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&p.lat>=33&&p.lat<=39&&p.lon>=124&&p.lon<=132?p:null;
}
function renderPlaceMarkers(shown) {
  placeMarkers.clearLayers();placeMarkerById.clear();map.attributionControl.removeAttribution(placeAttribution);
  if(mode!=='explore'||exploreLayer!=='places')return;
  const list=shown || placeMapItems;
  const groups=[];
  for(const x of list){const loc=placeLocation(x);if(!loc)continue;const pt=map.latLngToContainerPoint([loc.lat,loc.lon]);let g=groups.find(g=>g.pt.distanceTo(pt)<(map.getZoom()>=16?1:40));if(!g){g={pt,items:[]};groups.push(g);}g.items.push(x);}
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
map.getContainer().addEventListener('click',e=>{
  const b=e.target.closest('[data-place-card]');if(!b)return;
  const index=placeMapItems.findIndex(x=>x.id===b.dataset.placeCard);
  if(index>=placesLimit){placesLimit=Math.ceil((index+1)/40)*40;renderPlaceCards();}
  const el=[...feedEl.querySelectorAll('[data-place-id]')].find(el=>el.dataset.placeId===b.dataset.placeCard);
  if(el){setSheetStage(2);el.scrollIntoView({block:'nearest',behavior:'instant'});el.querySelector('[data-place-map]')?.focus({preventScroll:true});}
});
function placeCard(x) {
  const officialUrl=x.source.type==='menu' && /^https:\/\/(?:www\.starfield\.co\.kr|cdn\.ananti\.kr|monpetitplat\.co\.kr)\//.test(x.source.url) ? x.source.url : {heritage:'https://www.data.go.kr/data/15132695/fileData.do',goodprice:'https://www.data.go.kr/data/3045247/fileData.do'}[x.source.type];
  const src=officialUrl ? PLACE_SOURCE[x.source.type]+' · <a class="food-map" href="'+escapeAttr(officialUrl)+'" target="_blank" rel="noopener noreferrer">공식 자료 ↗</a>' : x.source.type==='video'
    ? escapeHtml(x.source.channel||'영상')+' 영상 소개'+(x.source.url&&/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(x.source.url)?' · <a class="food-map" href="'+escapeAttr(x.source.url)+'" target="_blank" rel="noopener noreferrer">공식 영상 보기 ↗</a>':'')
    : (x.source.type==='menu'?'매장 공식 메뉴':'운영자 추천 · 주관적 의견');
  return '<li class="festival-card place-card" data-place-id="'+escapeHtml(x.id)+'"><h3>'+escapeHtml(x.name+(x.branch?' '+x.branch:''))+'</h3><p>'+escapeHtml(x.food||'음식 분류 미확인')+' · '+escapeHtml(x.district)+'</p><p class="card-address">'+escapeHtml(x.address)+'</p><p class="place-source">'+src+'</p><button type="button" class="save-place" data-save-place="'+escapeHtml(x.id)+'" aria-pressed="'+savedPlaces.has(x.id)+'">'+(savedPlaces.has(x.id)?'♥ 저장했어요':'♡ 가보고 싶어요')+'</button>'+(placeLocation(x)?'<button type="button" data-place-map="'+escapeHtml(x.id)+'">지도에서 보기</button>':'<p class="place-checked">지도 위치 미확인 · 주소로 찾아보세요</p>')+addressLink(x.address)+'<p class="place-checked">'+(x.sourceDate?'지정 자료 '+escapeHtml(x.sourceDate)+(x.kindDate?' · 업종 자료 '+escapeHtml(x.kindDate):''):'정보 확인 '+escapeHtml(x.checkedAt))+'</p></li>';
}
feedEl.addEventListener('click',e=>{const b=e.target.closest('[data-place-map]');if(!b)return;const x=allPlaceItems().find(x=>x.id===b.dataset.placeMap),p=x&&placeLocation(x);if(!p)return;atHome=false;selectionAutoFit=false;setSheetStage(0);clearTimeout(sheetFitTimer);map.setView([p.lat,p.lon],17,{animate:false});renderPlaceMarkers();placeMarkerById.get(x.id)?.openPopup();});
exploreTools.addEventListener('input',e=>{ if(e.target.matches('[data-places-search]')) { placesQuery=e.target.value; placesLimit=40; renderPlaceCards(); } });
exploreTools.addEventListener('click',e=>{ const b=e.target.closest('[data-places-source]'); if(!b) return; placesSource=b.dataset.placesSource; placesLimit=40; renderExplore(); });
exploreTools.addEventListener('click',e=>{if(!e.target.closest('[data-more-food]'))return;exploreLayer='food';try{localStorage.setItem('nallae-explore-layer','food');}catch(_){}renderExplore();resetSelectedFeed();});
exploreTools.addEventListener('click',e=>{if(e.target.closest('[data-places-saved]')){placesOnlySaved=!placesOnlySaved;placesShowAll=true;placesLimit=40;renderExplore();}});
exploreTools.addEventListener('click',e=>{const b=e.target.closest('[data-places-scope]');if(!b)return;placesShowAll=b.dataset.placesScope==='all';placesLimit=40;renderExplore();});
feedEl.addEventListener('click',e=>{
  if(e.target.closest('[data-places-more]')){placesLimit+=40;renderPlaceCards();return;}
  const b=e.target.closest('[data-save-place]');if(!b)return;
  const id=b.dataset.savePlace;
  const removing=savedPlaces.has(id);
  if(removing)savedPlaces.delete(id);else {if(savedPlaces.size>=500){toast('저장한 식당은 최대 500곳까지 모을 수 있어요.');return;}savedPlaces.add(id);}
  let persisted=true;try{localStorage.setItem('nallae-saved-places-v1',JSON.stringify([...savedPlaces]));}catch(_){persisted=false;}
  renderPlaceCards();
  const savedButton=exploreTools.querySelector('[data-places-saved]');if(savedButton)savedButton.textContent='가보고 싶은 곳 '+allPlaceItems().filter(x=>savedPlaces.has(x.id)).length;
  ([...feedEl.querySelectorAll('[data-save-place]')].find(el=>el.dataset.savePlace===id)||savedButton)?.focus({preventScroll:true});
  toast(persisted?(removing?'식당 저장을 해제했어요.':'이 기기에만 저장해요. 다음 외출 때 다시 꺼내보세요.'):'이번 실행에서는 기억하지만 기기에 저장하지 못했어요.');
});
feedEl.addEventListener('click',e=>{ if(mode==='explore'&&exploreLayer==='places'&&e.target.closest('[data-places-all]')) { placesShowAll=true; placesLimit=40; renderExplore(); } });
async function loadOutingRegion(code) {
  if(outingPending.has(code))return;outingPending.add(code);outingErrors.delete(code);
  try{const d=await fetchJsonData('data/outings/'+encodeURIComponent(code)+'.json');if(!Array.isArray(d.items)||d.items.some(x=>x.sgg!==code||!NallaeDiscovery.point(x)))throw Error();outingCache.set(code,d.items);outingRevision++;}catch(_){outingErrors.add(code);}
  outingPending.delete(code);clearTimeout(outingDataTimer);outingDataTimer=setTimeout(()=>{if(mode==='explore'&&exploreLayer==='outing')renderOutingCards();},60);
}
function currentOutings() {
  if(outingTheme==='saved')return [...savedOutings.values()];
  if(!selection)return outingIndex.featured;
  const codes=[...selection.codes];
  for(const c of codes)if(!outingCache.has(c)&&!outingErrors.has(c))loadOutingRegion(c);
  return codes.flatMap(c=>outingCache.get(c)||[]).filter(x=>NallaeLocalScope.distance(selection.origin,[x.lat,x.lon])<=30000);
}
function outingCard(x) {
  const distance=selection?NallaeLocalScope.distance(selection.origin,[x.lat,x.lon]):null;
  return '<li class="festival-card outing-card" data-outing-card="'+escapeHtml(x.id)+'"><span class="festival-day">'+escapeHtml(x.kind||'관광지')+'</span><h3>'+escapeHtml(x.name)+'</h3><p>'+escapeHtml(x.district)+(distance!==null?' · 직선 '+(distance<1000?Math.round(distance)+'m':(distance/1000).toFixed(1)+'km'):'')+'</p><p class="card-address">'+escapeHtml(x.address)+'</p><div class="outing-actions"><button type="button" data-outing-map="'+escapeHtml(x.id)+'">위치 보기</button><button type="button" class="save-place" data-outing-save="'+escapeHtml(x.id)+'" aria-pressed="'+savedOutings.has(x.id)+'">'+(savedOutings.has(x.id)?'♥ 저장했어요':'♡ 가보고 싶어요')+'</button>'+routeLink(x)+'</div><details class="outing-source"><summary>출처·방문 전 확인</summary><p>'+escapeHtml(x.source)+' · 자료 기준일 '+escapeHtml(x.referenceDate||'미제공')+'</p><p>운영시간·개방·요금은 현장과 다를 수 있어요. 출처 좌표는 입구를 뜻하지 않을 수 있어요.</p><a href="'+escapeAttr(x.sourceUrl)+'" target="_blank" rel="noopener noreferrer">공식 자료 ↗</a></details></li>';
}
function renderOutings() {
  if(overseasView||(savedView&&outingTheme==='travel')){renderTravel();return;}
  delete exploreTools.dataset.travelView;
  root.dataset.courseWelcome=String(!savedView&&!selection&&outingTheme==='date');
  if((!outingIndex&&!savedView&&(selection||!discoveryCatalog))||exploreTools.querySelector('.outing-filters-dialog[open]'))return;
  const code=selection?.center.code||'';
  if(outingCode!==code){outingCode=code;outingLimit=30;outingPlanLimit=3;}
  titleEl.textContent=savedView?'저장한 곳':selection?regionTitle(selection.center)+'에서 뭐 할까?':'오늘 뭐 할까?';
  subEl.textContent='';
  const themeOptions=[['date','데이트 코스'],['','전체 장소'],['park','산책'],['attraction','관광지']];
  const regionOptions=(favorites.length?'<optgroup label="관심 지역">'+favorites.map(r=>'<option value="'+r.code+'"'+(r.code===code?' selected':'')+'>'+escapeHtml(r.name+' · '+label(muniByCode.get(r.code)))+'</option>').join('')+'</optgroup>':'')+'<optgroup label="모든 동네">'+munis.filter(m=>!favorites.some(r=>r.code===m.code)).map(m=>'<option value="'+m.code+'"'+(m.code===code?' selected':'')+'>'+escapeHtml(label(m))+'</option>').join('')+'</optgroup>';
  exploreTools.innerHTML=(savedView?'<div class="saved-tabs" role="group" aria-label="저장한 항목 종류">'+[['plans','코스'],['saved','장소'],['restaurants','맛집'],['travel','여행']].map(([k,n])=>'<button type="button" data-saved-tab="'+k+'" aria-pressed="'+(outingTheme===k)+'">'+n+'</button>').join('')+'</div>':!selection&&outingTheme==='date'?'':'<div class="outing-toolbar"><button type="button" class="outing-condition" data-outing-filters aria-haspopup="dialog">'+escapeHtml(selection?regionTitle(selection.center):'동네 고르기')+' · '+outingRadius/1000+'km · '+(outingTheme==='date'?outingStopCount+'곳 데이트':'장소 보기')+' ▾'+(outingQuery?' · 검색 중':'')+'</button></div>')
    +'<dialog class="outing-filters-dialog" aria-labelledby="outing-filters-title"><div class="dialog-head"><h2 id="outing-filters-title">어느 동네로 갈까요?</h2><button type="button" data-outing-filters-close>완료</button></div>'
    +'<div class="favorite-quick">'+favorites.map(r=>'<button type="button" data-quick-region="'+r.code+'">'+escapeHtml(r.name)+'</button>').join('')+'</div>'
    +'<label>동네 이름 검색<input type="search" data-outing-region-search placeholder="예: 노원, 부산 해운대" autocomplete="off"></label><div class="outing-region-results" aria-label="동네 검색 결과"></div>'
    +'<label class="outing-region">둘러볼 동네<select data-outing-region aria-label="놀거리 지역 선택"><option value="">전국 관광지</option>'+regionOptions+'</select></label>'
    +'<details class="outing-extra-filters"><summary>코스 조건 · '+outingStopCount+'곳 · '+outingRadius/1000+'km</summary><label class="outing-region">보고 싶은 것<select data-outing-theme-select>'+themeOptions.map(([k,n])=>'<option value="'+k+'"'+(outingTheme===k?' selected':'')+'>'+n+'</option>').join('')+'</select></label>'
    +'<label class="outing-region">코스 장소 수<select data-outing-stop-count><option value="2"'+(outingStopCount===2?' selected':'')+'>두 곳 데이트 · 가볍게</option><option value="3"'+(outingStopCount===3?' selected':'')+'>세 곳 데이트 · 선택 넓히기</option></select></label>'
    +'<label class="outing-region">찾을 반경<select data-outing-radius aria-label="데이트 반경">'+[5000,10000,15000].map(r=>'<option value="'+r+'"'+(outingRadius===r?' selected':'')+'>'+r/1000+'km 이내</option>').join('')+'</select></label>'
    +'<label>장소 이름·종류 검색<input type="search" data-outing-search placeholder="공원·관광지 이름" value="'+escapeHtml(outingQuery)+'"></label></details>'
    +sourceDisclosure('장소 자료·거리 안내','선택 지점부터 각 장소까지는 직선거리예요. 내 주변을 누르면 내 위치, 동네를 고르면 대표 지점을 써요. 자동 코스는 실제 보행·영업을 확인한 코스가 아니에요. 전국 공식 장소 자료 '+(outingIndex?.total||0).toLocaleString('ko-KR')+'곳.')+'</dialog>';
  renderOutingCards();
}
function openOutingFilters(){const dialog=exploreTools.querySelector('.outing-filters-dialog');if(!dialog||dialog.open)return;dialog.addEventListener('close',()=>{renderOutings();exploreTools.querySelector('[data-outing-filters]')?.focus({preventScroll:true});},{once:true});dialog.showModal();}
function contributionFooter(){return '<li class="contribution-invite"><h3>다시 가는 곳이 있나요?</h3><p>한 곳도 좋아요. 다녀온 이유를 알려주세요.</p><button type="button" data-contribution-open>장소·코스 제보하기</button></li>';}
function nearbyContributions(){const q=outingQuery.trim().toLocaleLowerCase();return communityCatalog.items.filter(x=>(!selection||x.stops.every(p=>NallaeLocalScope.distance(selection.origin,[p.lat,p.lon])<=outingRadius))&&(!q||[x.title,x.reason,...x.stops.map(p=>p.name+' '+p.address)].join(' ').toLocaleLowerCase().includes(q)));}
function contributionCard(x){const p={id:NallaeDiscovery.planId(x.stops),stops:x.stops,sourceType:'community',communityId:x.id,communityDetails:{reason:x.reason,caution:x.caution,relationship:x.relationship,recentVisit:x.recentVisit},reason:x.reason,meters:x.stops.slice(1).reduce((sum,b,i)=>sum+NallaeDiscovery.distance(x.stops[i],b),0)};if(x.kind==='course')return outingPlanCard(p,0,false,x);
  const a=x.stops[0];return '<li class="festival-card community-card"><span class="festival-day">방문 제보 · 운영자 검토</span><h3>'+escapeHtml(a.name)+'</h3><p class="plan-reason">'+escapeHtml(x.reason)+'</p><p>'+escapeHtml(a.address)+'</p><p class="place-checked">최근 방문 '+escapeHtml(x.recentVisit)+' · 방문 미인증</p><details><summary>아쉬운 점·제보 안내</summary><p>'+escapeHtml(x.caution||'기재 없음')+'</p><p>'+escapeHtml({none:'관계·대가 없음 (제보자 신고)',owner:'운영자·관계자 제보',compensated:'대가를 받은 제보'}[x.relationship])+'</p><a href="mailto:nallae.app@gmail.com?subject='+encodeURIComponent('[제보 신고·삭제] '+x.id)+'">이 제보 신고·삭제 문의</a></details><div class="outing-actions"><button type="button" data-community-map="'+escapeHtml(x.id)+'">지도 보기</button><button type="button" data-community-save="'+escapeHtml(x.id)+'">'+(savedOutings.has(a.id)?'저장됨':'장소 저장')+'</button></div></li>';}
function outingPlanCard(p,i,saved=false,contribution=null) {
  if(saved&&!contribution&&p.sourceType==='community'&&p.communityDetails)contribution={...p.communityDetails,id:p.communityId};
  const first=p.stops[0],approach=!saved&&selection?NallaeLocalScope.distance(selection.origin,[first.lat,first.lon]):null,hasSaved=savedPlans.has(p.id),own=saved?communityUI.reviewFor(p.stops):null;
  const from=selection?.fromLocation?'내 위치':'동네 대표 지점';
  return '<li class="festival-card outing-plan'+(contribution?' community-card':'')+'" data-plan-card="'+escapeHtml(p.id)+'" tabindex="-1"><span class="festival-day">'+(contribution?(saved?'저장한 방문 제보 · 당시 내용':'방문 제보 · 운영자 검토'):saved&&p.sourceType==='community'?'저장한 방문 제보 코스':saved?'저장한 코스':p.sourceType==='editorial-pair'?'지삐가 묶은 두 곳':'자동 조합 · '+p.stops.length+'곳')+'</span><h3>'+(p.sourceType==='editorial-pair'&&p.title?escapeHtml(p.title):p.stops.map(x=>escapeHtml(x.name)).join(' → '))+'</h3>'+(p.sourceType==='editorial-pair'&&p.title?'<p>'+p.stops.map(x=>escapeHtml(x.name)).join(' → ')+'</p>':'')+'<p class="plan-reason">'+escapeHtml(contribution?contribution.reason:p.reason)+' · 구간 직선 합계 '+(p.meters/1000).toFixed(1)+'km</p>'+(approach!==null?'<p class="place-checked">'+from+' → 첫 장소 직선 '+(approach/1000).toFixed(1)+'km</p>':'')+(contribution?'<p class="place-checked">최근 방문 '+escapeHtml(contribution.recentVisit)+' · 방문 미인증</p>':'')+(saved?'<p class="place-checked">저장 당시 장소 정보'+(own?' · 나만 보는 별점 '+own.rating+'/5':'')+'</p>':'')+'<div class="outing-actions"><button type="button" data-plan-map="'+escapeHtml(p.id)+'">지도</button><button type="button" data-plan-save="'+escapeHtml(p.id)+'" aria-pressed="'+hasSaved+'">'+(hasSaved?'♥ 저장됨':'♡ 저장')+'</button><a class="food-map" target="_blank" rel="noopener noreferrer" href="'+escapeHtml(NallaeDiscovery.route(p.stops,'walk'))+'">길찾기 ↗</a></div><details class="plan-details"><summary>장소 정보·방문 전 확인</summary><ol>'+p.stops.map(x=>'<li><strong>'+escapeHtml(x.name)+'</strong><p>'+escapeHtml(x.address||'주소 미제공')+'</p><p class="place-checked">'+escapeHtml(typeof x.source==='string'?x.source:x.source?.name||'소개된 식당')+' · 자료 '+escapeHtml(x.referenceDate||x.sourceDate||x.checkedAt||'기준일 미제공')+'</p>'+(/^https?:\/\//i.test(x.sourceUrl||x.source?.url||'')?'<a target="_blank" rel="noopener noreferrer" href="'+escapeAttr(x.sourceUrl||x.source.url)+'">출처 확인 ↗</a>':'')+'</li>').join('')+'</ol><p>'+(contribution?escapeHtml(contribution.caution)+'<br>'+escapeHtml({none:'관계·대가 없음 (제보자 신고)',owner:'운영자·관계자 제보',compensated:'대가를 받은 제보'}[contribution.relationship]):'장소 종류와 직선거리로 묶은 제안이에요.')+' 실제 보행 경로·영업·요금·현재 개방 여부는 방문 전에 확인해 주세요.</p>'+(contribution?'<a href="mailto:nallae.app@gmail.com?subject='+encodeURIComponent('[제보 신고·삭제] '+contribution.id)+'">이 제보 신고·삭제 문의</a>':'')+'</details>'+(saved?'<div class="personal-record"><button type="button" data-plan-next="'+escapeHtml(p.id)+'" aria-pressed="'+(nextPlanId===p.id)+'">'+(nextPlanId===p.id?'이번엔 여기 · 선택 해제':'이번엔 여기')+'</button><button type="button" data-plan-review="'+escapeHtml(p.id)+'">'+(own?'내 방문 기록 수정':'다녀왔어요 · 내 별점 기록')+'</button>'+(own?.text?'<p>'+escapeHtml(own.text)+'</p>':'')+'</div>':'')+'</li>';
}

function discoveryPlan(index){
  const item=discoveryCatalog?.items[index];
  return item?NallaeDiscovery.snapshotPlan(item):null;
}
function discoveryUtilityDialog(title,content,returnSelector){
  discoveryDialog?.remove();
  const dialog=document.createElement('dialog');discoveryDialog=dialog;
  dialog.className='discover-detail';dialog.setAttribute('aria-labelledby','discovery-utility-title');
  dialog.innerHTML='<div class="dialog-head"><h2 id="discovery-utility-title">'+escapeHtml(title)+'</h2><button type="button" data-discover-close>닫기</button></div><div class="discover-detail-list discover-utility-content">'+content+'</div>';
  dialog.addEventListener('click',e=>{if(e.target.closest('[data-discover-close]'))dialog.close();});
  dialog.addEventListener('close',()=>{dialog.remove();if(discoveryDialog===dialog)discoveryDialog=null;feedEl.querySelector(returnSelector)?.focus({preventScroll:true});},{once:true});
  document.body.append(dialog);dialog.showModal();return dialog;
}
function openDiscoveryChooser(){
  if(!discoveryCatalog)return;
  const dialog=discoveryUtilityDialog('먼저 둘러볼 코스',discoveryCatalog.items.map((item,index)=>'<button type="button" class="discover-city-choice" data-discover-index="'+index+'" aria-pressed="'+(index===discoveryIndex)+'"><strong>'+escapeHtml(item.city)+'</strong><span>'+escapeHtml(item.title)+'</span></button>').join('')+'<button type="button" class="discover-city-choice" data-discover-local><strong>다른 동네 찾기</strong><span>전국에서 동네·조건으로 코스 찾기</span></button>','[data-discover-city-picker]');
  dialog.addEventListener('click',e=>{if(e.target.closest('[data-discover-local]')){dialog.close();openOutingFilters();return;}const b=e.target.closest('[data-discover-index]');if(!b)return;const i=Number(b.dataset.discoverIndex);if(!Number.isInteger(i)||!discoveryCatalog.items[i])return;discoveryIndex=i;renderOutingCards();fitSheet();dialog.close();});
}
function openDiscoveryPhotoSource(index){
  const cover=discoveryCatalog?.items[index]?.cover;if(!cover)return;
  discoveryUtilityDialog('사진 출처','<p>'+escapeHtml(cover.alt)+'</p><p>'+escapeHtml(cover.publisher)+' · '+escapeHtml(cover.author)+' · '+escapeHtml(cover.dateLabel||cover.year+'년 공개자료')+'</p><p>'+escapeHtml(cover.licenseName||'공공누리 제1유형')+'. '+(cover.kind==='region'?'지역 대표 사진이며 코스 방문지와 다를 수 있어요. ':'')+'크기·용량을 줄였으며 화면에 맞춰 일부가 잘려 보일 수 있어요.</p><p><a href="'+escapeAttr(cover.sourceUrl)+'" target="_blank" rel="noopener noreferrer">공식 원본 안내 ↗</a></p><p><a href="'+escapeAttr(cover.licenseUrl)+'" target="_blank" rel="noopener noreferrer">이용 조건 ↗</a></p>','[data-discover-photo-source]');
}
function openDiscoveryPlan(index){
  const item=discoveryCatalog?.items[index],plan=discoveryPlan(index);if(!item||!plan)return;
  discoveryDialog?.remove();
  const dialog=document.createElement('dialog');discoveryDialog=dialog;let returnToMap=false;
  dialog.setAttribute('aria-labelledby','discovery-plan-title');
  dialog.className='discover-detail';
  dialog.innerHTML='<div class="dialog-head"><div><span>'+escapeHtml(item.city)+'</span><h2 id="discovery-plan-title">'+escapeHtml(item.title)+'</h2></div><button type="button" data-discover-close>닫기</button></div><ul class="discover-detail-list">'+outingPlanCard(plan,0)+'</ul>';
  dialog.addEventListener('click',event=>{
    const b=event.target.closest('button');if(!b)return;
    if(b.hasAttribute('data-discover-close'))dialog.close();
    if(b.hasAttribute('data-plan-save')){toggleSavedPlan(plan);const pressed=savedPlans.has(plan.id);b.setAttribute('aria-pressed',String(pressed));b.textContent=pressed?'♥ 저장됨':'♡ 저장';}
    if(b.hasAttribute('data-plan-map')){returnToMap=true;dialog.close();outingPlans=[plan];focusOutings(plan.stops);}
  });
  dialog.addEventListener('close',()=>{dialog.remove();if(discoveryDialog===dialog)discoveryDialog=null;(returnToMap?map.getContainer():feedEl.querySelector('[data-discover-open]'))?.focus({preventScroll:true});},{once:true});
  document.body.append(dialog);dialog.showModal();
}

function nextOutingCard() {
  const plan=savedPlans.get(nextPlanId);if(!plan||savedView||outingTheme!=='date')return '';
  const names=plan.stops.map(x=>x.name).join(' → '),route=NallaeDiscovery.route(plan.stops,'walk');
  return '<li class="next-outing"><div><strong>이번엔 여기</strong><span title="'+escapeHtml(names)+'">'+escapeHtml(names)+'</span><small>저장한 코스 · 선택 동네와 무관</small></div><button type="button" data-next-outing-open>저장 보기</button>'+(route?'<a href="'+escapeAttr(route)+'" target="_blank" rel="noopener noreferrer">길찾기 ↗</a>':'')+'</li>';
}
function toggleNextOuting(id) {
  if(!savedPlans.has(id))return;
  const next=nextPlanId===id?null:id;
  try{if(next)localStorage.setItem('nallae-next-plan-v1',next);else localStorage.removeItem('nallae-next-plan-v1');}
  catch(_){toast('기기에 선택을 저장하지 못했어요.');return;}
  nextPlanId=next;renderOutingCards();
  [...feedEl.querySelectorAll('[data-plan-next]')].find(b=>b.dataset.planNext===id)?.focus({preventScroll:true});
  toast(next?'다음 외출 코스로 골랐어요. 코스 첫 화면에서 바로 꺼내보세요.':'다음 외출 코스 선택을 해제했어요.');
}
function openNextOuting() {
  const id=nextPlanId;if(!savedPlans.has(id))return;
  savedView=true;outingTheme='plans';outingQuery='';exploreChoiceChanged=true;
  applyMode();if(mobileSheet.matches)setSheetStage(2,false);
  const card=[...feedEl.querySelectorAll('[data-plan-card]')].find(el=>el.dataset.planCard===id);
  card?.scrollIntoView({block:'nearest'});card?.focus({preventScroll:true});
}
function beforeOutingContent() {
  const brief=NallaeDiscovery.beforeOuting({code:selection?.center.code,codes:selection?[...selection.codes]:[],weather:weatherData,weatherFailed:exploreFailed.has('weather'),festivals,festivalUpdated:validDate(festivalUpdated)?festivalUpdated.toISOString():null,festivalLoaded,festivalFailed});
  if(!brief)return '';
  const weatherTime=brief.weather.base?new Date(brief.weather.base).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Seoul'})+' 관측':'최신 관측을 확인해 주세요';
  return '<div class="before-outing-head"><strong>외출 전에</strong><span>'+escapeHtml(regionTitle(selection.center))+'</span></div><div class="before-outing-actions"><button type="button" data-before-outing-layer="weather"'+(brief.weather.available?'':' disabled')+'><span>'+escapeHtml(brief.weather.label)+'</span><small>'+escapeHtml(weatherTime)+' · 날씨 보기</small></button><button type="button" data-before-outing-layer="festival"'+(brief.festival.available?'':' disabled')+'><span>'+escapeHtml(brief.festival.label)+'</span><small>맞닿은 동네 포함 · 축제 보기</small></button></div>';
}
function beforeOutingCard() {
  return selection&&!savedView&&outingTheme==='date'?'<li class="before-outing" data-before-outing>'+beforeOutingContent()+'</li>':'';
}
function updateBeforeOuting() {
  if(mode!=='explore'||exploreLayer!=='outing'||savedView||outingTheme!=='date'||!selection)return;
  const summary=feedEl.querySelector('[data-before-outing]');if(!summary)return;
  const html=beforeOutingContent();if(summary.innerHTML!==html)summary.innerHTML=html;
}
function outingCoreFailureNote() {
  if(savedView||outingTheme!=='date')return '';
  const failed=['places','place-locations'].filter(key=>exploreFailed.has(key));if(!failed.length)return '';
  const names=failed.length===2?'식당 목록·위치':failed[0]==='places'?'식당 목록':'식당 위치';
  const message=!placesData||!placeLocations?names+' 자료를 받지 못해 공원·관광지로 코스를 찾아요.':names+' 자료를 새로 받지 못했어요. 이전 자료를 사용해요.';
  return '<li class="explore-source" role="status">'+message+' <button type="button" data-outing-core-retry>식당 자료 다시 받기</button></li>';
}
function retryOutingCore() {
  const failed=['places','place-locations'].filter(key=>exploreFailed.has(key));
  return failed.length?loadExploreData(failed):Promise.resolve();
}
function savedRestaurantContent() {
  const xs=allPlaceItems().filter(x=>savedPlaces.has(x.id)),missing=Math.max(0,savedPlaces.size-xs.length);
  const retryNeeded=missing>0&&(!placesData||exploreFailed.has('places')||heritageLoadState!=='ready');
  const pending=savedRestaurantRetryPending||heritageLoadState==='loading'||(!exploreReady&&!placesData&&!exploreFailed.has('places'));
  return '<li class="explore-source">저장한 맛집 '+savedPlaces.size+'곳 · 현재 자료 확인 '+xs.length+'곳'+(missing?' · 미확인 '+missing+'곳':'')+' · 현재 지역과 관계없이 보여요.</li>'
    +(missing?'<li class="explore-source" role="status">저장 기록은 이 기기에 그대로 있어요. '+missing+'곳의 현재 장소 자료를 '+(pending?'확인하고 있어요.':'확인하지 못했어요.')+(retryNeeded?' <button type="button" data-saved-restaurants-retry'+(pending?' disabled':'')+'>'+(pending?'자료 확인 중…':'저장한 식당 자료 다시 받기')+'</button>':'')+'</li>':'')
    +xs.map(x=>'<li class="festival-card" data-saved-restaurant="'+escapeHtml(x.id)+'"><h3>'+escapeHtml(x.name)+'</h3><p>'+escapeHtml(x.address)+'</p>'+addressLink(x.address)+'</li>').join('')
    +(savedPlaces.size?'':'<li class="empty">맛집 화면에서 가보고 싶은 식당을 저장해 보세요.</li>');
}
function refreshSavedRestaurants() {
  if(mode!=='explore'||exploreLayer!=='outing'||!savedView||outingTheme!=='restaurants')return;
  const active=document.activeElement,retryFocused=active?.matches?.('[data-saved-restaurants-retry]'),focusedId=active?.closest?.('[data-saved-restaurant]')?.dataset.savedRestaurant,scroll=feedEl.scrollTop;
  feedEl.innerHTML=savedRestaurantContent();feedEl.scrollTop=scroll;
  if(retryFocused)(feedEl.querySelector('[data-saved-restaurants-retry]')||exploreTools.querySelector('[data-saved-tab="restaurants"]'))?.focus({preventScroll:true});
  else if(focusedId)[...feedEl.querySelectorAll('[data-saved-restaurant]')].find(el=>el.dataset.savedRestaurant===focusedId)?.querySelector('a')?.focus({preventScroll:true});
}
async function retrySavedRestaurants() {
  if(savedRestaurantRetryPending)return;
  const restoreFocus=document.activeElement?.matches?.('[data-saved-restaurants-retry]');
  const tasks=[];savedRestaurantRetryPending=true;refreshSavedRestaurants();
  if(!placesData||exploreFailed.has('places'))tasks.push(loadExploreData(['places']));
  if(heritageLoadState!=='ready')tasks.push(loadHeritageData());
  try{await Promise.all(tasks);}finally{
    savedRestaurantRetryPending=false;refreshSavedRestaurants();
    if(restoreFocus&&mode==='explore'&&exploreLayer==='outing'&&savedView&&outingTheme==='restaurants'&&(document.activeElement===document.body||document.activeElement?.matches?.('[data-saved-restaurants-retry]')))(feedEl.querySelector('[data-saved-restaurants-retry]')||exploreTools.querySelector('[data-saved-tab="restaurants"]'))?.focus({preventScroll:true});
  }
}
feedEl.addEventListener('click',e=>{
  if(mode==='explore'&&exploreLayer==='outing'&&savedView&&outingTheme==='restaurants'&&e.target.closest('[data-saved-restaurants-retry]'))retrySavedRestaurants();
});
function renderOutingCards() {
  root.dataset.courseWelcome=String(mode==='explore'&&exploreLayer==='outing'&&!savedView&&!overseasView&&!selection&&outingTheme==='date');
  if(overseasView||(savedView&&outingTheme==='travel')){syncDiscoveryMarker();return;}
  syncDiscoveryMarker();
  if(outingTheme==='restaurants') {outingPlans=[];outingShown=[];renderOutingMarkers([]);feedEl.innerHTML=savedRestaurantContent();return;}
  if(outingTheme==='plans') {
    const q=outingQuery.trim().toLocaleLowerCase();outingPlans=[...savedPlans.values()].filter(p=>!q||p.stops.some(x=>(x.name+' '+x.district).toLocaleLowerCase().includes(q)));
    feedEl.innerHTML='<li class="explore-source">저장한 코스 '+outingPlans.length+'개 · 기기에만 보관해요.</li>'+outingPlans.map((p,i)=>outingPlanCard(p,i,true)).join('')+(outingPlans.length?'':'<li class="empty">아직 저장한 코스가 없어요. 코스 화면에서 마음에 드는 데이트 코스를 저장해 보세요.</li>');renderOutingMarkers(outingPlans.flatMap(p=>p.stops));return;
  }
  const preview=!selection&&regionPreviewCode&&regionCoverCard(regionPreviewCode);
  if(preview){outingPlans=[];renderOutingMarkers([]);feedEl.innerHTML=nextOutingCard()+preview;return;}
  if(outingTheme==='date'&&!selection) {
    outingPlans=[];renderOutingMarkers([]);
    if(discoveryCatalog){
      syncDiscoveryMarker();
      feedEl.innerHTML=nextOutingCard()+'<li class="discover-shelf">'+JippiDiscoveryShelf.render({catalog:discoveryCatalog,activeIndex:discoveryIndex,saved:savedPlans})+'<div class="discover-utilities"><button type="button" data-outing-near>내 주변에서 찾기</button>'+travelEntry()+'</div><div class="favorite-quick">'+favorites.map(r=>'<button type="button" data-quick-region="'+r.code+'">'+escapeHtml(r.name)+'</button>').join('')+'</div><details class="welcome-about"><summary>지삐 소개 · 참여하기</summary><p><span class="brand-accent">지삐</span> 지기와 함께라면 백전백승</p><p>위치는 내 주변을 눌렀을 때만 요청해요.</p>'+(savedPlans.size?'<button type="button" data-outing-saved-plans>저장한 코스 '+savedPlans.size+'개 꺼내보기</button>':'')+'<button type="button" data-contribution-open>다시 가는 곳 제보하기</button></details></li>';return;
    }
    feedEl.innerHTML=nextOutingCard()+'<li class="outing-welcome"><div class="welcome-heading"><span class="welcome-eyebrow">오늘의 작은 외출</span><h3>오늘 뭐 할까?</h3></div><p>동네를 고르면 두 곳을 잇는 코스를 찾아드려요.</p><div class="welcome-actions"><button type="button" class="welcome-primary" data-outing-choose>동네 고르기 <span aria-hidden="true">›</span></button><button type="button" class="welcome-near" data-outing-near>내 주변</button></div><div class="favorite-quick">'+favorites.map(r=>'<button type="button" data-quick-region="'+r.code+'">'+escapeHtml(r.name)+'</button>').join('')+'</div>'+travelEntry()+'<details class="welcome-about"><summary>지삐 소개</summary><p><span class="brand-accent">지삐</span> 지기와 함께라면 백전백승</p><p>위치는 내 주변을 눌렀을 때만 요청해요.</p>'+(savedPlans.size?'<button type="button" data-outing-saved-plans>저장한 코스 '+savedPlans.size+'개 꺼내보기</button>':'')+'<button type="button" data-contribution-open>다시 가는 곳 제보하기</button></details></li>';return;
  }

  const q=outingQuery.trim().toLocaleLowerCase();
  const items=currentOutings().filter(x=>(!q||(x.name+' '+x.district+' '+x.kind).toLocaleLowerCase().includes(q))&&(!['park','attraction'].includes(outingTheme)||x.type===outingTheme));
  if(selection)items.sort((a,b)=>NallaeLocalScope.distance(selection.origin,[a.lat,a.lon])-NallaeLocalScope.distance(selection.origin,[b.lat,b.lon])||a.name.localeCompare(b.name,'ko'));
  else items.sort((a,b)=>a.district.localeCompare(b.district,'ko')||a.name.localeCompare(b.name,'ko'));
  outingShown=items;
  const pending=selection&&[...selection.codes].some(c=>outingPending.has(c));
  const failed=selection&&[...selection.codes].filter(c=>outingErrors.has(c));
  const note=outingCoreFailureNote()+(pending?'<li class="explore-source" role="status">주변 장소를 불러오고 있어요…</li>':'')+(failed?.length?'<li class="explore-source">일부 지역 자료를 받지 못했어요. <button type="button" data-outing-retry>다시 받기</button></li>':'');
  const empty='<li class="empty">'+(!selection&&outingTheme==='park'?'공원은 위에서 둘러볼 동네를 골라 주세요.':outingTheme==='saved'?'아직 저장한 곳이 없어요. 마음에 드는 장소를 모아보세요.':'조건에 맞는 장소 자료가 없어요. 검색어 또는 지역을 바꿔보세요.')+'</li>';
  if(outingTheme==='date') {
    const foods=allPlaceItems().map(x=>({...x,...placeLocation(x)}));
    const seed=koreaDate(new Date())+'|'+outingNonce,key=JSON.stringify([selection.center.code,selection.origin,[...selection.codes].sort(),outingRadius,outingQuery,outingStopCount,seed,outingRevision,foods.filter(NallaeDiscovery.point).map(x=>[x.id,x.lat,x.lon])]);
    if(!outingPlanMemo.has(key)){if(outingPlanMemo.size>=12)outingPlanMemo.delete(outingPlanMemo.keys().next().value);outingPlanMemo.set(key,NallaeDiscovery.plans(items,foods,{origin:selection.origin,originRadius:outingRadius,seed,stopCount:outingStopCount,limit:6}));}
    const candidates=outingPlanMemo.get(key),contributions=nearbyContributions();
    const sharedPlans=contributions.filter(x=>x.kind==='course').map(x=>({id:NallaeDiscovery.planId(x.stops),stops:x.stops,sourceType:'community',communityId:x.id,communityDetails:{reason:x.reason,caution:x.caution,relationship:x.relationship,recentVisit:x.recentVisit},reason:x.reason,meters:x.stops.slice(1).reduce((sum,b,i)=>sum+NallaeDiscovery.distance(x.stops[i],b),0)}));
    outingPlans=[...sharedPlans,...candidates.slice(0,outingPlanLimit)];

    const sharedHtml=contributions.map(contributionCard).join('');
    feedEl.innerHTML=nextOutingCard()+regionCoverCard(selection.center.sido,true)+note+(communityState==='error'?'<li class="explore-source">방문 제보를 불러오지 못했어요. <button type="button" data-community-retry>다시 받기</button></li>':'')+sharedHtml+'<li class="outing-intro"><div class="plan-intro-head"><h3>가까운 '+outingStopCount+'곳 데이트</h3><button type="button" data-outing-shuffle>다른 조합</button></div><p>직선거리로 묶은 자동 조합 · 실제 동선은 길찾기에서 확인</p></li>'+candidates.slice(0,outingPlanLimit).map((p,i)=>outingPlanCard(p,i)).join('')+(candidates.length>outingPlanLimit?'<li><button type="button" data-plans-more>코스 3개 더 보기</button></li>':'')+(!pending&&!candidates.length?'<li class="empty">이 조건에서는 '+outingStopCount+'곳 코스를 만들지 못했어요.'+(outingStopCount===3?' 서로 다른 종류의 가까운 장소가 부족해요.':'')+'<div class="outing-actions"><button type="button" data-outing-choose>조건 바꾸기</button><button type="button" data-outing-all>장소 하나씩 보기</button></div></li>':'')+beforeOutingCard()+'<li class="travel-secondary-entry">'+travelEntry()+'</li>'+contributionFooter();
    renderOutingMarkers(outingPlans.flatMap(p=>p.stops));return;
  }
  feedEl.innerHTML=(selection?regionCoverCard(selection.center.sido,true):'')+note+'<li class="explore-source">'+items.length.toLocaleString('ko-KR')+'곳 · '+(selection?'선택 지점에서 직선거리 순':'지역·이름 순')+'</li>'+(items.slice(0,outingLimit).map(outingCard).join('')||(!pending?empty:''))+(items.length>outingLimit?'<li><button type="button" data-outing-more>놀거리 더 보기 ('+outingLimit+' / '+items.length+')</button></li>':'');
  feedEl.insertAdjacentHTML('beforeend',contributionFooter());renderOutingMarkers(items);
}
function renderOutingMarkers(items=outingShown) {
  outingMarkers.clearLayers();if(mode!=='explore'||exploreLayer!=='outing'||overseasView||savedView&&outingTheme==='travel')return;
  const groups=new Map(),size=map.getZoom()>=16?1:44;
  for(const x of items){if(!NallaeDiscovery.point(x))continue;const p=map.latLngToContainerPoint([x.lat,x.lon]);const key=Math.floor(p.x/size)+':'+Math.floor(p.y/size);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(x);}
  for(const xs of groups.values()){
    const first=xs[0],bounds=L.latLngBounds(xs.map(x=>[x.lat,x.lon]));
    const m=L.marker(xs.length===1?[first.lat,first.lon]:bounds.getCenter(),{title:xs.length===1?first.name:'놀거리 '+xs.length+'곳 묶음',icon:L.divIcon({className:'outing-marker',html:'<span class="'+(xs.length>1?'cluster':'')+'">'+(xs.length>1?xs.length:first.type==='park'?'산책':'보기')+'</span>',iconSize:[44,44],iconAnchor:[22,xs.length>1?22:40]})}).addTo(outingMarkers);
    if(xs.length>1&&map.getZoom()<18)m.on('click',()=>map.fitBounds(bounds,outingBoundsOptions(Math.min(18,map.getZoom()+3))));
    else m.bindPopup(xs.slice(0,10).map(x=>'<strong>'+escapeHtml(x.name)+'</strong><p>'+escapeHtml(x.address)+'</p>'+routeLink(x)).join('<hr>'),{maxWidth:280});
  }
}
function restoreOutingFocus(kind,id) {
  const attribute='data-'+kind;
  const target=[...feedEl.querySelectorAll('['+attribute+']')].find(b=>b.getAttribute(attribute)===id)
    ||exploreTools.querySelector('[data-saved-tab][aria-pressed="true"]')||exploreTools.querySelector('[data-outing-filters]');
  target?.focus({preventScroll:true});
}
function persistOutings(message='이 기기에 저장했어요. 다음 외출 때 다시 꺼내보세요.') {
  try{localStorage.setItem('nallae-outings-v1',JSON.stringify([...savedOutings.values()]));toast(message);}catch(_){toast('이번 실행에서는 기억하지만 기기에 저장하지 못했어요.');}
}
function toggleSavedPlan(plan) {
  const p=NallaeDiscovery.snapshotPlan(plan);if(!p)return toast('장소 좌표를 확인하지 못해 코스를 저장할 수 없어요.');
  if(savedPlans.has(p.id)){savedPlans.delete(p.id);if(nextPlanId===p.id){nextPlanId=null;try{localStorage.removeItem('nallae-next-plan-v1');}catch(_){}}}
  else {if(savedPlans.size>=100)return toast('저장한 코스는 최대 100개까지 모을 수 있어요.');savedPlans.set(p.id,p);if(p.stops.filter(x=>!savedOutings.has(x.id)).length<=300-savedOutings.size)p.stops.forEach(saveOuting);}
  try{localStorage.setItem('nallae-plans-v1',JSON.stringify([...savedPlans.values()]));localStorage.setItem('nallae-outings-v1',JSON.stringify([...savedOutings.values()]));toast(savedPlans.has(p.id)?'코스를 이 기기에 저장했어요. 저장한 코스에서 다시 꺼내보세요.':'코스 저장을 해제했어요.');}catch(_){toast('이번 실행에서는 기억하지만 기기에 저장하지 못했어요.');}
  renderOutings();restoreOutingFocus('plan-save',p.id);
}
function saveOuting(x) {
  if(!x||!NallaeDiscovery.point(x))return false;
  if(savedOutings.size>=300&&!savedOutings.has(x.id)){toast('최대 300곳까지 저장할 수 있어요.');return false;}
  savedOutings.set(x.id,{id:x.id,name:x.name,address:x.address,lat:x.lat,lon:x.lon,sgg:x.sgg,district:x.district,type:x.type||'restaurant',kind:x.kind||'소개된 식당',source:typeof x.source==='string'?x.source:x.source?.name||'소개된 식당',referenceDate:x.referenceDate||x.sourceDate||x.checkedAt,sourceUrl:x.sourceUrl||x.source?.url||'about.html'});
  return true;
}
function toggleSavedOuting(x) {
  if(!x)return;
  const removing=savedOutings.has(x.id);
  if(removing)savedOutings.delete(x.id);else if(!saveOuting(x))return;
  persistOutings(removing?'장소 저장을 해제했어요.':undefined);renderOutings();restoreOutingFocus('outing-save',x.id);
}
function saveCommunityPlace(x,communityId) {
  if(!x)return;
  if(savedOutings.has(x.id)){toast('이미 저장한 장소예요. 저장 화면에서 꺼내보세요.');return;}
  if(!saveOuting(x))return;
  persistOutings();renderOutingCards();restoreOutingFocus('community-save',communityId);
}
function outingBoundsOptions(maxZoom) {
  // fitBounds는 좌표만 고려하므로 아이콘(위 40px/좌우 22px) 여백도 확보한다.
  const top=leftPad(),bottom=bottomPad(),size=map.getSize();
  const lower=[bottom[0]+30,bottom[1]+16];
  return {paddingTopLeft:[top[0]+30,Math.max(0,Math.min(top[1]+48,size.y-lower[1]-96))],paddingBottomRight:lower,maxZoom,animate:!reducedMotion.matches};
}
function focusOutings(items) {
  atHome=false;selectionAutoFit=false;setSheetStage(0,false);clearTimeout(sheetFitTimer);map.closePopup();
  renderOutingMarkers(items);map.fitBounds(L.latLngBounds(items.map(x=>[x.lat,x.lon])),outingBoundsOptions(items.length===1?17:16));
}
exploreTools.addEventListener('input',e=>{if(e.target.matches('[data-outing-search]')){outingQuery=e.target.value;outingLimit=30;outingPlanLimit=3;clearTimeout(outingSearchTimer);outingSearchTimer=setTimeout(()=>{if(mode==='explore'&&exploreLayer==='outing')renderOutingCards();},180);}});
exploreTools.addEventListener('change',e=>{if(e.target.matches('[data-outing-region]')){const m=muniByCode.get(e.target.value);if(m)select(m,false);else {clearSelection();atHome=true;fitHome();}exploreTools.querySelector('[data-outing-filters]')?.focus({preventScroll:true});}});
exploreTools.addEventListener('change',e=>{if(e.target.matches('[data-outing-theme-select]')){outingTheme=e.target.value;outingPlanLimit=3;outingLimit=30;renderOutingCards();fitSheet();}});
exploreTools.addEventListener('change',e=>{if(e.target.matches('[data-outing-radius]')){outingPlanLimit=3;const radius=Number(e.target.value);if(![5000,10000,15000].includes(radius))return;outingRadius=radius;try{localStorage.setItem('nallae-outing-radius',String(radius));}catch(_){}renderOutingCards();}});
exploreTools.addEventListener('click',e=>{if(e.target.closest('[data-outing-date]')){outingTheme='date';outingLimit=30;renderOutings();fitSheet();}});
exploreTools.addEventListener('click',e=>{const dialog=exploreTools.querySelector('.outing-filters-dialog');if(e.target.closest('[data-outing-filters]'))openOutingFilters();if(e.target.closest('[data-outing-filters-close]'))dialog?.close();});
feedEl.addEventListener('click',e=>{
  if(mode!=='explore'||exploreLayer!=='outing')return;const b=e.target.closest('button');if(!b)return;
  if(b.hasAttribute('data-region-photo-source')){regionPhotoSourceDialog(b.dataset.regionPhotoSource);return;}
  if(b.hasAttribute('data-region-cover-home')){if(mobileSheet.matches)setSheetStage(1,false);document.getElementById('btn-all').click();return;}
  if(b.hasAttribute('data-region-photos-retry')){b.disabled=true;b.textContent='불러오는 중…';loadRegionPhotos();return;}
  if(b.hasAttribute('data-discover-index')){const i=Number(b.dataset.discoverIndex);if(Number.isInteger(i)&&discoveryCatalog?.items[i]){discoveryIndex=i;renderOutingCards();fitSheet();feedEl.querySelector('[data-discover-index="'+i+'"]')?.focus({preventScroll:true});}return;}
  if(b.hasAttribute('data-discover-city-picker')){openDiscoveryChooser();return;}
  if(b.hasAttribute('data-discover-photo-source')){openDiscoveryPhotoSource(Number(b.dataset.discoverPhotoSource));return;}
  if(b.hasAttribute('data-discover-open')){openDiscoveryPlan(Number(b.dataset.discoverOpen));return;}
  if(b.hasAttribute('data-discover-save')){const i=Number(b.dataset.discoverSave),p=discoveryPlan(i);if(p){toggleSavedPlan(p);feedEl.querySelector('[data-discover-save]')?.focus({preventScroll:true});}return;}
  if(b.dataset.beforeOutingLayer){exploreChoiceChanged=true;savedView=false;exploreLayer=b.dataset.beforeOutingLayer;if(exploreLayer==='festival')festivalPeriod='all';applyMode();resetSelectedFeed();return;}
  if(b.hasAttribute('data-outing-core-retry')){b.disabled=true;b.textContent='다시 받는 중…';retryOutingCore();return;}
  if(b.hasAttribute('data-plan-next')){toggleNextOuting(b.dataset.planNext);return;}
  if(b.hasAttribute('data-next-outing-open')){openNextOuting();return;}
  if(b.hasAttribute('data-outing-near'))locateBtn.click();
  if(b.hasAttribute('data-outing-choose'))openOutingFilters();
  if(b.hasAttribute('data-outing-saved-plans')){outingTheme='plans';renderOutings();fitSheet();resetSelectedFeed();}
  if(b.hasAttribute('data-outing-all')){outingTheme='';renderOutings();fitSheet();resetSelectedFeed();}
  if(b.hasAttribute('data-outing-more')){outingLimit+=30;renderOutingCards();}
  if(b.hasAttribute('data-plans-more')){outingPlanLimit=6;renderOutingCards();}
  if(b.hasAttribute('data-community-retry'))loadCommunity();
  if(b.hasAttribute('data-plan-review')){const p=outingPlans.find(p=>p.id===b.dataset.planReview);if(p)communityUI.review(p);}
  if(b.hasAttribute('data-community-map')){const x=communityCatalog.items.find(x=>x.id===b.dataset.communityMap);if(x)focusOutings(x.stops);}
  if(b.hasAttribute('data-community-save')){const x=communityCatalog.items.find(x=>x.id===b.dataset.communitySave);if(x)saveCommunityPlace(x.stops[0],x.id);}
  if(b.hasAttribute('data-outing-shuffle')){const previous=outingPlans.map(p=>p.id).sort().join(';');outingNonce++;outingPlanLimit=3;renderOutingCards();if(previous&&previous===outingPlans.map(p=>p.id).sort().join(';'))toast('같은 조합이 나왔어요. 다시 보거나 검색·필터에서 반경을 바꿔보세요.');}
  if(b.hasAttribute('data-outing-retry')){const failed=[...outingErrors];failed.forEach(c=>{outingErrors.delete(c);loadOutingRegion(c);});}
  if(b.dataset.outingMap){const x=outingShown.find(x=>x.id===b.dataset.outingMap);if(x)focusOutings([x]);}
  if(b.dataset.outingSave){toggleSavedOuting(outingShown.find(x=>x.id===b.dataset.outingSave));}
  if(b.hasAttribute('data-plan-map')){const p=outingPlans.find(p=>p.id===b.dataset.planMap);if(p)focusOutings(p.stops);}
  if(b.hasAttribute('data-plan-save')){const p=outingPlans.find(p=>p.id===b.dataset.planSave);if(p)toggleSavedPlan(p);}
});
map.on('zoomend',()=>{if(mode==='explore'&&exploreLayer==='outing')renderOutingMarkers(['date','plans'].includes(outingTheme)?outingPlans.flatMap(p=>p.stops):outingShown);});

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
  if(b.hasAttribute('data-fuel-radius')&&[5000,10000,15000].includes(Number(b.dataset.fuelRadius))){fuelRadius=Number(b.dataset.fuelRadius);try{localStorage.setItem('nallae-fuel-radius',String(fuelRadius));}catch(_){}renderExplore();}
  if(b.hasAttribute('data-fuel-sort')&&['distance','price'].includes(b.dataset.fuelSort)){fuelSort=b.dataset.fuelSort;try{localStorage.setItem('nallae-fuel-sort',fuelSort);}catch(_){}renderExplore();}
  if(b.hasAttribute('data-kind')) { foodKind=b.dataset.kind; foodLimit=50; renderExplore(); }
});
feedEl.addEventListener('click',e=>{
  if(mode!=='explore'||exploreLayer!=='food') return;
  const b=e.target.closest('button'); if(!b) return;
  if(b.dataset.foodRegion) { const m=muniByCode.get(b.dataset.foodRegion); if(m) select(m,false); }
  if(b.hasAttribute('data-food-more')) { foodLimit+=50; renderFoodCards(); }
  if(b.hasAttribute('data-food-retry')) { loadFood(foodCode); renderExplore(); }
});

let festivals = [], festivalUpdated = null, festivalFailed = false, festivalLoaded = false, festivalPeriod='all';
let festivalMarkers = L.layerGroup(), celebrated = false;
try { celebrated = sessionStorage.getItem('nallae-celebrated') === '1'; } catch (_) {}
const dayNumber = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? Date.parse(value + 'T00:00:00+09:00') / 86400000 : NaN;
const today = () => dayNumber(new Date().toLocaleDateString('sv-SE', {timeZone:'Asia/Seoul'}));
const festivalCodes = f => Array.isArray(f.sgg) ? f.sgg.map(String) : [String(f.sgg || '')];
function festivalList() {
  const now = today(), weekend=NallaeLocalScope.weekend();
  return festivals.filter(f => dayNumber(f.end) >= now && dayNumber(f.start) <= now + 30 && (festivalPeriod!=='weekend' || dayNumber(f.start)<=weekend.end && dayNumber(f.end)>=weekend.start) && (!selection || festivalCodes(f).some(c => selection.codes.has(c)))).sort((a,b) => {
    const rank = f => dayNumber(f.end)-dayNumber(f.start)+1 >= 30 ? 2 : dayNumber(f.start) <= now ? 0 : 1;
    return rank(a)-rank(b) || (rank(a) === 0 ? dayNumber(a.end)-dayNumber(b.end) : dayNumber(a.start)-dayNumber(b.start)) || String(a.name).localeCompare(String(b.name),'ko');
  });
}
async function loadFestivals() {
  try {
    const data = await fetchJsonData(DEMO ? 'data/demo-festivals.json' : 'data/festivals.json');
    if (!Array.isArray(data.items)) throw new Error('festival data');
    festivals = data.items.filter(f => f && typeof f.name === 'string' && Number.isFinite(dayNumber(f.start)) && dayNumber(f.end) >= dayNumber(f.start));
    festivalUpdated = new Date(data.updated); festivalFailed = false; festivalLoaded = true;
  } catch (_) { festivalFailed = true; }
  if (mode === 'explore' && exploreLayer === 'festival') renderExplore();
  updateBeforeOuting();
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
exploreTools.addEventListener('click',e=>{
  const button=e.target.closest('[data-festival-period]');
  if(button){festivalPeriod=button.dataset.festivalPeriod;renderExplore();resetSelectedFeed();}
});
function renderFestivals() {
  const list = festivalList();
  titleEl.textContent = selection ? regionTitle(selection.center) + ' 주변 축제' : '동네 탐험';
  const now = today(), ongoing = list.filter(f => dayNumber(f.start) <= now).length;
  subEl.textContent=festivalPeriod==='weekend'?'이번 주말과 일정이 겹치는 축제예요':'진행 중 '+ongoing+'곳 · 30일 안 시작하는 축제도 함께';
  syncCategories(); newButton.hidden = true; updateFestivalStatus();
  exploreTools.innerHTML='<div class="explore-toggle" role="group" aria-label="축제 일정"><button type="button" data-festival-period="all" aria-pressed="'+(festivalPeriod==='all')+'">전체 일정</button><button type="button" data-festival-period="weekend" aria-pressed="'+(festivalPeriod==='weekend')+'">이번 주말 어디 갈까</button></div>';
  const scroll = feedEl.scrollTop;
  const date = v => (v.slice(0,4) === new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}).slice(0,4) ? '' : v.slice(0,4) + '.') + Number(v.slice(5,7)) + '.' + Number(v.slice(8)) + '(' + '일월화수목금토'[new Date(v+'T00:00:00Z').getUTCDay()] + ')';
  const card = f => {
    const end = dayNumber(f.end), start = dayNumber(f.start);
    const badge = end === now ? '오늘 끝나요' : start <= now ? '진행 중' : 'D-' + Math.ceil(start-now);
    const region = festivalCodes(f).map(c => muniByCode.get(c)).filter(Boolean).map(label).join(', ');
    return '<li class="festival-card" data-festival="' + escapeHtml(f.id) + '"><details><summary><span class="festival-day ' + (end === now ? 'ending' : start <= now ? 'ongoing' : '') + '">' + badge + '</span><h3>' + escapeHtml(f.name) + '</h3><p>' + date(f.start) + ' – ' + date(f.end) + '</p><p class="festival-place">' + escapeHtml((f.place || f.address || '장소 미제공') + (region ? ' · ' + region : '')) + '</p>' + (f.content ? '<p class="festival-content">' + escapeHtml(f.content) + '</p>' : '') + (end === now ? '<p>오늘이 마지막 날이에요. 서둘러 둘러보세요!</p>' : '') + '</summary><div class="festival-detail"><p>주최: ' + escapeHtml(f.host || '미제공') + '</p><p>전화: ' + escapeHtml(f.phone || '미제공') + '</p>' + (/^https?:\/\//i.test(f.url || '') ? '<a href="' + escapeAttr(f.url) + '" target="_blank" rel="noopener">누리집 ↗</a>' : '') + routeLink(f) + '<p class="src">출처: 전국문화축제표준데이터</p></div></details></li>';
  };
  const regular = list.filter(f => dayNumber(f.end)-dayNumber(f.start)+1 < 30), long = list.filter(f => dayNumber(f.end)-dayNumber(f.start)+1 >= 30);
  feedEl.innerHTML = regular.map(card).join('') + (long.length ? '<li class="festival-group"><details><summary>상시 진행 ' + long.length + '건</summary><ul>' + long.map(card).join('') + '</ul></details></li>' : '') || '<li class="empty"><p>' + (festivalFailed ? '축제를 불러오지 못했어요. 잠시 후 다시 확인해 주세요.' : !festivalLoaded ? '축제를 불러오는 중이에요.' : '조건에 맞는 축제 자료가 없어요. 다른 일정이나 지역도 살펴보세요.') + '</p><p>출처: 전국문화축제표준데이터 · 선택 지역과 맞닿은 지역 포함</p></li>';
  feedEl.scrollTop = scroll;
  renderFestivalMarkers();
  if (!celebrated && festivalLoaded) {
    celebrated = true;
    try { sessionStorage.setItem('nallae-celebrated','1'); } catch (_) {}
    if (!reducedMotion.matches && list.length) {
      const confetti = document.createElement('div'); confetti.className = 'festival-confetti'; confetti.setAttribute('aria-hidden','true');
      confetti.innerHTML = Array.from({length:12},(_,i) => '<i style="--i:' + i + '"></i>').join('');
      panel.append(confetti); setTimeout(() => confetti.remove(),950);
    }
  }
}
function renderFestivalMarkers() {
  festivalMarkers.clearLayers();
  if (mode !== 'explore' || exploreLayer !== 'festival') return;
  const groups = [], zoomed = map.getZoom() >= MUNI_ZOOM;
  for (const f of festivalList()) {
    if (typeof f.lat !== 'number' || typeof f.lon !== 'number' || !Number.isFinite(f.lat) || !Number.isFinite(f.lon) || Math.abs(f.lat)>90 || Math.abs(f.lon)>180) continue;
    const at = [f.lat,f.lon], pt = map.latLngToContainerPoint(at);
    let group = groups.find(g => g.pt.distanceTo(pt)<44);
    if (!group) { group = {pt,at,items:[]}; groups.push(group); } group.items.push(f);
  }
  for (const g of groups) {
    const svg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 20 2-12 7 7-9 5ZM12 4l1-3m4 7 4-1M8 5 6 3m12 10 3 2M15 6l3-3"/></svg>';
    const count = g.items.length, size = Math.min(36,24 + Math.floor(Math.log2(count))*3);
    const html = count > 1 ? '<b class="festival-cluster" style="width:' + size + 'px;height:' + size + 'px">' + count + '</b>' : zoomed ? svg : '<i class="festival-dot"></i>';
    const bounds = L.latLngBounds(g.items.map(f => [f.lat,f.lon]));
    const marker = L.marker(bounds.getCenter(),{icon:L.divIcon({className:'festival-marker',html:'<span class="festival-pin">' + html + '</span>',iconSize:[44,44],iconAnchor:[22,22]}),title:g.items.map(f=>f.name).join(' · ') + (count > 1 ? ' · 눌러서 확대해요' : '')}).addTo(festivalMarkers);
    if (count > 1) {
      marker.on('click', () => { atHome=false; moveToBounds(bounds,{paddingTopLeft:leftPad(),paddingBottomRight:bottomPad(),maxZoom:Math.min(13,map.getZoom()+2),duration:.6}); });
      if (map.getZoom() < 13) continue;
    }
    const popup = document.createElement('div');
    g.items.forEach(f => { const p=document.createElement('p'); p.textContent=f.name; popup.append(p); popup.insertAdjacentHTML('beforeend', routeLink(f)); });
    marker.bindPopup(popup);
  }
}
function syncModeNavigation() {
  if (weatherMarkers.size) scheduleLabels();
  const places=!savedView&&mode==='explore'&&exploreLayer==='places',outings=!savedView&&mode==='explore'&&exploreLayer==='outing';
  if(mode==='explore'&&!savedView&&!['places','outing'].includes(exploreLayer))lastUtilityLayer=exploreLayer;
  for(const [selector,active] of [['[data-open-places]',places],['[data-open-outings]',outings]]) {
    const button=document.querySelector(selector);button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
  }
  const utility=!savedView&&!places&&!outings;
  root.dataset.navigation=savedView?'saved':outings?'courses':places?'places':'utilities';
  root.dataset.courseWelcome=String(outings&&!savedView&&!overseasView&&!selection&&outingTheme==='date');
  syncDiscoveryMarker();
  document.querySelector('[data-open-saved]').setAttribute('aria-pressed',String(savedView));
  document.querySelector('[data-open-utilities]').setAttribute('aria-pressed',String(utility));
  document.querySelectorAll('[data-mode-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.modeChoice===mode&&!places&&!outings)));
}
function applyMode() {
  cancelRoutePicking();
  scheduleLabels();
  syncTravelMap();
  rootMode();
  outingMarkers.clearLayers();
  syncModeNavigation();
  locationFocus.clearLayers();
  placeMarkers.clearLayers();map.attributionControl.removeAttribution(placeAttribution);
  updateRainScene();
  exploreTools.hidden=mode!=='explore'; fuelMarkers.clearLayers(); parkingMarkers.clearLayers();
  map.closePopup(); bubbleEl.hidden = true; bubbleAt = null; bubbleUntil = 0; replayEl.hidden = true;
  map.getPane('pulses').style.display = mode === 'explore' ? 'none' : '';
  if (mode === 'explore') festivalMarkers.addTo(map); else map.removeLayer(festivalMarkers);
  document.getElementById('map-legend').hidden = mode === 'explore';
  munis.forEach(m => { clearTimeout(m.flashTimer); m.flashing=false; m.layer.getElement()?.classList.remove('flash'); restyle(m); });
  syncCategories(); renderFeed(); fitSheet();
}
document.querySelectorAll('[data-mode-choice]').forEach(b=>b.addEventListener('click',()=>{
  rememberSelectedFeed();
  exploreChoiceChanged=true;savedView=false;
  if (mode === b.dataset.modeChoice) {
    if(mode==='explore'&&['places','outing'].includes(exploreLayer)) { const utilities=availableLayers().filter(x=>!['places','outing'].includes(x[0]));exploreLayer=utilities.find(x=>x[0]===lastUtilityLayer)?.[0]||utilities[0]?.[0]||exploreLayer;applyMode();resetSelectedFeed(); }
    return;
  }
  mode=b.dataset.modeChoice;
  try { localStorage.setItem('nallae-mode',mode); } catch (_) {}
  applyMode(); restoreSelectedFeed();
}));
map.on('moveend zoomend',renderFestivalMarkers);
document.querySelector('[data-open-places]').addEventListener('click',()=>{
  exploreChoiceChanged=true;savedView=false;
  if(!placesData){toast('식당 자료를 불러오는 중이에요. 잠시 후 다시 눌러 주세요.');return;}
  mode='explore';exploreLayer='places';
  try{localStorage.setItem('nallae-mode',mode);localStorage.setItem('nallae-explore-layer',exploreLayer);}catch(_){}
  applyMode();if(mobileSheet.matches&&sheetStage===0)setSheetStage(1);resetSelectedFeed();
});
document.querySelector('[data-open-outings]').addEventListener('click',()=>{
  if(mode==='explore'&&exploreLayer==='outing'&&!savedView&&outingTheme==='date'){if(mobileSheet.matches)setSheetStage(2,false);return;}
  exploreChoiceChanged=true;savedView=false;overseasView=false;outingTheme='date';
  if(!outingIndex){toast('놀거리 자료를 불러오는 중이에요.');loadExploreData(['outings/index']);return;}
  mode='explore';exploreLayer='outing';
  try{localStorage.setItem('nallae-mode',mode);localStorage.setItem('nallae-explore-layer',exploreLayer);}catch(_){}
  applyMode();if(mobileSheet.matches)setSheetStage(2,false);resetSelectedFeed();
});
document.querySelector('[data-open-saved]').addEventListener('click',()=>{if(savedView&&mode==='explore'&&exploreLayer==='outing'){if(mobileSheet.matches)setSheetStage(2,false);return;}exploreChoiceChanged=true;savedView=true;outingTheme='plans';outingQuery='';mode='explore';exploreLayer='outing';applyMode();if(mobileSheet.matches)setSheetStage(2,false);resetSelectedFeed();});
document.querySelector('[data-open-utilities]').addEventListener('click',()=>{savedView=false;exploreChoiceChanged=true;mode='explore';const layers=availableLayers().filter(x=>!['places','outing'].includes(x[0]));exploreLayer=layers.find(x=>x[0]===lastUtilityLayer)?.[0]||layers[0]?.[0]||'weather';applyMode();resetSelectedFeed();});
document.addEventListener('click',e=>{const b=e.target.closest('[data-quick-region]');if(b){const m=muniByCode.get(b.dataset.quickRegion);if(m){exploreTools.querySelector('.outing-filters-dialog')?.close();select(m,false);}}});
exploreTools.addEventListener('change',e=>{if(e.target.matches('[data-outing-stop-count]')){outingStopCount=Number(e.target.value)===3?3:2;outingTheme='date';outingPlanLimit=3;renderOutingCards();}});
exploreTools.addEventListener('click',e=>{const b=e.target.closest('[data-saved-tab]');if(b){overseasView=false;outingTheme=b.dataset.savedTab;syncTravelMap();renderOutings();resetSelectedFeed();}});
exploreTools.addEventListener('input',e=>{if(!e.target.matches('[data-outing-region-search]'))return;const q=e.target.value.replace(/\s/g,'').toLowerCase();const list=exploreTools.querySelector('.outing-region-results');list.innerHTML=q?munis.filter(m=>label(m).replace(/\s/g,'').toLowerCase().includes(q)).slice(0,12).map(m=>'<button type="button" data-quick-region="'+m.code+'">'+escapeHtml(label(m))+'</button>').join('')||'<p>해당 동네를 찾지 못했어요.</p>':'';});

// Travel uses its own catalogue/IDs/storage; domestic data and personal records stay intact.
let overseasData=null,overseasError=false,overseasRequest=null,overseasView=false,overseasCityId='',travelMap=null,travelMapContext=false;
let travelStatus={state:'idle',message:''},travelBasemapEnabled=false;
const travelSaved=JippiTravel.readSaved();
const travelPins=L.layerGroup().addTo(map);
const compactTravelControls=matchMedia('(min-width:760px) and (max-height:500px)');
compactTravelControls.addEventListener('change',()=>{const d=exploreTools.querySelector('.travel-controls');if(d)d.open=!compactTravelControls.matches;});
function travelEntry(){return '<button type="button" class="travel-entry travel-entry-quiet" data-travel-open><span>일본·중국도 둘러보기</span><span aria-hidden="true">›</span></button>';}
function travelTabs(){return '<div class="travel-tabs" role="group" aria-label="코스 지역"><button type="button" data-travel-domestic aria-pressed="false">국내 코스</button><button type="button" data-travel-open aria-pressed="true">일본·중국 여행</button></div>';}
function travelSavedTabs(){return '<div class="saved-tabs" role="group" aria-label="저장한 항목 종류">'+[['plans','코스'],['saved','장소'],['restaurants','맛집'],['travel','여행']].map(([id,name])=>'<button type="button" data-saved-tab="'+id+'" aria-pressed="'+(id==='travel')+'">'+name+'</button>').join('')+'</div>';}
function syncTravelMap(){
  const active=mode==='explore'&&exploreLayer==='outing'&&(!savedView||outingTheme==='travel');
  if(!active){overseasView=false;travelPins.clearLayers();if(travelMapContext&&homeBounds){atHome=true;selectionAutoFit=!!selection;selection?fitSelection():fitHome();travelMapContext=false;}}
  root.dataset.overseasCity=active&&(overseasView||savedView&&outingTheme==='travel')?'true':'false';
  if(!overseasView&&!(savedView&&outingTheme==='travel'))travelPins.clearLayers();
  travelMap?.setVisible(active,{basemap:overseasView||savedView&&outingTheme==='travel'});
}
function loadTravel(){
  if(overseasRequest)return overseasRequest;
  overseasError=false;
  overseasRequest=fetchJsonData('data/overseas-courses.json').then(JippiTravel.validate).then(data=>{
    overseasData=data;
    travelMap=JippiOverseasMap.create({map,L,cities:data.cities,persistentCoast:true,getObstacles:()=>[document.querySelector('.controls').getBoundingClientRect()],getVisibleArea:()=>mapSafeArea(),getPadding:()=>({paddingTopLeft:leftPad(),paddingBottomRight:[bottomPad()[0],Math.min(bottomPad()[1],200)]}),onCitySelect:openTravelCity,onStatus:status=>{travelStatus=status;document.querySelectorAll('[data-travel-basemap]').forEach(x=>x.textContent=travelBasemapButtonText());document.querySelectorAll('[data-travel-status]').forEach(x=>x.textContent=status.message||'');}});
    syncTravelMap();
    if(mode==='explore'&&exploreLayer==='outing'&&!selection&&!nextPlanId&&!savedView&&!overseasView&&atHome&&!exploreChoiceChanged)fitHome();
    if(overseasView){travelMapContext=true;atHome=false;selectionAutoFit=false;overseasCityId=overseasCityId||data.cities[0].id;travelMap.focusCity(overseasCityId);}
    if(directTravel){const entered=new URL(location.href);entered.searchParams.delete('travel');history.replaceState(null,'',entered.href);}
    if(mode==='explore'&&exploreLayer==='outing')renderOutings();
  }).catch(()=>{overseasError=true;if(overseasView||savedView&&outingTheme==='travel')renderTravel();}).finally(()=>{overseasRequest=null;});
  return overseasRequest;
}
function fitTravelOverview(){map.fitBounds([[28,115],[43,143]],{paddingTopLeft:innerWidth<760?[20,110]:[390,90],paddingBottomRight:innerWidth<760?[20,Math.min(bottomPad()[1],200)]:[30,30],animate:false,maxZoom:5});}
function openTravelCity(id){
  regionPreviewCode='';
  locationRequestId++;
  if(!overseasData)return;
  if(!overseasData.cities.some(x=>x.id===id))return;
  overseasView=true;overseasCityId=id;savedView=false;mode='explore';exploreLayer='outing';exploreChoiceChanged=true;travelMapContext=true;atHome=false;selectionAutoFit=false;
  applyMode();if(mobileSheet.matches)setSheetStage(1,false);travelMap?.focusCity(id);resetSelectedFeed();
}
function travelBasemapButtonText(){return travelBasemapEnabled?(travelStatus.state==='fallback'?'상세지도 다시 불러오기':'상세지도 끄기'):'거리·건물 상세지도 켜기';}
function travelViewKey(){return String(savedView&&outingTheme==='travel')+'|'+overseasCityId+'|'+String(!!overseasData)+'|'+[...travelSaved].join(',');}
function renderTravel(){
  exploreTools.dataset.travelView=travelViewKey();
  const saved=savedView&&outingTheme==='travel';
  root.dataset.courseWelcome='false';
  titleEl.textContent=saved?'저장한 여행 코스':'둘이 떠나는 여행';
  subEl.textContent='';outingMarkers.clearLayers();
  exploreTools.innerHTML='<details class="travel-controls"'+(compactTravelControls.matches?'':' open')+'><summary>'+JippiTravel.esc(saved?'저장한 여행 코스':(overseasData?.cities.find(c=>c.id===overseasCityId)?.nameKo||'일본·중국')+' · 여행 코스')+' · 도시 바꾸기 ▾</summary>'+(saved?travelSavedTabs():travelTabs())+(overseasData?'<div class="travel-city-chips" role="group" aria-label="준비된 여행 도시">'+overseasData.cities.map(c=>'<button type="button" data-travel-city="'+JippiTravel.esc(c.id)+'" aria-pressed="'+(!saved&&overseasCityId===c.id)+'">'+JippiTravel.esc(c.nameKo)+' <span lang="'+(c.countryCode==='JP'?'ja':'zh-CN')+'">'+JippiTravel.esc(c.nameLocal)+'</span></button>').join('')+'</div><button type="button" class="travel-overview-button" data-travel-overview>지도에서 도시 고르기</button>':'')+'</details>';
  if(!overseasData){feedEl.innerHTML='<li class="empty">'+(overseasError?'여행 자료를 불러오지 못했어요. 저장한 항목은 지우지 않았어요. <button type="button" data-travel-retry>다시 받기</button>':'여행 코스를 준비하고 있어요…')+'</li>';return;}
  const courses=overseasData.courses.filter(c=>saved?travelSaved.has(c.id):!overseasCityId||c.cityId===overseasCityId);
  const unavailable=saved?travelSaved.size-courses.length:0;
  feedEl.innerHTML='<li class="travel-intro"><p class="travel-eyebrow">가까운 여행부터, 지삐와 함께</p><h3>'+JippiTravel.esc(saved?'다음 여행에 꺼내볼 곳':(overseasCityId?(overseasData.cities.find(c=>c.id===overseasCityId)?.nameKo||'여행지')+'에서 둘이 걷기':'어느 도시로 떠나볼까요?') )+'</h3><p>오사카·교토·상하이의 준비된 코스부터 골라보세요.</p><details class="travel-basemap"><summary>거리·건물 상세지도</summary><button type="button" data-travel-basemap>'+travelBasemapButtonText()+'</button><p>외부 지도 서버에 IP와 보는 지도 영역이 전달돼요. 지도 없이도 코스·저장은 쓸 수 있어요.</p><p data-travel-status role="status">'+JippiTravel.esc(travelStatus.message||'')+'</p></details></li>'+courses.map(c=>JippiTravel.card(c,overseasData,travelSaved)).join('')+(unavailable?'<li class="explore-source">최신 자료에서 확인하지 못한 여행 코스 '+unavailable+'개가 있어요. 저장 식별번호는 이 기기에 그대로 보관해요.</li>':'')+(!courses.length&&!unavailable?'<li class="empty">아직 저장한 여행 코스가 없어요. <button type="button" data-travel-open>여행 코스 고르기</button></li>':'');
  fitSheet();
}
function focusTravelCourse(id){
  const course=overseasData?.courses.find(c=>c.id===id);if(!course)return;
  const city=overseasData.cities.find(c=>c.id===course.cityId),stops=course.stopIds.map(id=>overseasData.places.find(p=>p.id===id));
  atHome=false;selectionAutoFit=false;travelMapContext=true;travelPins.clearLayers();map.closePopup();setSheetStage(0,false);clearTimeout(sheetFitTimer);
  stops.forEach((p,i)=>L.marker([p.lat,p.lon],{title:p.nameKo+' · 대표 위치',icon:L.divIcon({className:'travel-place-pin',html:'<span>'+(i+1)+'</span>',iconSize:[40,44],iconAnchor:[20,42]})}).bindPopup('<strong>'+JippiTravel.esc(p.nameKo)+' · '+JippiTravel.esc(p.nameLocal)+'</strong><p>'+JippiTravel.esc(p.address)+'</p><p>'+JippiTravel.esc(p.positionNote)+'</p><a href="'+JippiTravel.esc(JippiTravel.placeUrl(p,city))+'" target="_blank" rel="noopener noreferrer">Google 장소 검색 ↗</a>',{maxWidth:280,autoPanPaddingTopLeft:L.point(12,140)}).addTo(travelPins));
  map.fitBounds(stops.map(p=>[p.lat,p.lon]),outingBoundsOptions(16));
}
document.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.hasAttribute('data-travel-open')){regionPreviewCode='';locationRequestId++;exploreChoiceChanged=true;travelMapContext=true;atHome=false;selectionAutoFit=false;overseasView=true;savedView=false;overseasCityId=overseasCityId||overseasData?.cities[0]?.id||'';mode='explore';exploreLayer='outing';applyMode();if(mobileSheet.matches)setSheetStage(2,false);resetSelectedFeed();if(!overseasData)loadTravel();else if(overseasCityId){travelMapContext=true;atHome=false;selectionAutoFit=false;travelMap?.focusCity(overseasCityId);}return;}
  if(b.hasAttribute('data-travel-domestic')){locationRequestId++;overseasView=false;savedView=false;outingTheme='date';travelPins.clearLayers();travelMapContext=false;syncTravelMap();applyMode();atHome=!selection;selection?fitSelection():fitHome();resetSelectedFeed();return;}
  if(b.dataset.travelCity){openTravelCity(b.dataset.travelCity);return;}
  if(b.dataset.travelMap){focusTravelCourse(b.dataset.travelMap);return;}
  if(b.hasAttribute('data-travel-basemap')){if(travelBasemapEnabled&&travelStatus.state!=='fallback'){travelBasemapEnabled=false;travelMap?.disableBasemap();}else{travelBasemapEnabled=true;travelMap?.enableBasemap();}return;}
  if(b.hasAttribute('data-travel-overview')){locationRequestId++;travelPins.clearLayers();atHome=false;selectionAutoFit=false;travelMapContext=true;setSheetStage(0,false);clearTimeout(sheetFitTimer);fitTravelOverview();return;}
  if(b.hasAttribute('data-travel-retry')){loadTravel();return;}
  if(b.dataset.travelSave){
    const id=b.dataset.travelSave;if(!overseasData?.courses.some(c=>c.id===id))return;
    const next=new Set(travelSaved),removing=next.has(id);if(removing)next.delete(id);else{if(next.size>=100){toast('여행 코스는 최대 100개까지 저장할 수 있어요.');return;}next.add(id);}
    try{JippiTravel.writeSaved(next);}catch{toast('기기 저장 공간을 확인해 주세요. 저장을 바꾸지 못했어요.');return;}
    travelSaved.clear();next.forEach(id=>travelSaved.add(id));renderTravel();toast(removing?'여행 코스 저장을 해제했어요.':'여행 코스를 이 기기에 저장했어요.');([...feedEl.querySelectorAll('[data-travel-save]')].find(x=>x.dataset.travelSave===id)||exploreTools.querySelector('[data-saved-tab="travel"]')||exploreTools.querySelector('[data-travel-open]'))?.focus({preventScroll:true});return;
  }
  if(b.dataset.travelCopy){const p=overseasData?.places.find(x=>x.id===b.dataset.travelCopy);if(!p)return;const text=p.nameLocal+'\n'+p.address;try{await navigator.clipboard.writeText(text);toast('현지어 이름과 주소를 복사했어요.');}catch{const dialog=document.createElement('dialog');dialog.className='travel-copy-dialog';dialog.innerHTML='<div class="dialog-head"><h2>현지어 이름·주소</h2><button type="button">닫기</button></div><p>글자를 길게 눌러 복사해 주세요.</p><textarea readonly aria-label="복사할 현지어 이름과 주소"></textarea>';dialog.querySelector('textarea').value=text;dialog.querySelector('button').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();dialog.querySelector('textarea').select();}}
});

feedEl.addEventListener('click', async event => {
  const retry=event.target.closest('[data-entry-retry]');
  if(!retry)return;
  retry.disabled=true;
  try { await loadExploreData(retry.hasAttribute('data-weather-retry')?['weather','forecast']:undefined); } finally { retry.disabled=false; }
});
if(requestedView==='settings') document.getElementById('settings-dialog').showModal();
document.querySelector('.main-navigation').addEventListener('click',event=>{
  if(!event.target.closest('button'))return;
  const url=new URL(location.href);
  url.searchParams.set('view',root.dataset.navigation);
  history.replaceState(history.state,'',url);
});
fetchJsonData('data/regions.json', { cache: 'default' })
  .then((topo) => {
    setupRegions(topo);
    initFavorites();
    if(sectionEntry && mobileSheet.matches) setSheetStage(requestedView==='saved'?2:1,false);
    loadDiscoveryShelf();
    loadRegionPhotos();
    if(directTravel){mode='explore';exploreLayer='outing';overseasView=false;savedView=false;}
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
    loadTravel();
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

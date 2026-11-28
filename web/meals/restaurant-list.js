// 전국 식당·좌표 자료만 받는다. 사용자의 위치와 거리 계산은 이 문서 안에서만 처리한다.
(() => {
  'use strict';
  const result = document.querySelector('#dining-results');
  const status = document.querySelector('#dining-status');
  const near = document.querySelector('#dining-near');
  const more = document.querySelector('#dining-more');
  const retry = document.querySelector('#dining-retry');
  const fileNames = ['places', 'heritage-restaurants', 'place-locations', 'meal-restaurant-coordinates'];
  const sources = new Map();
  const version = document.documentElement.dataset.appVersion;
  const batch = 4;
  let menu = '', limit = batch, district = null, districtPoint = null;
  const locationOrder = JippiRestaurantLocation.create(navigator, state => {
    const point = state.point;
    if (districtPoint === point) { render(); return; }
    district = null;
    districtPoint = point;
    render();
    if (point) JippiRestaurantRegion.find(point).catch(() => null).then(code => {
      if (districtPoint === point) { district = code; render(); }
    });
  });

  function load(name) {
    if (['pending','ready'].includes(sources.get(name)?.state)) return;
    sources.set(name, {state:'pending'});
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9500);
    fetch('data/' + name + '.json?v=' + version, {signal:controller.signal})
      .then(async response => {
        if (!response.ok) throw Error('식당 자료 수신 실패');
        const {items} = await response.json();
        const list = name === 'places' || name === 'heritage-restaurants';
        if (!items || typeof items !== 'object' || Array.isArray(items) !== list) throw Error('식당 자료 형식');
        sources.set(name, {state:'ready', items});
      })
      .catch(() => sources.set(name, {state:'failed'}))
      .finally(() => {clearTimeout(timer); render();});
  }
  function textNode(tag, text, className) {
    const el = document.createElement(tag);
    el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  function distanceLabel(km) {
    if (km < 0.1) return '직선 100m 이내';
    return '직선 ' + (km < 1 ? Math.round(km * 1000 / 10) * 10 + 'm' :
      (km < 10 ? km.toFixed(1) : Math.round(km)) + 'km');
  }
  function card({place, distanceKm}, sameDistrict, coordinates) {
    const li = document.createElement('li');
    const link = document.createElement('a');
    const name = [place.name, place.branch].filter(Boolean).join(' ');
    link.href = coordinates && Number.isFinite(coordinates.lat) && Number.isFinite(coordinates.lon)
      ? 'https://map.kakao.com/link/map/' + encodeURIComponent(name) + ',' + coordinates.lat + ',' + coordinates.lon
      : 'https://map.kakao.com/link/search/' + encodeURIComponent(place.address);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', name + (coordinates ? ' 위치' : ' 주소') + ' 카카오맵에서 보기 (새 창)');
    link.append(textNode('strong', name), textNode('span','↗','dining-arrow'));
    const details = [place.district];
    if (Number.isFinite(distanceKm)) details.push(distanceLabel(distanceKm));
    else if (sameDistrict) details.push('같은 시·군·구');
    li.append(textNode('small',details.join(' · '),'dining-meta'),link,
      textNode('p',place.food,'dining-food'),textNode('p',place.address,'dining-address'));
    const date = place.kindDate || place.sourceDate || place.checkedAt;
    if (date) {
      const label = place.kindDate || place.sourceDate ? '메뉴 자료 ' : '자료 확인 ';
      li.append(textNode('small',label + date.replaceAll('-','.'),'dining-date'));
    }
    return li;
  }
  function render() {
    if (!menu) return;
    const catalogs = fileNames.slice(0,2).map(name => sources.get(name));
    const pending = catalogs.some(s => !s || s.state === 'pending');
    const missing = catalogs.some(s => s?.state === 'failed');
    const anyMenuData = catalogs.some(s => s?.state === 'ready');
    const locationsMissing = fileNames.slice(2).some(n => sources.get(n)?.state === 'failed');
    const state = locationOrder.getState();
    const items = catalogs.flatMap(s => s?.items || []);
    const coords = {...sources.get('meal-restaurant-coordinates')?.items, ...sources.get('place-locations')?.items};
    const matches = JippiMealRestaurants.find(menu, items, coords, state.point);
    const count = matches.length;
    document.querySelector('#dining-count').textContent = count ? (pending || missing ? '확인된 ' : '전국 ') + count + '곳' : '';
    near.hidden = !count || !navigator.geolocation;
    near.disabled = state.status === 'locating';
    near.textContent = ({ready:'위치 새로 확인', locating:'위치 확인 중…',timeout:'위치 다시 확인',
      denied:'위치 다시 확인',unavailable:'위치 다시 확인'})[state.status] || '내 주변부터';
    near.setAttribute('aria-label',near.textContent);
    retry.hidden = !(missing || locationsMissing);
    document.querySelector('#dining-credit').hidden = !count;
    document.querySelector('#dining-osm').hidden = !matches.some(m => sources.get('place-locations')?.items?.[m.place.id]);
    let note = '';
    if (!count) {
      if (pending) note = '메뉴가 등록된 식당을 찾고 있어요.';
      else if (missing) note = anyMenuData ? '일부 목록을 받지 못해 식당을 더 확인할 수 없어요.' : '식당 목록을 불러오지 못했어요.';
      else note = '아직 지삐에 이 메뉴를 등록한 식당이 없어요.';
    } else {
      const notes = {locating:state.point ? '직전 위치순으로 보면서 새 위치를 확인하고 있어요.' : '현재 위치를 확인하고 있어요.',
        expired:'위치 정보가 오래되어 지역순으로 표시했어요. 내 주변부터 다시 볼 수 있어요.',
        denied:'위치 접근이 꺼져 있어 지역순으로 보여드려요. 가까운 순으로 보려면 위치 권한을 허용해 주세요.',
        timeout:'위치 확인이 늦어져 지역순으로 보여드려요.',unavailable:'위치를 확인하지 못해 지역순으로 보여드려요.'};
      note = notes[state.status] || '';
      if (pending) note += ' 나머지 식당 목록을 불러오고 있어요.';
      if (missing) note += ' 받을 수 있는 식당 목록만 표시했어요.';
      if (state.point && fileNames.slice(2).some(n => sources.get(n)?.state === 'pending')) note += ' 식당 거리를 확인하고 있어요.';
      if (locationsMissing && state.point) note += ' 일부 거리 자료를 받지 못했어요.';
    }
    if (status.textContent !== note.trim()) status.textContent = note.trim();
    status.hidden = !note.trim();
    const localUnknown = matches.filter(m => m.distanceKm == null && district && m.place.sgg === district);
    const ranked = matches.filter(m => Number.isFinite(m.distanceKm));
    const other = matches.filter(m => m.distanceKm == null && !(district && m.place.sgg === district));
    let groups;
    if (state.point) {
      // 내 동네의 좌표 없는 매장이 다른 도시의 먼 매장 뒤로 밀리지 않도록 한다.
      groups = [['내 주변 5km 이내', ranked.filter(m => m.distanceKm <= 5)],
        ['같은 시·군·구 · 거리 미확인',localUnknown],['5km 밖 · 가까운 순',ranked.filter(m => m.distanceKm > 5)],
        ['거리 미확인 · 지역순',other]];
    } else groups = [['',matches]];
    let remaining = limit;
    const chunks = [];
    for (const [name, list] of groups) {
      const visible = list.slice(0,remaining);
      if (!visible.length) continue;
      if (name) chunks.push(textNode('h3',name,'dining-group'));
      const ul = document.createElement('ul');
      ul.append(...visible.map(m => card(m, m.distanceKm == null && district && m.place.sgg === district, coords[m.place.id])));
      chunks.push(ul);
      remaining -= visible.length;
    }
    // 비동기 거리 갱신 때 키보드로 선택 중인 가게가 초점을 잃지 않게 한다.
    const focused = result.contains(document.activeElement) ? document.activeElement.href : null;
    result.replaceChildren(...chunks);
    if (focused) [...result.querySelectorAll('a')].find(a => a.href === focused)?.focus({preventScroll:true});
    if (count && !document.hidden) void locationOrder.activate();
    else if (!pending && !count) locationOrder.deactivate();
    more.hidden = count <= limit;
    more.textContent = '식당 ' + Math.min(batch, Math.max(0,count-limit)) + '곳 더 보기';
  }
  function activate() {
    if (menu && !document.hidden) render();
  }
  function show(name) {
    if (menu !== name) limit = batch;
    menu = name;
    for (const file of fileNames) if (!sources.has(file)) load(file);
    render();
  }
  function hide() { menu = ''; locationOrder.deactivate(); }
  near.addEventListener('click',() => locationOrder.request());
  retry.addEventListener('click',() => {fileNames.forEach(load);render();});
  more.addEventListener('click',() => {
    const old = limit;
    limit += batch;
    render();
    result.querySelectorAll('li a')[old]?.focus({preventScroll:false});
  });
  document.addEventListener('visibilitychange',() => {
    if (document.hidden) locationOrder.deactivate(); else activate();
  });
  window.addEventListener('pagehide',() => locationOrder.deactivate());
  window.addEventListener('pageshow',activate);
  globalThis.JippiDiningList = Object.freeze({show,hide});
})();

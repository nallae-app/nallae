(() => {
  'use strict';
  function restaurantPoint(id, data) {
    for (const name of ['place-locations','meal-restaurant-coordinates']) {
      const point=data.get(name)?.[id];
      if (!point || !Number.isFinite(point.lat) || point.lat<33 || point.lat>39 ||
          !Number.isFinite(point.lon) || point.lon<124 || point.lon>132) continue;
      const venue = point.url === 'https://www.starfield.co.kr/goyang/about/directions.do';
      if (name !== 'place-locations' && point.source && !venue) continue;
      return {at:[point.lat,point.lon],credit:name==='place-locations'?'osm':venue?'venue':'official'};
    }
    return null;
  }
  function create({ id, map, L, panel, fetchData, districtBounds, onExit }) {
    const section = document.createElement('section');
    section.className = 'restaurant-focus';
    section.setAttribute('aria-label', '선택한 식당 지도');
    section.innerHTML = '<a class="restaurant-focus-back" href="./?home=1&amp;meal=dine">← 외식 목록으로</a><h2></h2><p class="restaurant-focus-address"></p><p class="restaurant-focus-status" role="status"></p><div class="restaurant-focus-actions"><button type="button" data-focus-locate hidden></button><button type="button" data-focus-retry hidden>자료 다시 받기</button><a data-focus-address target="_blank" rel="noopener noreferrer" hidden>주소로 찾기 ↗</a></div>';
    section.querySelector('h2').textContent = '식당을 찾고 있어요…';
    const status = section.querySelector('.restaurant-focus-status');
    const locate = section.querySelector('[data-focus-locate]');
    const retry = section.querySelector('[data-focus-retry]');
    const address = section.querySelector('[data-focus-address]');
    const back = section.querySelector('.restaurant-focus-back');
    const fromSaved = new URL(location.href).searchParams.get('from')==='saved';
    if (fromSaved) {
      back.textContent='← 저장한 식당으로';
      back.href='explore.html?view=saved&tab=restaurants';
    }
    try {
      const ref = new URL(document.referrer), home = new URL('./', location.href);
      const returnPaths = fromSaved ? [home.pathname + 'explore.html'] : [home.pathname, home.pathname + 'index.html'];
      if (ref.origin === home.origin && returnPaths.includes(ref.pathname)) {
        back.addEventListener('click', e => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && history.length > 1) { e.preventDefault();history.back(); } });
      }
    } catch (_) { /* 직접 공유된 링크는 홈의 외식 목록으로 돌아간다. */ }
    panel.prepend(section);
    panel.classList.add('restaurant-focus-panel');
    const layer = L.layerGroup().addTo(map);
    const surface=map.getContainer();
    surface.classList.add('has-restaurant-focus','restaurant-no-pin');
    for (const [name,z] of [['restaurantRoads',415],['restaurantStreetNames',418],['restaurantConnection',450]]) {
      const pane=map.getPane(name)||map.createPane(name);
      pane.style.zIndex=z;
      pane.style.pointerEvents='none';
    }
    const roads=L.layerGroup().addTo(map), streetNames=L.layerGroup().addTo(map);
    const roadCanvas=L.canvas({pane:'restaurantRoads',padding:.25});
    const connectionSvg=L.svg({pane:'restaurantConnection'});
    const roadCredit='도로 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors · ODbL</a>';
    const context=document.createElement('div');
    context.className='restaurant-map-context';context.hidden=true;surface.append(context);
    let roadRows=null, roadLoading=false, roadCredited=false, failedAt=0;
    const previousMinZoom = map.getMinZoom();
    map.setMinZoom(0);
    let open = true, follow = true, frame = 0, generation = 0;
    let place = null, destination = null, userPoint = null, area = null, source = '', coordsFailed = false;
    const credits = {
      osm: '식당 위치 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',
      official: '식당 위치 <a href="https://www.data.go.kr/data/15083033/fileData.do" target="_blank" rel="noopener">소상공인시장진흥공단</a>',
      venue: '건물 위치 <a href="https://www.starfield.co.kr/goyang/about/directions.do" target="_blank" rel="noopener">스타필드 고양</a>',
    };
    function credit(next) {
      if (next === source) return;
      if (credits[source]) map.attributionControl.removeAttribution(credits[source]);
      if (credits[next]) map.attributionControl.addAttribution(credits[next]);
      source = next;
    }
    function pin(point, kind, text) {
      const el = document.createElement('span');
      el.textContent = text;
      return L.marker(point, { keyboard:false, interactive:false, zIndexOffset:kind === 'user'?601:600,
        icon:L.divIcon({className:'restaurant-focus-pin is-'+kind, html:el, iconSize:[0,0], iconAnchor:[0,0]})
      }).addTo(layer);
    }
    const roadColor = () => document.documentElement.dataset.theme==='dark'
      ? {major:'#899caa',local:'#627d91',path:'#567386'} : {major:'#c4ad83',local:'#c4c7bb',path:'#c5cdbd'};
    function clearRoads() {
      roads.clearLayers();streetNames.clearLayers();
      if (roadCredited) map.attributionControl.removeAttribution(roadCredit);
      roadCredited=false;
    }
    function displayRoads() {
      clearRoads();
      if (!open || !roadRows || map.getZoom()<14) return;
      const bounds=map.getBounds().pad(.12), colors=roadColor(), shown=[];
      for (const row of roadRows) {
        if (!bounds.intersects(row.bounds)) continue;
        const style={major:3.5,local:2,path:1.2};
        L.polyline(row.points,{renderer:roadCanvas,interactive:false,color:colors[row.kind],weight:style[row.kind],opacity:.9,dashArray:row.kind==='path'?'3 4':null}).addTo(roads);
        if (row.name && row.kind!=='path') shown.push(row);
      }
      if (roads.getLayers().length) {
        map.attributionControl.addAttribution(roadCredit);roadCredited=true;
      }
      if (map.getZoom()<15) return;
      const size=map.getSize(), occupied=[], seen=new Set();
      if(destination) occupied.push(map.latLngToContainerPoint(destination));
      if(userPoint) occupied.push(map.latLngToContainerPoint(userPoint));
      for(const road of shown.sort((a,b)=>(a.kind==='major'?0:1)-(b.kind==='major'?0:1)||b.points.length-a.points.length)){
        if(seen.has(road.name))continue;
        const at=road.points[Math.floor(road.points.length/2)], pt=map.latLngToContainerPoint(at);
        if(pt.x<55||pt.x>size.x-55||pt.y<70||pt.y>size.y-24||occupied.some(q=>Math.abs(pt.x-q.x)<98 && Math.abs(pt.y-q.y)<32))continue;
        const span=document.createElement('span');span.textContent=road.name;span.setAttribute('aria-hidden','true');
        L.marker(at,{pane:'restaurantStreetNames',interactive:false,keyboard:false,icon:L.divIcon({className:'restaurant-street-name',html:span,iconSize:[0,0]})}).addTo(streetNames);
        seen.add(road.name);occupied.push(pt);
        if(seen.size>=10)break;
      }
    }
    async function refreshRoads() {
      if (!open || !place) return;
      const inView=destination && map.getBounds().pad(.12).contains(destination);
      context.hidden=!inView || map.getZoom()<12;
      if (!inView || map.getZoom()<14) {clearRoads();return;}
      if (roadRows) {displayRoads();return;}
      if (roadLoading || Date.now()-failedAt<60000 || !/^\d{5}$/.test(place.sgg)) return;
      roadLoading=true;
      try {
        const data=await fetchData('data/restaurant-streets/'+place.sgg+'.json');
        if (!open || !Array.isArray(data.roads)) return;
        roadRows=data.roads.flatMap(([kind,name,line])=>{
          if (!['major','local','path'].includes(kind)||!Array.isArray(line)||line.length<2)return [];
          const points=line.map(([lon,lat])=>[lat,lon]);
          return [{kind,name,points,bounds:L.latLngBounds(points)}];
        });
        if (map.getBounds().pad(.12).contains(destination)) displayRoads();
      } catch (_) {failedAt=Date.now();} finally {roadLoading=false;}
    }
    map.on('moveend zoomend',refreshRoads);
    const themeObserver=new MutationObserver(refreshRoads);
    themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
    function redraw() {
      layer.clearLayers();
      if (destination && userPoint) L.polyline([userPoint,destination], {renderer:connectionSvg,interactive:false,color:document.documentElement.dataset.theme==='dark'?'#8ac9f4':'#367393',weight:2.5,opacity:.95,dashArray:'4 6'}).addTo(layer);
      if (destination) {
        const marker = pin(destination,'shop',place.name);
        marker.getElement()?.setAttribute('aria-label',place.name+' 위치');
        marker.getElement()?.setAttribute('role','img');
      }
      if (userPoint) {
        const marker = pin(userPoint,'user','내 위치');
        marker.getElement()?.setAttribute('aria-label','내 위치');
        marker.getElement()?.setAttribute('role','img');
      }
    }
    function fit() {
      if (!open || !follow || (!destination && !area && !userPoint)) return;
      const box = map.getContainer().getBoundingClientRect();
      const card = panel.getBoundingClientRect();
      const header = document.querySelector('.topbar').getBoundingClientRect();
      const controls = document.querySelector('.controls').getBoundingClientRect();
      const wide = matchMedia('(min-width:760px)').matches;
      // 카메라 여백은 모바일 시트의 실제 높이와 라벨의 양쪽 폭을 포함한다.
      const top = Math.max(header.bottom, controls.bottom) - box.top;
      const left = wide ? Math.max(0,card.right-box.left) : 0;
      const bottom = wide ? 0 : Math.max(0,box.bottom-card.top);
      const leftMargin=Math.max(8,Math.min(106,(box.width-left-20)/3));
      const rightMargin=Math.max(8,Math.min(66,(box.width-left-20)/3));
      const vertical = Math.max(6,Math.min(40,(box.height-top-bottom-12)/3));
      const bounds = destination ? L.latLngBounds([destination]) : L.latLngBounds(area || [userPoint]);
      if (userPoint) bounds.extend(userPoint);
      if (!bounds.isValid()) return;
      map.stop().fitBounds(bounds, {
        paddingTopLeft:[left+leftMargin,top+vertical],
        paddingBottomRight:[rightMargin,bottom+vertical], maxZoom:16, animate:false
      });
    }
    function scheduleFit() {
      surface.style.setProperty('--focus-sheet', (surface.getBoundingClientRect().bottom-panel.getBoundingClientRect().top) + 'px');
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(fit);
    }
    function updatePosition(state) {
      if (!open || !place) return;
      userPoint=state.point?[state.point.lat,state.point.lon]:null;
      const parts=[];
      if (!destination) parts.push(coordsFailed ? '식당 위치 자료를 받지 못했어요.' : '식당 좌표 미확인 · 주소로 찾아보세요.');
      if (destination && userPoint) {
        const meters=NallaeLocalScope.distance(userPoint,destination);
        parts.push('내 위치에서 직선 '+(meters < 100 ? '100m 이내' : meters < 1000 ? Math.round(meters/10)*10+'m' : (meters<10000?(meters/1000).toFixed(1):Math.round(meters/1000))+'km'));
      }
      const message = {locating:'내 위치를 확인하고 있어요…',denied:'내 위치를 보려면 브라우저의 위치 접근을 허용해 주세요.',timeout:'내 위치 확인이 늦어지고 있어요. 다시 시도할 수 있어요.',unavailable:'현재 내 위치를 확인할 수 없어요.',expired:'내 위치가 오래됐어요. 다시 확인해 주세요.'}[state.status];
      if (message) parts.push(message);
      status.textContent=parts.join(' · ');
      locate.hidden=!destination || !navigator.geolocation;
      locate.disabled=state.status==='locating';
      locate.textContent=state.point?'두 위치 다시 보기':state.status==='locating'?'위치 확인 중…':'내 위치 함께 보기';
      redraw();
      scheduleFit();
    }
    const geo=JippiRestaurantLocation.create(navigator,updatePosition);
    function locateBoth() {
      if (!open || !destination) return;
      follow=true;
      if (geo.getState().point) scheduleFit();
      else geo.request();
    }
    locate.addEventListener('click',locateBoth);
    function pauseCamera() { follow=false; }
    function keyCamera(e) { if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','='].includes(e.key)) pauseCamera(); }
    surface.addEventListener('keydown',keyCamera);
    function visibility() {
      if (document.hidden) geo.deactivate();
      else if (open && destination) void geo.activate();
    }
    function hide() { geo.deactivate(); }
    document.addEventListener('visibilitychange',visibility);
    window.addEventListener('pagehide',hide);
    window.addEventListener('pageshow',visibility);
    const sizeObserver=new ResizeObserver(scheduleFit);
    sizeObserver.observe(surface);
    sizeObserver.observe(panel);
    const version=document.documentElement.dataset.appVersion;
    const loaded=new Map();
    async function load(name) {
      if (loaded.has(name)) return;
      try {
        const data=await fetchData('data/'+name+'.json?v='+version);
        const isCatalog=name==='places'||name==='heritage-restaurants';
        if (!data?.items || typeof data.items!=='object' || Array.isArray(data.items)!==isCatalog) return;
        loaded.set(name,data.items);
      } catch (_) { /* 재시도 때 실패한 자료만 다시 읽는다. */ }
    }
    async function refresh() {
      const round=++generation;
      retry.hidden=true;
      await Promise.all(['places','heritage-restaurants','place-locations','meal-restaurant-coordinates'].map(load));
      if (!open || round!==generation) return;
      const catalogs=['places','heritage-restaurants'];
      place=catalogs.flatMap(key=>loaded.get(key)||[]).find(item=>item.id===id);
      if (!place) {
        const failed=catalogs.some(key=>!loaded.has(key));
        section.querySelector('h2').textContent=failed?'식당 목록을 받지 못했어요':'등록된 식당을 찾을 수 없어요';
        retry.hidden=!failed;
        return;
      }
      const coord=restaurantPoint(id,loaded);
      destination=coord?.at || null;
      surface.classList.toggle('restaurant-no-pin',!destination);
      area=destination?null:districtBounds(place.sgg);
      context.textContent='식당 주변 · '+place.district;
      coordsFailed=!destination && ['place-locations','meal-restaurant-coordinates'].some(key=>!loaded.has(key));
      credit(coord?.credit || '');
      section.querySelector('h2').textContent=[place.name,place.branch].filter(Boolean).join(' ');
      section.querySelector('.restaurant-focus-address').textContent=place.address;
      retry.hidden=!coordsFailed;
      address.hidden=!!destination;
      address.href='https://map.kakao.com/link/search/'+encodeURIComponent(place.address);
      updatePosition(geo.getState());
      void refreshRoads();
      if (destination && !document.hidden) void geo.activate();
    }
    retry.addEventListener('click',refresh);
    void refresh();
    return {
      pauseCamera,locateBoth,
      close() {
        if (!open) return;
        open=false; generation++;
        geo.deactivate();
        sizeObserver.disconnect();
        cancelAnimationFrame(frame);
        surface.removeEventListener('keydown',keyCamera);
        document.removeEventListener('visibilitychange',visibility);
        window.removeEventListener('pagehide',hide);
        window.removeEventListener('pageshow',visibility);
        layer.remove(); credit('');
        map.off('moveend zoomend',refreshRoads);
        roads.remove();streetNames.remove();roadCanvas.remove();connectionSvg.remove();
        if (roadCredited) map.attributionControl.removeAttribution(roadCredit);
        surface.classList.remove('has-restaurant-focus','restaurant-no-pin');surface.style.removeProperty('--focus-sheet');context.remove();
        themeObserver.disconnect();
        map.setMinZoom(previousMinZoom);
        section.remove();
        panel.classList.remove('restaurant-focus-panel');
        onExit();
      },
    };
  }
  globalThis.JippiRestaurantFocusMap=Object.freeze({create});
})();

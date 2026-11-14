/* Overseas catalogue facts are separate from domestic administrative regions. */
(() => {
  'use strict';
  const KEY='jippi-overseas-plans-v1';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl=value=>{try{const u=new URL(value);return u.protocol==='https:'?u.href:'';}catch{return '';}};
  function validate(data) {
    if(data?.coordinateSystem!=='WGS84'||!Array.isArray(data.cities)||!Array.isArray(data.places)||!Array.isArray(data.courses))throw Error('catalogue shape');
    const ids=new Set(),cities=new Map(),places=new Map();
    for(const x of [...data.cities,...data.places,...data.courses]){if(!x||typeof x.id!=='string'||!x.id||ids.has(x.id))throw Error('catalogue identity');ids.add(x.id);}
    for(const c of data.cities){if(!['JP','CN'].includes(c.countryCode)||!c.nameKo||!c.nameLocal||!Number.isFinite(c.lat)||!Number.isFinite(c.lon)||Math.abs(c.lat)>85||Math.abs(c.lon)>180)throw Error('city');cities.set(c.id,c);}
    for(const p of data.places){if(!cities.has(p.cityId)||!p.nameKo||!p.nameLocal||!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||Math.abs(p.lat)>85||Math.abs(p.lon)>180||!safeUrl(p.source?.url)||!safeUrl(p.coordinateSource?.url))throw Error('place');places.set(p.id,p);}
    for(const c of data.courses){if(!cities.has(c.cityId)||c.kind!=='editorial-pair'||!Array.isArray(c.stopIds)||c.stopIds.length!==2||new Set(c.stopIds).size!==2||c.stopIds.some(id=>places.get(id)?.cityId!==c.cityId))throw Error('course');}
    return data;
  }
  function readSaved(storage){try{storage=storage||window.localStorage;const data=JSON.parse(storage.getItem(KEY)||'[]');return new Set(Array.isArray(data)?data.filter(x=>typeof x==='string').slice(0,100):[]);}catch{return new Set();}}
  function writeSaved(saved,storage){storage=storage||window.localStorage;storage.setItem(KEY,JSON.stringify([...saved]));}
  const query=(place,city)=>city.nameLocal+' '+place.nameLocal+' '+place.address;
  function placeUrl(place,city){return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(query(place,city));}
  function routeUrl(stops,city){return city.countryCode==='JP'?'https://www.google.com/maps/dir/?api=1&origin='+encodeURIComponent(query(stops[0],city))+'&destination='+encodeURIComponent(query(stops[1],city))+'&travelmode=walking':'';}
  const link=(url,label)=>'<a href="'+esc(safeUrl(url))+'" target="_blank" rel="noopener noreferrer">'+esc(label)+' ↗</a>';
  function card(course,data,saved) {
    const city=data.cities.find(x=>x.id===course.cityId),stops=course.stopIds.map(id=>data.places.find(x=>x.id===id));
    const route=routeUrl(stops,city);
    return '<li class="festival-card travel-card" data-travel-card="'+esc(course.id)+'"><span class="festival-day">'+esc(city.nameKo)+' · 여행 데이트 2곳</span><h3>'+esc(course.title)+'</h3><p class="plan-reason">'+esc(course.reason)+'</p><ol class="travel-stops">'+stops.map((p,i)=>'<li><span class="travel-stop-number">'+(i+1)+'</span><div><h4>'+esc(p.nameKo)+' <small lang="'+(city.countryCode==='JP'?'ja':'zh-CN')+'">'+esc(p.nameLocal)+'</small></h4><p>'+esc(p.reason)+'</p></div></li>').join('')+'</ol><div class="outing-actions"><button type="button" data-travel-map="'+esc(course.id)+'">지도</button><button type="button" data-travel-save="'+esc(course.id)+'" aria-pressed="'+saved.has(course.id)+'">'+(saved.has(course.id)?'♥ 저장됨':'♡ 저장')+'</button>'+(route?link(route,'Google 도보 경로'):'')+'</div><details class="travel-details"><summary>방문 전 확인 · 현지어 주소</summary><p>지삐가 묶은 장소 조합이에요. 실제 방문 인증이나 공식 추천 코스는 아니에요. 지도 점은 입구가 아닌 대표 위치이며, 이동 시간·개방·예약은 방문 전에 확인해 주세요.</p>'+stops.map(p=>'<section><h4>'+esc(p.nameKo)+' · '+esc(p.nameLocal)+'</h4><p class="travel-address" lang="'+(city.countryCode==='JP'?'ja':'zh-CN')+'">'+esc(p.address)+'</p><p>'+esc(p.visitNote)+'</p><p class="place-checked">'+esc(p.positionNote)+'</p><div class="travel-links"><button type="button" data-travel-copy="'+esc(p.id)+'">현지어 이름·주소 복사</button>'+link(p.source.url,'공식 안내')+link(placeUrl(p,city),'Google 장소 검색')+'</div></section>').join('')+'<p class="place-checked">자료 확인 '+esc(data.checkedAt)+' · 대표 좌표 '+link('https://www.wikidata.org/wiki/Wikidata:Licensing','Wikidata CC0')+'</p></details>'+(city.countryCode==='CN'?'<p class="travel-caution">중국에서는 외부 지도 접속이 제한될 수 있어요. 현지어 이름·주소를 복사해 현지 지도에서 확인하세요.</p>':'')+'</li>';
  }
  window.JippiTravel=Object.freeze({KEY,esc,validate,readSaved,writeSaved,placeUrl,routeUrl,card});
})();

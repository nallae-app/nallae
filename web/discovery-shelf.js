// 공개 지역 자료의 두 장소를 보여 주는 첫 화면 선반. 위치·저장·이벤트 상태를 변경하지 않는다.
(() => {
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text=value=>typeof value==='string'&&value.trim().length>0&&value.length<=600;
  const https=value=>text(value)&&/^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::443)?(?:[/?#][^\s<>"'\\]*)?$/i.test(value);
  const point=x=>Number.isFinite(x?.lat)&&Number.isFinite(x?.lon)&&x.lat>=33&&x.lat<=39&&x.lon>=124&&x.lon<=132;
  const distance=(a,b)=>{
    const rad=n=>n*Math.PI/180,lat=rad(b.lat-a.lat),lon=rad(b.lon-a.lon);
    const h=Math.sin(lat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(lon/2)**2;
    return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
  };
  const planId=stops=>'v2:'+JSON.stringify(stops.map(x=>x.id));
  const validCover=c=>c&&/^images\/courses\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.(?:webp|png|jpe?g)$/.test(c.src)&&[c.alt,c.author,c.publisher].every(text)&&Number.isInteger(c.year)&&c.year>=1900&&c.year<=2100&&https(c.sourceUrl)&&https(c.licenseUrl);
  function validate(catalog) {
    if(catalog?.version!==1||!Array.isArray(catalog.items)||!catalog.items.length||catalog.items.length>6)return null;
    const ids=new Set();
    for(const p of catalog.items){
      if(!p||p.sourceType!=='editorial-pair'||![p.city,p.title,p.reason].every(text)||!Array.isArray(p.stops)||p.stops.length!==2)return null;
      if(p.stops.some(x=>!x||![x.id,x.name,x.address,x.district,x.sgg,x.kind,x.source,x.referenceDate].every(text)||!https(x.sourceUrl)||!point(x)||!['park','attraction'].includes(x.type)))return null;
      if(p.cover!==undefined&&!validCover(p.cover))return null;
      if(p.stops[0].id===p.stops[1].id||p.stops[0].sgg!==p.stops[1].sgg||p.id!==planId(p.stops)||ids.has(p.id))return null;
      const meters=distance(...p.stops);
      if(meters<100||meters>2000||!Number.isInteger(p.meters)||Math.abs(p.meters-meters)>1||!Array.isArray(p.legMeters)||p.legMeters.length!==1||p.legMeters[0]!==p.meters||p.withFood!==false)return null;
      ids.add(p.id);
    }
    return catalog;
  }
  const isSaved=(saved,id)=>Array.isArray(saved)?saved.some(x=>(typeof x==='string'?x:x?.id)===id):typeof saved?.has==='function'?saved.has(id):false;
  // 국소 등거리 근사: 두 축에 동일한 축척을 사용한다. 도로·배경지도·이동 경로를 만들지 않는다.
  function preview(stops){
    const [a,b]=stops,mid=(a.lat+b.lat)/2*Math.PI/180;
    const dx=(b.lon-a.lon)*Math.cos(mid),dy=b.lat-a.lat;
    const scale=Math.min(252/Math.max(Math.abs(dx),.000001),56/Math.max(Math.abs(dy),.000001));
    const coords=[[-dx/2,-dy/2],[dx/2,dy/2]].map(([x,y])=>[+(180+x*scale).toFixed(2),+(67-y*scale).toFixed(2)]);
    return '<svg class="discover-preview-svg" viewBox="0 0 360 134" role="img" aria-label="'+escape(stops.map(x=>x.name).join('과 '))+'의 두 좌표 위치. 북쪽이 위이며 점선은 실제 길이 아닙니다."><path class="discover-preview-line" d="M'+coords[0].join(' ')+' L'+coords[1].join(' ')+'"/>'+coords.map(([x,y],i)=>'<g transform="translate('+x+' '+y+')"><circle class="discover-preview-halo" r="22"/><circle class="discover-preview-dot" r="15"/><text class="discover-preview-number" text-anchor="middle" dy="5">'+(i+1)+'</text></g>').join('')+'</svg><span class="discover-preview-north" aria-hidden="true">북쪽 ↑</span><span class="discover-preview-note">두 지점의 직선 연결 · 실제 길 아님</span>';
  }
  function render({catalog,activeIndex=0,saved}={}) {
    if(!validate(catalog))return '';
    const count=catalog.items.length,index=Number.isInteger(activeIndex)&&activeIndex>=0&&activeIndex<count?activeIndex:0;
    const p=catalog.items[index],on=isSaved(saved,p.id),meters=p.meters>=1000?(p.meters/1000).toFixed(1)+'km':p.meters+'m';
    const cover=p.cover?'<img class="discover-cover-photo" src="'+escape(p.cover.src)+'" alt="'+escape(p.cover.alt)+'" width="900" height="600" decoding="async"><button type="button" class="discover-photo-source" data-discover-photo-source="'+index+'" aria-label="사진 출처와 이용 조건 보기">사진: '+escape(p.cover.publisher)+' · '+escape(p.cover.author)+' <span aria-hidden="true">ⓘ</span></button>':preview(p.stops);
    const stops=p.stops.map((x,i)=>'<span class="discover-stop"><span class="discover-stop-number" aria-hidden="true">'+(i+1)+'</span>'+escape(x.name)+'</span>').join('<span class="discover-stop-arrow" aria-hidden="true">→</span>');
    return '<section class="discover-welcome" aria-label="다른 동네 코스 둘러보기"><div class="discover-toolbar"><button type="button" class="discover-city-picker" data-discover-city-picker="'+index+'" aria-label="둘러볼 동네 선택, 현재 '+escape(p.stops[0].district)+'">'+'둘러보기 · '+escape(p.stops[0].district)+' <span aria-hidden="true">⌄</span></button><button type="button" class="discover-local" data-outing-choose>내 동네 찾기 <span aria-hidden="true">›</span></button></div><article class="discover-card" aria-labelledby="discover-title"><div class="discover-cover'+(p.cover?'':' discover-cover-points')+'">'+cover+'</div><div class="discover-body"><div class="discover-heading"><h3 class="discover-title" id="discover-title">'+escape(p.title)+'</h3><span class="discover-distance">직선 '+meters+'</span></div><p class="discover-reason">'+escape(p.reason)+'</p><p class="discover-stops">'+stops+'</p><div class="discover-actions"><button type="button" class="discover-open" data-discover-open="'+index+'">코스 보기 <span aria-hidden="true">›</span></button><button type="button" class="discover-save" data-discover-save="'+index+'" aria-pressed="'+on+'" aria-label="'+escape(p.title)+' '+(on?'저장 해제':'저장')+'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h12v17l-6-4-6 4z"/></svg><span>'+(on?'저장됨':'저장')+'</span></button></div></div></article></section>';
  }
  globalThis.JippiDiscoveryShelf=Object.freeze({validate,render});
})();

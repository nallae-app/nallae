// 공개 지역 자료의 두 장소를 보여 주는 첫 화면 선반. 위치·저장·이벤트 상태를 변경하지 않는다.
(() => {
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text=value=>typeof value==='string'&&value.trim().length>0&&value.length<=600;
  const point=x=>Number.isFinite(x?.lat)&&Number.isFinite(x?.lon)&&x.lat>=33&&x.lat<=39&&x.lon>=124&&x.lon<=132;
  const distance=(a,b)=>{
    const rad=n=>n*Math.PI/180,lat=rad(b.lat-a.lat),lon=rad(b.lon-a.lon);
    const h=Math.sin(lat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(lon/2)**2;
    return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
  };
  const planId=stops=>'v2:'+JSON.stringify(stops.map(x=>x.id));
  function validate(catalog) {
    if(catalog?.version!==1||!Array.isArray(catalog.items)||!catalog.items.length||catalog.items.length>6)return null;
    const ids=new Set();
    for(const p of catalog.items){
      if(!p||p.sourceType!=='editorial-pair'||![p.city,p.title,p.reason].every(text)||!Array.isArray(p.stops)||p.stops.length!==2)return null;
      if(p.stops.some(x=>!x||![x.id,x.name,x.address,x.district,x.sgg,x.kind,x.source,x.referenceDate,x.sourceUrl].every(text)||!point(x)||!['park','attraction'].includes(x.type)))return null;
      if(p.stops[0].id===p.stops[1].id||p.stops[0].sgg!==p.stops[1].sgg||p.id!==planId(p.stops)||ids.has(p.id))return null;
      const meters=distance(...p.stops);
      if(meters<100||meters>2000||!Number.isInteger(p.meters)||Math.abs(p.meters-meters)>1||!Array.isArray(p.legMeters)||p.legMeters.length!==1||p.legMeters[0]!==p.meters||p.withFood!==false)return null;
      ids.add(p.id);
    }
    return catalog;
  }
  const isSaved=(saved,id)=>Array.isArray(saved)?saved.some(x=>(typeof x==='string'?x:x?.id)===id):typeof saved?.has==='function'?saved.has(id):false;
  function render({catalog,activeIndex=0,saved}={}) {
    if(!validate(catalog))return '';
    const count=catalog.items.length,index=Number.isInteger(activeIndex)&&activeIndex>=0&&activeIndex<count?activeIndex:0;
    const p=catalog.items[index],on=isSaved(saved,p.id),meters=p.meters>=1000?(p.meters/1000).toFixed(1)+'km':p.meters+'m';
    const tabs=catalog.items.map((x,i)=>'<button type="button" class="discover-city-tab" role="tab" id="discover-tab-'+i+'" aria-controls="discover-panel" aria-selected="'+(i===index)+'" tabindex="'+(i===index?'0':'-1')+'" data-discover-index="'+i+'">'+escape(x.city)+'</button>').join('');
    const stops=p.stops.map(x=>'<li><span class="discover-stop-kind">'+escape(x.kind)+'</span><strong class="discover-stop-name">'+escape(x.name)+'</strong></li>').join('');
    return '<section class="discover-welcome" aria-label="다른 동네 코스 둘러보기"><div class="discover-heading"><p class="discover-eyebrow">'+escape(p.stops[0].district)+' · 거리로 묶은 두 곳</p><span class="discover-count">'+(index+1)+' / '+count+'</span></div><div class="discover-city-tabs" role="tablist" aria-label="둘러볼 도시">'+tabs+'</div><div class="discover-track"><article class="discover-card" id="discover-panel" role="tabpanel" aria-labelledby="discover-tab-'+index+'"><h3 class="discover-title">'+escape(p.title)+'</h3><ol class="discover-stops">'+stops+'</ol><p class="discover-reason">'+escape(p.reason)+'</p><p class="discover-distance">두 곳 사이 직선 약 '+meters+' · 실제 길은 달라요</p><div class="discover-actions"><button type="button" class="discover-open" data-discover-open="'+index+'">코스 보기</button><button type="button" class="discover-save" data-discover-save="'+index+'" aria-pressed="'+on+'">'+(on?'저장됨':'저장')+'</button></div></article></div><div class="discover-bottom"><button type="button" class="discover-local" data-outing-choose>내 동네에서 찾아보기 <span aria-hidden="true">›</span></button></div></section>';
  }
  globalThis.JippiDiscoveryShelf=Object.freeze({validate,render});
})();

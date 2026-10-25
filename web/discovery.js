// 좌표가 있는 실제 장소만 조합한다. 거리=직선거리, 경로·영업·추천 평점은 추정하지 않는다.
(() => {
  const point=x=>Number.isFinite(x?.lat)&&Number.isFinite(x?.lon)&&x.lat>=33&&x.lat<=39&&x.lon>=124&&x.lon<=132;
  const distance=(a,b)=>NallaeLocalScope.distance([a.lat,a.lon],[b.lat,b.lon]);
  const routePoint=x=>encodeURIComponent(String(x.name||'장소').replace(/,/g,' '))+','+x.lat+','+x.lon;
  const route=(stops,travel='walk')=>{
    const valid=stops.filter(point);if(!valid.length||valid.length!==stops.length)return null;
    if(!['walk','car','traffic','bicycle'].includes(travel))travel='walk';
    return valid.length===1?'https://map.kakao.com/link/to/'+routePoint(valid[0]):'https://map.kakao.com/link/by/'+travel+'/'+valid.map(routePoint).join('/');
  };
  const eligible=x=>x.type!=='park'||/근린|수변|문화|역사|체육|도시자연/.test(x.kind||'');
  const hash=s=>{let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
  const planId=stops=>stops.map(x=>x.id).sort().join('|');
  function pairing(a,b) {
    const food=[a,b].find(x=>x.type==='restaurant'),park=[a,b].find(x=>x.type==='park');
    if(food)return {priority:0,reason:'소개된 식당 + '+(park?.kind||'관광지')};
    if(park&&a.type!==b.type)return {priority:1,reason:'관광지 + '+(park.kind||'공원')};
    if(a.type==='park'&&b.type==='park')return {priority:a.kind===b.kind?3:2,reason:'가까운 공원 두 곳'};
    return {priority:2,reason:'서로 다른 관광지 두 곳'};
  }
  function plans(spots,foods,{origin,seed='',maxDistance=2000,originRadius=30000,limit=6}={}) {
    const originDistances=new WeakMap();
    const fromOrigin=x=>{if(!origin)return 0;if(!originDistances.has(x))originDistances.set(x,NallaeLocalScope.distance(origin,[x.lat,x.lon]));return originDistances.get(x);};
    const inRange=x=>point(x)&&fromOrigin(x)<=originRadius;
    const anchors=[...new Map(spots.filter(x=>inRange(x)&&eligible(x)).map(x=>[x.id,x])).values()];
    const food=foods.filter(inRange).map(x=>({...x,type:'restaurant'})),pairs=new Map(),grid=new Map(),cell=maxDistance/80000;
    // 한국 위도 범위에서 각 셀의 남북·동서 폭이 최대 짝 거리보다 크므로 인접 9칸이면 충분하다.
    for(const y of [...food,...anchors]){const k=Math.floor(y.lat/cell)+','+Math.floor(y.lon/cell);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(y);}
    for(const x of anchors){const row=Math.floor(x.lat/cell),col=Math.floor(x.lon/cell),nearby=[];for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)nearby.push(...(grid.get((row+a)+','+(col+b))||[]));for(const y of nearby) {
      if(!x.id||!y.id||x.id===y.id||x.name===y.name)continue;
      const meters=distance(x,y);if(meters<100||meters>maxDistance)continue;
      const id=planId([x,y]);if(pairs.has(id))continue;
      const stops=y.type==='restaurant'?[y,x]:[x,y],match=pairing(...stops);
      pairs.set(id,{id,stops,meters:Math.round(meters),withFood:match.priority===0,reason:match.reason,priority:match.priority,bucket:Math.floor(Math.max(fromOrigin(x),fromOrigin(y))/2500),h:hash(seed+'|'+id),approachMeters:origin?Math.round(fromOrigin(stops[0])):null});
    }}
    const ranked=[...pairs.values()].sort((a,b)=>a.bucket-b.bucket||a.priority-b.priority||a.h-b.h||a.meters-b.meters||a.id.localeCompare(b.id));
    const used=new Set(),out=[];
    for(const p of ranked){if(p.stops.some(x=>used.has(x.id)))continue;out.push(p);p.stops.forEach(x=>used.add(x.id));if(out.length>=limit)break;}
    return out;
  }
  // 공개 장소만 저장하며 사용자의 출발 좌표는 포함하지 않는다.
  function snapshotPlan(plan,createdAt=new Date().toISOString()) {
    if(!Array.isArray(plan?.stops)||plan.stops.length!==2||plan.stops.some(x=>!x||typeof x!=='object'))return null;
    const stops=plan.stops.map(x=>({id:x.id,name:x.name,address:x.address,district:x.district,sgg:x.sgg,lat:x.lat,lon:x.lon,type:x.type,kind:x.kind,source:typeof x.source==='string'?x.source:x.source?.name||'소개된 식당',sourceUrl:x.sourceUrl||x.source?.url,referenceDate:x.referenceDate||x.sourceDate||x.checkedAt}));
    if(stops.some(x=>!x.id||typeof x.id!=='string'||typeof x.name!=='string'||!x.name||!point(x))||stops[0].id===stops[1].id)return null;
    const meters=distance(...stops);if(meters<100||meters>2000)return null;
    const match=pairing(...stops);
    return {id:planId(stops),stops,meters:Math.round(meters),withFood:match.priority===0,reason:match.reason,createdAt:typeof createdAt==='string'&&Number.isFinite(Date.parse(createdAt))?createdAt:new Date().toISOString()};
  }
  globalThis.NallaeDiscovery=Object.freeze({point,distance,route,plans,eligible,planId,snapshotPlan});
})();

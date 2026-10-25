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
  const planId=stops=>'v2:'+JSON.stringify(stops.map(x=>x.id));
  const placeSetId=stops=>JSON.stringify(stops.map(x=>x.id).sort());
  const placeKind=x=>x.type==='park'?'park:'+(x.kind||'공원'):x.type==='restaurant'?'restaurant':'attraction:'+(x.kind||'관광지');
  const placeLabel=x=>x.type==='restaurant'?'소개된 식당':x.type==='park'?(x.kind||'공원'):(x.kind||'관광지');
  function pairing(a,b) {
    const food=[a,b].find(x=>x.type==='restaurant'),park=[a,b].find(x=>x.type==='park');
    if(food)return {priority:0,reason:'소개된 식당 + '+(park?.kind||'관광지')};
    if(park&&a.type!==b.type)return {priority:1,reason:'관광지 + '+(park.kind||'공원')};
    if(a.type==='park'&&b.type==='park')return {priority:a.kind===b.kind?3:2,reason:'가까운 공원 두 곳'};
    return {priority:2,reason:'서로 다른 관광지 두 곳'};
  }
  function plans(spots,foods,{origin,seed='',maxDistance=2000,originRadius=30000,limit=6,stopCount=2}={}) {
    limit=Math.max(0,Math.min(6,Math.floor(limit)));
    if(!limit||![2,3].includes(stopCount)||!Number.isFinite(maxDistance)||maxDistance<100)return [];
    maxDistance=Math.min(2000,maxDistance);
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
      const pairKey=placeSetId([x,y]);if(pairs.has(pairKey))continue;
      const stops=y.type==='restaurant'?[y,x]:[x,y].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0),match=pairing(...stops);
      const id=planId(stops);
      pairs.set(pairKey,{id,stops,meters:Math.round(meters),legMeters:[Math.round(meters)],rawMeters:meters,withFood:match.priority===0,reason:match.reason,priority:match.priority,bucket:Math.floor(Math.max(fromOrigin(x),fromOrigin(y))/2500),h:hash(seed+'|'+pairKey),approachMeters:origin?Math.round(fromOrigin(stops[0])):null});
    }}
    let candidates=[...pairs.values()];
    if(stopCount===3) {
      // 각 꼭짓점의 두 실제 이웃으로 순서가 있는 세 장소 동선을 만든다.
      const links=new Map(),nodes=new Map(),triples=new Map();
      for(const p of candidates)for(let i=0;i<2;i++){
        const a=p.stops[i],b=p.stops[1-i];nodes.set(a.id,a);
        if(!links.has(a.id))links.set(a.id,[]);links.get(a.id).push({place:b,meters:p.rawMeters});
      }
      for(const [id,near] of links){const middle=nodes.get(id),kinds=new Map();
        for(const edge of near){const key=placeKind(edge.place);if(key===placeKind(middle))continue;if(!kinds.has(key))kinds.set(key,[]);kinds.get(key).push(edge);}
        const groups=[...kinds.values()];
        for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++){
          if(middle.type==='park'&&groups[i][0].place.type==='park'&&groups[j][0].place.type==='park')continue;
          for(const left of groups[i])for(const right of groups[j]){let stops=[left.place,middle,right.place];
          if(new Set(stops.map(x=>x.id)).size!==3||new Set(stops.map(x=>x.name)).size!==3)continue;
          const total=left.meters+right.meters;if(total>3000)continue;
          // 식당이 끝점이면 먼저, 그 밖에는 ID로 방향을 고정해 출발점이 바뀌어도 같은 코스를 유지한다.
          if(stops[2].type==='restaurant'||(stops[0].type!=='restaurant'&&stops[2].id<stops[0].id))stops=stops.slice().reverse();
          const legMeters=stops[0]===left.place?[left.meters,right.meters]:[right.meters,left.meters];
          const key=placeSetId(stops),courseId=planId(stops),withFood=stops.some(x=>x.type==='restaurant');
          const p={id:courseId,stops,meters:Math.round(total),legMeters:legMeters.map(Math.round),rawMeters:total,withFood,reason:stops.map(placeLabel).join(' + '),priority:withFood?0:stops.some(x=>x.type==='park')?1:2,bucket:Math.floor(Math.max(...stops.map(fromOrigin))/2500),h:hash(seed+'|'+key),approachMeters:origin?Math.round(fromOrigin(stops[0])):null};
          const previous=triples.get(key);
          if(!previous||total<previous.rawMeters||(total===previous.rawMeters&&p.id<previous.id))triples.set(key,p);
          }
        }
      }
      candidates=[...triples.values()];
    }
    const ranked=candidates.sort((a,b)=>a.bucket-b.bucket||a.priority-b.priority||a.h-b.h||a.meters-b.meters||a.id.localeCompare(b.id));
    const used=new Set(),out=[];
    for(const p of ranked){if(p.stops.some(x=>used.has(x.id)))continue;out.push(p);p.stops.forEach(x=>used.add(x.id));if(out.length>=limit)break;}
    return out;
  }
  // 공개 장소만 저장하며 사용자의 출발 좌표는 포함하지 않는다.
  function snapshotPlan(plan,createdAt=plan?.createdAt||new Date().toISOString()) {
    if(!Array.isArray(plan?.stops)||plan.stops.length<2||plan.stops.length>4||plan.stops.some(x=>!x||typeof x!=='object'))return null;
    const text=x=>typeof x==='string'?x:undefined;
    let stops=plan.stops.map(x=>({id:text(x.id),name:text(x.name),address:text(x.address),district:text(x.district),sgg:text(x.sgg),lat:x.lat,lon:x.lon,type:text(x.type),kind:text(x.kind),source:text(typeof x.source==='string'?x.source:x.source?.name||x.source?.channel)||'장소 자료',sourceUrl:text(x.sourceUrl||x.source?.url),referenceDate:text(x.referenceDate||x.sourceDate||x.checkedAt)}));
    if(stops.some(x=>!x.id||!x.name||!point(x))||new Set(stops.map(x=>x.id)).size!==stops.length)return null;
    // v69의 두 곳 자동 저장에는 순서 있는 후기가 없었다. 최초 이전 때만 고정 방향으로 맞춘다.
    if(stops.length===2&&plan.sourceType!=='community'&&typeof plan.id==='string'&&!plan.id.startsWith('v2:'))stops=stops[1].type==='restaurant'?stops.slice().reverse():stops[0].type==='restaurant'?stops:stops.slice().sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
    const legs=stops.slice(1).map((x,i)=>distance(stops[i],x)),total=legs.reduce((a,b)=>a+b,0);
    if(legs.some(x=>x<100||x>2000)||total>4000)return null;
    const match=stops.length===2?pairing(...stops):{reason:stops.map(placeLabel).join(' + ')};
    const saved={id:planId(stops),stops,meters:Math.round(total),legMeters:legs.map(Math.round),withFood:stops.some(x=>x.type==='restaurant'),reason:match.reason,createdAt:typeof createdAt==='string'&&Number.isFinite(Date.parse(createdAt))?createdAt:new Date().toISOString()};
    if(plan.sourceType==='community'){
      saved.sourceType='community';if(typeof plan.reason==='string'&&plan.reason.trim()&&plan.reason.length<=600)saved.reason=plan.reason.trim();
      const d=plan.communityDetails;if(d&&typeof d==='object'&&['none','owner','compensated'].includes(d.relationship)&&/^\d{4}-(0[1-9]|1[0-2])$/.test(d.recentVisit)&&typeof d.reason==='string'&&d.reason.trim()&&d.reason.length<=600&&typeof d.caution==='string'&&d.caution.length<=600)saved.communityDetails={reason:d.reason,recentVisit:d.recentVisit,caution:d.caution,relationship:d.relationship};
    }
    if(plan.sourceType==='community'&&typeof plan.communityId==='string'&&plan.communityId.trim())saved.communityId=plan.communityId;
    return saved;
  }
  globalThis.NallaeDiscovery=Object.freeze({point,distance,route,plans,eligible,planId,snapshotPlan});
})();

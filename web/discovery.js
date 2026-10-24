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
  function plans(spots,foods,{origin,seed='',maxDistance=2000,limit=6}={}) {
    const anchors=spots.filter(x=>point(x)&&eligible(x));
    const food=foods.filter(point),used=new Set(),out=[];
    const ranked=anchors.map(x=>({x,h:hash(seed+'|'+x.id),d:origin?NallaeLocalScope.distance(origin,[x.lat,x.lon]):0})).filter(x=>!origin||x.d<=30000)
      .sort((a,b)=>origin?Math.floor(a.d/5000)-Math.floor(b.d/5000)||a.h-b.h:a.h-b.h);
    for(const {x} of ranked) {
      if(used.has(x.id))continue;
      const candidates=[...food,...anchors].filter(y=>y.id!==x.id&&!used.has(y.id)&&y.name!==x.name).map(y=>({y,d:distance(x,y)}))
        .filter(p=>p.d>=100&&p.d<=maxDistance).sort((a,b)=>Number(!food.includes(a.y))-Number(!food.includes(b.y))||a.d-b.d);
      const pair=candidates[0];if(!pair)continue;
      const stops=food.includes(pair.y)?[pair.y,x]:[x,pair.y];
      out.push({id:stops.map(x=>x.id).join('|'),stops,meters:Math.round(pair.d),withFood:food.includes(pair.y)});
      stops.forEach(p=>used.add(p.id));if(out.length>=limit)break;
    }
    return out;
  }
  globalThis.NallaeDiscovery=Object.freeze({point,distance,route,plans,eligible});
})();

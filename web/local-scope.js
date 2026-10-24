// 지도와 시험에서 공유하는 지역 범위 규칙. 위치는 기기 안에서만 사용한다.
(() => {
  'use strict';
  const NEARBY_METERS = 30000;
  const distance = (a,b) => {
    const rad=n=>n*Math.PI/180;
    const dlat=rad(b[0]-a[0]), dlon=rad(b[1]-a[1]);
    const h=Math.sin(dlat/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(dlon/2)**2;
    return 6371000*2*Math.asin(Math.sqrt(Math.min(1,h)));
  };
  const regionCodes = (center,neighbors,origin=center.center) => new Set([center.code,...neighbors.filter(m=>distance(origin,m.center)<=NEARBY_METERS).map(m=>m.code)]);
  const relevantRegions = (item,codes,regions) => {
    const exact=new Set(item.sgg||[]), wide=new Set(item.src==='eqk'?[]:item.sido||[]);
    return regions.filter(m=>codes.has(m.code)&&(exact.has(m.code)||wide.has(m.sido)));
  };
  const weekend = (date=new Date()) => {
    const day=new Date(date.getTime()+9*3600000).toISOString().slice(0,10);
    const now=Date.parse(day+'T00:00:00+09:00')/86400000;
    const weekday=new Date(day+'T00:00:00Z').getUTCDay();
    const saturday=now+(weekday===0?-1:6-weekday);
    return {start:Math.max(now,saturday),end:saturday+1};
  };
  globalThis.NallaeLocalScope=Object.freeze({NEARBY_METERS,distance,regionCodes,relevantRegions,weekend});
})();

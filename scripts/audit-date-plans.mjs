// 노원 공개 고정 지점에서 자료·조합 규칙만 점검한다. 실제 도보·방문 품질 검증이 아니다.
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import * as topojson from 'topojson-client';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const topo=read('web/data/regions.json'),geometries=topo.objects.sgg.geometries;
const idx=geometries.findIndex(x=>x.properties.code==='11350');
const codes=[idx,...topojson.neighbors(geometries)[idx]].map(i=>geometries[i].properties.code);
const origin=[37.654,127.056],radius=5000;
const context=code=>{const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync('web/local-scope.js','utf8'),ctx);vm.runInContext(code,ctx);return ctx;};
const before=context(execFileSync('git',['show','483a471:web/discovery.js'],{encoding:'utf8'}));
const after=context(fs.readFileSync('web/discovery.js','utf8'));
const distance=x=>after.NallaeLocalScope.distance(origin,[x.lat,x.lon]);
const spots=codes.flatMap(c=>read('web/data/outings/'+c+'.json').items).filter(x=>distance(x)<=radius);
const places=[...read('web/data/places.json').items,...read('web/data/heritage-restaurants.json').items];
const locations=read('web/data/place-locations.json').items;
const foods=places.map(x=>({...x,...locations[x.id],type:'restaurant'})).filter(x=>after.NallaeDiscovery.point(x)&&distance(x)<=radius);
const category=p=>p.withFood?'식당+장소':p.stops.some(x=>x.type==='attraction')&&p.stops.some(x=>x.type==='park')?'관광지+공원':p.stops.every(x=>x.type==='park')?'공원+공원':'관광지+관광지';
function sample(ctx) {
  const unique=new Map();let durationMs=0;
  for(let i=0;i<100&&unique.size<30;i++){
    const start=performance.now();const ps=ctx.NallaeDiscovery.plans(spots,foods,{origin,originRadius:radius,seed:'2026-10-25|'+i,limit:3});durationMs+=performance.now()-start;
    for(const p of ps){if(unique.size>=30)break;const id=Array.from(p.stops,x=>x.id).sort().join('|');unique.set(id,{id,category:category(p),meters:p.meters,stops:Array.from(p.stops,x=>({id:x.id,name:x.name,type:x.type,kind:x.kind,lat:x.lat,lon:x.lon,address:x.address,fromOriginMeters:Math.round(distance(x)),source:x.source,referenceDate:x.referenceDate||x.sourceDate||x.checkedAt||null})),routeReviewed:false,visitQualityReviewed:false});}
  }
  const rows=[...unique.values()],counts={};for(const x of rows)counts[x.category]=(counts[x.category]||0)+1;
  return {unique:rows.length,counts,algorithmMs:Math.round(durationMs),rows};
}
const result={scope:'노원 공개 고정 지점 및 인접 행정구역 수록 장소 중 직선 5km',sameInputs:true,spots:spots.length,foods:foods.length,before:sample(before),after:sample(after),limitations:['자료·좌표·범위 규칙의 점검이며 데이트 만족도 개선을 입증하지 않음','실제 보행 경로·영업·개방·요금·현장 품질 미확인']};
const invalid=result.after.rows.some(p=>p.meters<100||p.meters>2000||p.stops.some(x=>x.fromOriginMeters>radius));
if(invalid)throw Error('코스 범위 검증 실패');
fs.mkdirSync('output',{recursive:true});fs.writeFileSync('output/date-plan-audit.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({scope:result.scope,sameInputs:true,spots:result.spots,foods:result.foods,before:{unique:result.before.unique,counts:result.before.counts,algorithmMs:result.before.algorithmMs},after:{unique:result.after.unique,counts:result.after.counts,algorithmMs:result.after.algorithmMs},actualWalkingAndVisitQualityVerified:false}));

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {outingItems} from '../build-outings.mjs';
import {downloadStandard} from '../lib/standard-download.mjs';
const ctx={Set,Map,Math,Number,String,Object};vm.createContext(ctx);
for(const name of ['local-scope','discovery'])vm.runInContext(fs.readFileSync(new URL('../../web/'+name+'.js',import.meta.url),'utf8'),ctx);
const {plans,route}=ctx.NallaeDiscovery;
const a={id:'a',name:'가 공원',type:'park',kind:'근린공원',lat:37.65,lon:127.06},b={...a,id:'b',name:'나 공원',lat:37.655},c={...a,id:'c',name:'어린이공원',kind:'어린이공원',lat:37.653},food={...a,id:'food',name:'식당',type:'restaurant',lat:37.651};
test('나들이 조합: 실제 좌표·100m~2km, 식당 우선, 장소 중복·먼 지역·어린이공원 제외',()=>{
  const xs=plans([a,b,c,{...a,id:'far',lat:36.3}], [food], {origin:[37.65,127.06],seed:'today'});
  assert.equal(xs.length,1);assert.equal(xs[0].stops[0].id,'food');assert.equal(xs[0].withFood,true);assert.ok(xs[0].meters>=100&&xs[0].meters<=2000);
  assert.equal(plans([a],[{...food,lat:36.3}],{}).length,0);
  assert.equal(plans([{...a,lat:null},c],[food],{}).length,0);
});
test('길찾기: 공식 이동수단 URL, 좌표 없는 곳 거부, 이름 URL 인코딩',()=>{
  const url=route([a,{...b,name:'식당/이름,<script>'}],'car');
  assert.match(url,/^https:\/\/map\.kakao\.com\/link\/by\/car\//);assert.ok(!url.includes('<script>'));
  assert.match(route([a],'walk'),/\/link\/to\//);assert.equal(route([a,{...b,lat:0}]),null);
  assert.match(route([a,b],'invalid'),/\/by\/walk\//);
});
test('코스 두 장소 모두 출발점 반경 검사: 짝 식당만 반경 밖인 조합 제외',()=>{
  const origin=[37.65,127.06],near={...a,lat:37.674},other={...b,lat:37.675},outside={...food,lat:37.680};
  const xs=plans([near,other],[outside],{origin,originRadius:3000,limit:3});
  assert.equal(xs.length,1);assert.equal(xs[0].withFood,false);
  assert.ok(xs[0].stops.every(x=>ctx.NallaeLocalScope.distance(origin,[x.lat,x.lon])<=3000));
});
test('같은 거리 구간에서는 식당·장소 조합 우선, 같은 시드 재현과 세 코스의 장소 중복 방지',()=>{
  const spots=Array.from({length:8},(_,i)=>({...a,id:'p'+i,name:'공원'+i,lat:37.65+i*.0015,kind:i%2?'체육공원':'근린공원'}));
  const opts={origin:[37.65,127.06],originRadius:5000,seed:'2026-10-25',limit:3};
  const xs=plans(spots,[food],opts);assert.equal(xs.length,3);assert.equal(xs[0].withFood,true);
  assert.equal(new Set(xs.flatMap(x=>x.stops.map(y=>y.id))).size,6);
  assert.deepEqual(xs.map(x=>x.id),plans(spots,[food],opts).map(x=>x.id));
  assert.ok(xs.every(x=>!x.reason.includes('무료')&&!x.reason.includes('영업')));
});
test('코스 저장은 순서·자료 근거 보존, 뒤집힌 같은 조합 ID 통일, 출발 좌표 저장 금지',()=>{
  const original={...plans([a,b],[food],{seed:'today'})[0],origin:[37.65,127.06],approachMeters:300};
  const snapshot=ctx.NallaeDiscovery.snapshotPlan(original,'2026-10-25T00:00:00Z');
  const loaded=ctx.NallaeDiscovery.snapshotPlan(JSON.parse(JSON.stringify(snapshot)),snapshot.createdAt);
  assert.equal(loaded.id,snapshot.id);assert.deepEqual(Array.from(loaded.stops,x=>x.id),Array.from(snapshot.stops,x=>x.id));
  assert.equal(ctx.NallaeDiscovery.planId([...snapshot.stops].reverse()),snapshot.id);
  assert.equal(loaded.origin,undefined);assert.equal(loaded.approachMeters,undefined);
  assert.equal(ctx.NallaeDiscovery.snapshotPlan({stops:[a,{...b,lat:null}]}),null);
  assert.equal(ctx.NallaeDiscovery.snapshotPlan({stops:[a,{...b,lat:36.3}]}),null);
  assert.equal(ctx.NallaeDiscovery.snapshotPlan({stops:[null,b]}),null);
});
test('근처 후보 탐색 최적화가 한국 남부·서울·북부의 구획 경계 조합을 누락하지 않음',()=>{
  for(const [lat,lon] of [[33.025,126.5],[37.65,127.05],[38.975,128]]){
    const x={...a,id:'left',lat:lat-.001,lon:lon-.001},y={...b,id:'right',lat:lat+.001,lon:lon+.001};
    assert.equal(plans([x,y],[],{origin:[lat,lon],originRadius:5000,limit:3}).length,1);
  }
});
test('놀거리 파서: 주소·좌표 불일치와 중복 제외, 공원 사실 정보만',()=>{
  const row={PARK_NM:'시험공원',PARK_SE:'근린공원',RDNMADR:'서울특별시 노원구 동일로 1414',LATITUDE:'37.6542',LONGITUDE:'127.0568',REFERENCE_DATE:'2026-09-01',INSTITUTION_NM:'노원구'};
  const xs=outingItems([row,row,{...row,PARK_NM:'대전 좌표',LATITUDE:'36.3',LONGITUDE:'127.4'},{...row,LATITUDE:''}],'park');
  assert.equal(xs.length,1);assert.equal(xs[0].sgg,'11350');assert.equal(xs[0].referenceDate,'2026-09-01');assert.equal(xs[0].rating,undefined);
});
test('실제 전국 놀거리: 1만8천곳·250개 이상 지역, 지역 파일 건수·좌표·식별번호 일치',()=>{
  const root=new URL('../../web/data/outings/',import.meta.url),index=JSON.parse(fs.readFileSync(new URL('index.json',root),'utf8')),ids=new Set();let total=0;
  assert.ok(index.total>=18000);assert.ok(Object.values(index.counts).filter(Boolean).length>=250);
  for(const [code,count] of Object.entries(index.counts)){
    const d=JSON.parse(fs.readFileSync(new URL(code+'.json',root),'utf8'));assert.equal(d.items.length,count);
    for(const x of d.items){assert.equal(x.sgg,code);assert.equal(ctx.NallaeDiscovery.point(x),true);assert.ok(!ids.has(x.id));ids.add(x.id);assert.ok(x.name&&x.address&&x.sourceUrl);assert.equal(x.description,undefined);}total+=count;
  }
  assert.equal(total,index.total);assert.equal(index.parks+index.attractions,total);
});
test('공식 표준 다운로드: 마지막 페이지 누락·과다 건수로 부분 수집을 완료 처리하지 않음',async()=>{
  const header={fileName:'시험',totalCount:2,columList:[{columCode:'NAME',columNm:'이름'}],tableVO:{colNmList:['NAME'],svcTableNm:'tn_test_svc'}};
  const fetcher=async url=>({ok:true,json:async()=>url.includes('columList')?header:[{NAME:'a'},{NAME:'b'}]});
  assert.equal((await downloadStandard('1',{fetcher})).rows.length,2);
  await assert.rejects(downloadStandard('1',{fetcher:async url=>({ok:true,json:async()=>url.includes('columList')?header:[]})}),/중간 페이지/);
});

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

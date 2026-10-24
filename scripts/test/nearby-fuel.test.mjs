import test from 'node:test';
import assert from 'node:assert/strict';
import {katecToWgs84,wgs84ToKatec} from '../lib/katec.mjs';
import {queryCenters,normalizeRows,createFuelService} from '../../proxy/lib/nearby-fuel.js';
import handler from '../../proxy/api/fuel.js';
const origin={lat:37.654,lon:127.056},product='B027';
const oil=(id,lat,lon,price)=>{const p=wgs84ToKatec(lat,lon);return {UNI_ID:id,OS_NM:id,GIS_X_COOR:p.x,GIS_Y_COOR:p.y,PRICE:price};};
const response=rows=>({ok:true,json:async()=>({RESULT:{OIL:rows}})});
test('KATEC 역·정변환: 서울·부산·제주 왕복 오차 2m 이내',()=>{
  for(const [lat,lon] of [[37.654,127.056],[35.15,129.04],[33.4,126.5]]){const p=wgs84ToKatec(lat,lon),q=katecToWgs84(p.x,p.y);assert.ok(Math.abs(q.lat-lat)<.00002);assert.ok(Math.abs(q.lon-lon)<.00002);}
});
test('5·10·15km 원판을 공식 5km 조회 원들로 덮는다: 중심부터 둘레까지 빈틈 없음',()=>{
  for(const radius of [5000,10000,15000]){
    const centers=queryCenters(origin.lat,origin.lon,radius),p=centers[0];assert.equal(centers.length,radius===5000?1:radius===10000?9:25);
    for(let r=0;r<=radius;r+=500)for(let angle=0;angle<360;angle+=2){const a=angle*Math.PI/180,x=p.x+r*Math.cos(a),y=p.y+r*Math.sin(a);assert.ok(centers.some(c=>Math.hypot(x-c.x,y-c.y)<=5000.001));}
  }
});
test('값이 비싸도 가까우면 유지, 중복·반경 밖·잘못된 값 제외',()=>{
  const xs=normalizeRows([oil('비싼근처',37.655,127.056,2500),oil('싼먼곳',37.67,127.056,1800),oil('비싼근처',37.655,127.056,2500),oil('범위밖',37.8,127.056,1700),{UNI_ID:'오류',PRICE:0}],product,origin,5000,'2026-10-25T00:00:00Z');
  assert.deepEqual(xs.map(x=>x.id),['비싼근처','싼먼곳']);assert.equal(xs[0].price.B027,2500);
});
test('반경 확대는 기존 5km 요청 캐시 재사용, 정렬은 추가 API 요청 없음, 중복 병합',async()=>{
  let calls=0;const cache=new Map(),service=createFuelService({key:'secret',cache,fetcher:async()=>{calls++;return response([oil('비싼근처',37.655,127.056,2500)]);}});
  const input={...origin,radius:5000,product};let r=await service(input);assert.equal(calls,1);assert.equal(r.stations.length,1);
  await service(input);assert.equal(calls,1);r=await service({...input,radius:10000});assert.equal(calls,9);assert.equal(r.stations.length,1);
  assert.ok([...cache.keys()].every(x=>/^[a-f0-9]{64}$/.test(x)));
  const both=await Promise.all([service({...input,radius:15000}),service({...input,radius:15000})]);assert.equal(calls,25);assert.equal(both[0].complete,true);
});
test('일부 원 조회 실패를 전체 완료로 표시하지 않고 응답·키를 노출하지 않음',async()=>{
  const service=createFuelService({key:'secret',fetcher:async()=>{throw Error('https://example.invalid/?key=secret');}});
  await assert.rejects(service({...origin,radius:5000,product}),e=>e.message==='upstream'&&!e.message.includes('secret'));
  const empty=createFuelService({key:'secret',fetcher:async()=>response([])});await assert.rejects(empty({...origin,radius:5000,product}),/empty-response/);
  const zero=createFuelService({key:'secret',fetcher:async url=>response(url.includes('avgAllPrice')?[{PRICE:1800}]:[])});assert.equal((await zero({...origin,radius:5000,product})).stations.length,0);
});
test('서버 호출 예산 초과 시 후속 요청 중단',async()=>{
  let calls=0;const service=createFuelService({key:'secret',maxCalls:1,fetcher:async()=>{calls++;return response([oil('주유소',37.655,127.056,1800)]);}});
  await service({...origin,radius:5000,product});await assert.rejects(service({...origin,radius:10000,product}),/quota/);assert.equal(calls,1);
});
function mockRes(){return {headers:{},code:200,setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(x){this.body=x;return this;},end(){return this;}};}
test('공개 상태 확인에는 키 값이 없고 미등록 서버는 503, 좌표 GET 요청 금지',async()=>{
  const prev=process.env.OPINET_KEY;delete process.env.OPINET_KEY;
  try{let res=mockRes();await handler({method:'GET',query:{health:'1'},headers:{}},res);assert.equal(res.body.configured,false);assert.equal(res.body.key,undefined);
    res=mockRes();await handler({method:'POST',query:{},body:{},headers:{}},res);assert.equal(res.code,503);
    res=mockRes();await handler({method:'GET',query:{lat:37.65},headers:{}},res);assert.equal(res.code,405);
  }finally{if(prev!==undefined)process.env.OPINET_KEY=prev;}
});

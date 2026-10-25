import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app=fs.readFileSync(new URL('../../web/app.js',import.meta.url),'utf8');
function setup(extra={}){
  const ctx={Math,Number,Date,Set,Map,Object,String,DEMO:true,fuelShown:[],fuelLookupAllowed:false,fuelSampleFallback:false,fuelRadius:5000,fuelSort:'distance',selection:{center:{code:'11350',name:'노원구'},origin:[37.65,127.06]},escapeHtml:s=>String(s),escapeAttr:s=>String(s),validDate:d=>Number.isFinite(d?.getTime()),label:()=> '서울 노원구',productName:()=> '휘발유',money:x=>String(x)+'원',...extra};
  vm.createContext(ctx);for(const name of ['local-scope','discovery'])vm.runInContext(fs.readFileSync(new URL('../../web/'+name+'.js',import.meta.url),'utf8'),ctx);
  return ctx;
}
function load(ctx,name){const src=app.match(new RegExp('function '+name+'\\([^]*?\\n}'))?.[0];assert.ok(src);vm.runInContext(src,ctx);}
test('주유소: 기본 5km 안 표본만, 다른 지역 전체 검색 링크 제공',()=>{
  const markers=[];
  const ctx=setup({fuelProduct:'B027',fuelData:{national:{B027:{price:1800,diff:0}},sgg:{'11350':{B027:1800}},date:'2026-10-25',stations:[{id:'near',name:'가까운 주유소',lat:37.651,lon:127.06,price:{B027:1800}},{id:'far',name:'먼 주유소',lat:36.3,lon:127.4,sgg:'11350',price:{B027:1500}}]},exploreTools:{innerHTML:''},feedEl:{innerHTML:''},sourceDisclosure:()=>'',fuelColors:[],stationText:s=>s.name,fuelMarkers:{},L:{divIcon:()=>{},marker:xy=>({bindPopup:()=>({addTo:()=>markers.push(xy)})})}});
  load(ctx,'renderFuel');ctx.renderFuel();assert.equal(markers.length,1);assert.match(ctx.feedEl.innerHTML,/가까운 주유소/);assert.doesNotMatch(ctx.feedEl.innerHTML,/먼 주유소/);assert.match(ctx.feedEl.innerHTML,/주유소 더 찾기/);
});

test('주유소: 5·10·15km 반경을 정렬보다 먼저 적용하고 지도·목록 순서 일치',()=>{
  let markers=[];
  const stations=[['14km',37.78,1500],['16km',37.80,1400],['10km',37.74,1600],['5km',37.70,1700],['near',37.651,1800]].map(([id,lat,p])=>({id,name:id,lat,lon:127.06,price:{B027:p}}));
  const ctx=setup({fuelProduct:'B027',fuelData:{national:{B027:{price:1800,diff:0}},sgg:{},stations},exploreTools:{innerHTML:''},feedEl:{innerHTML:''},sourceDisclosure:()=>'',fuelColors:[],stationText:s=>'['+s.id+']',fuelMarkers:{},L:{divIcon:()=>{},marker:xy=>({bindPopup:()=>({addTo:()=>markers.push(xy)})})}});
  load(ctx,'renderFuel');ctx.renderFuel();assert.equal(markers.length,1);assert.match(ctx.exploreTools.innerHTML,/data-fuel-radius="5000" aria-pressed="true"/);
  ctx.fuelRadius=10000;markers=[];ctx.renderFuel();assert.equal(markers.length,2);assert.ok(ctx.feedEl.innerHTML.indexOf('[near]')<ctx.feedEl.innerHTML.indexOf('[5km]'));
  ctx.fuelRadius=15000;markers=[];ctx.renderFuel();assert.equal(markers.length,4);assert.doesNotMatch(ctx.feedEl.innerHTML,/\[16km\]/);
  ctx.fuelSort='price';markers=[];ctx.renderFuel();assert.equal(markers.length,4);assert.equal(markers[0][0],37.78);assert.ok(ctx.feedEl.innerHTML.indexOf('[14km]')<ctx.feedEl.innerHTML.indexOf('[near]'));
  ctx.fuelRadius=5000;markers=[];ctx.renderFuel();assert.equal(markers.length,1);assert.doesNotMatch(ctx.feedEl.innerHTML,/\[14km\]/);
  ctx.selection=null;markers=[];ctx.renderFuel();assert.equal(markers.length,5);assert.match(ctx.exploreTools.innerHTML,/data-fuel-radius="5000" aria-pressed="true" disabled/);
});

test('주차장: 거리 우선, 무료·빈자리 있어도 먼 곳을 앞으로 올리지 않고 좌표 없는 곳은 뒤로',()=>{
  const items=[{id:'far',name:'먼 무료 주차장',lat:37.70,lon:127.06,fee:'무료'},{id:'unknown',name:'좌표 없는 주차장',fee:'무료'},{id:'near',name:'가까운 유료 주차장',lat:37.651,lon:127.06,fee:'유료'}];
  const ctx=setup({parkingFilter:'',parkingCode:null,parkingShown:[],parkingCache:new Map([['11350',{items}]]),parkingIndex:{counts:{'11350':3}},parkingLive:{items:[]},muniByCode:new Map([['11350',{}]]),exploreTools:{innerHTML:''},feedEl:{innerHTML:''},sourceDisclosure:()=>'',liveFor:x=>x.id==='far'?{free:10}:null,parkingSpace:()=>({free:10}),parkingText:x=>'['+x.id+']',renderParkingMarkers:()=>{}});
  vm.runInContext(app.match(/const parkingDistance=[^\n]+/)[0],ctx);load(ctx,'renderParking');ctx.renderParking();
  assert.deepEqual(Array.from(ctx.parkingShown,x=>x.id),['near','far','unknown']);assert.match(ctx.feedEl.innerHTML,/가까운 순/);
  ctx.parkingFilter='free';ctx.renderParking();assert.deepEqual(Array.from(ctx.parkingShown,x=>x.id),['far','unknown']);
});
test('길찾기: 내 위치가 있어도 자동 전달하지 않고 출발점 선택 후 수단별 링크 생성',()=>{
  const ctx=setup({routeDestination:{name:'공원',lat:37.65,lon:127.06},routeStart:null,routeDialog:{innerHTML:''}});ctx.selection.fromLocation=true;
  load(ctx,'renderRouteDialog');ctx.renderRouteDialog();assert.match(ctx.routeDialog.innerHTML,/내 위치를 출발점으로/);assert.doesNotMatch(ctx.routeDialog.innerHTML,/link\/by/);
  ctx.routeStart={name:'지도에서 고른 출발점',lat:37.64,lon:127.05};ctx.renderRouteDialog();
  for(const travel of ['walk','traffic','car','bicycle'])assert.ok(ctx.routeDialog.innerHTML.includes('/link/by/'+travel+'/'));
});

test('실제 반경 조회를 선택하면 비싼 근처 주유소가 저가 표본과 별개로 표시된다',()=>{
  let markers=[];const stations=[{id:'near-expensive',name:'가까운 비싼 곳',lat:37.651,lon:127.06,price:{B027:2500}},{id:'far-cheap',name:'먼 싼 곳',lat:37.67,lon:127.06,price:{B027:1800}}];
  const ctx=setup({DEMO:false,fuelProduct:'B027',nearbyFuelClient:{peek:()=>({status:'ready',data:{stations,asOf:'2026-10-25T00:00:00Z'}})},fuelData:{national:{},sgg:{},stations:[]},exploreTools:{innerHTML:''},feedEl:{innerHTML:''},sourceDisclosure:()=>'',fuelColors:[],stationText:s=>'['+s.id+']',fuelMarkers:{},L:{divIcon:()=>{},marker:xy=>({bindPopup:()=>({addTo:()=>markers.push(xy)})})}});
  load(ctx,'renderFuel');ctx.renderFuel();assert.equal(ctx.fuelShown.length,2);assert.ok(ctx.feedEl.innerHTML.indexOf('[near-expensive]')<ctx.feedEl.innerHTML.indexOf('[far-cheap]'));assert.match(ctx.feedEl.innerHTML,/가격과 관계없이 조회/);
  ctx.fuelSort='price';markers=[];ctx.renderFuel();assert.ok(ctx.feedEl.innerHTML.indexOf('[far-cheap]')<ctx.feedEl.innerHTML.indexOf('[near-expensive]'));assert.equal(markers.length,2);
  ctx.selection.fromLocation=true;ctx.nearbyFuelClient.peek=()=>{throw Error('동의 전 조회하면 안 됨');};ctx.renderFuel();assert.match(ctx.feedEl.innerHTML,/내 위치로 주유소 조회/);assert.equal(ctx.fuelShown.length,0);
});
test('코스 버튼은 URL 검증기가 아닌 실제 코스 ID로 저장·지도 대상 연결',()=>{
  const stops=[{id:'식당-a',name:'식당',type:'restaurant',lat:37.65,lon:127.06},{id:'park-b',name:'공원',type:'park',kind:'근린공원',lat:37.655,lon:127.06}];
  const ctx=setup({savedPlans:new Map(),selection:null});
  load(ctx,'escapeHtml');load(ctx,'escapeAttr');load(ctx,'outingPlanCard');
  const id=ctx.NallaeDiscovery.planId(stops),html=ctx.outingPlanCard({id,stops,reason:'소개된 식당 + 근린공원',meters:556,withFood:true},0);
  assert.ok(html.includes('data-plan-map="'+id+'"'));assert.ok(html.includes('data-plan-save="'+id+'"'));
  assert.ok(!html.includes('data-plan-save="#"'));assert.match(html,/주소·출처·방문 전 확인/);
  ctx.selection={origin:[35.15,129.04],fromLocation:false};
  const saved=ctx.outingPlanCard({id,stops,reason:'소개된 식당 + 근린공원',meters:556,withFood:true},0,true);
  assert.doesNotMatch(saved,/첫 장소 직선/);assert.match(saved,/저장 당시 장소 정보/);
});
test('같은 조건의 코스 재표시는 계산 재사용, 지역 자료·시드가 바뀌면 재계산',()=>{
  let calls=0;const spot={id:'park',name:'공원',type:'park',lat:37.655,lon:127.06};
  const ctx=setup({outingTheme:'date',outingQuery:'',outingNonce:0,outingRevision:1,outingRadius:5000,outingPlanMemo:new Map(),outingPending:new Set(),outingErrors:new Set(),currentOutings:()=>[spot],allPlaceItems:()=>[],placeLocation:()=>null,koreaDate:()=> '2026-10-25',outingPlanCard:()=>'',renderOutingMarkers:()=>{},feedEl:{innerHTML:''},outingPlans:[],outingShown:[]});
  ctx.selection.codes=new Set(['11350']);ctx.NallaeDiscovery={...ctx.NallaeDiscovery,plans:()=>{calls++;return [];}};
  load(ctx,'renderOutingCards');ctx.renderOutingCards();ctx.renderOutingCards();assert.equal(calls,1);
  ctx.outingRevision++;ctx.renderOutingCards();assert.equal(calls,2);
  ctx.outingNonce++;ctx.renderOutingCards();assert.equal(calls,3);
});

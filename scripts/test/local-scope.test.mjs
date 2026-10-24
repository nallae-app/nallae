import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const scopeCode=fs.readFileSync(new URL('../../web/local-scope.js',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../../web/app.js',import.meta.url),'utf8');
const seoul={code:'11440',sido:'11',short:'서울',name:'마포구',center:[37.555,126.902]};
const neighbor={code:'11410',sido:'11',short:'서울',name:'서대문구',center:[37.58,126.94]};
const daejeon={code:'30110',sido:'30',short:'대전',name:'동구',center:[36.31,127.45]};
const nowon={code:'11350',sido:'11',short:'서울',name:'노원구',center:[37.65,127.06]};
function setup() {
  const regions=[seoul,neighbor,nowon,daejeon], flashes=[],points=[];
  const ctx={Date,Set,Math,munis:regions,muniByCode:new Map(regions.map(m=>[m.code,m])),sidos:new Map([['11',{short:'서울',munis:[seoul,neighbor],center:seoul.center}],['30',{short:'대전',munis:[daejeon],center:daejeon.center}]]),selection:{center:seoul,codes:new Set(['11440','11410']),origin:seoul.center},category:null,mode:'news',onMap:it=>it.onMap!==false&&it.src!=='brief',hasPoint:it=>Number.isFinite(it.lat)&&Number.isFinite(it.lon),label:m=>m.short+' '+m.name,validDate:d=>Number.isFinite(d.getTime()),signalName:()=>'',signalStyle:()=>'',flash:m=>flashes.push(m.code),reducedMotion:{matches:true},map:{},showMapBubble:()=>{},setTimeout:()=>{},L:{latLng:(lat,lon)=>[lat,lon],divIcon:()=>{},marker:at=>({addTo:()=>{points.push(at);return {};}})}};
  vm.createContext(ctx);vm.runInContext(scopeCode,ctx);
  for(const name of ['itemMunis','localItemMunis','displayTitle','placeLabel','nearbySea','visible','pulse']) {
    const code=app.match(new RegExp('function '+name+'\\([^]*?\\n}'))?.[0];assert.ok(code,name+' function missing');vm.runInContext(code,ctx);
  }
  return {ctx,scope:ctx.NallaeLocalScope,flashes,points};
}
test('서울 주변: 인접 지역 유지, 대전은 잘못 인접 입력이어도 30km 밖이라 제외',()=>{
  const {scope}=setup();const codes=scope.regionCodes(seoul,[neighbor,daejeon]);
  assert.deepEqual([...codes],['11440','11410']);assert.ok(scope.distance(seoul.center,daejeon.center)>100000);
});
test('서울 내 주변에 대전 단독 소식·반짝임은 들어오지 않는다',()=>{
  const {ctx,flashes,points}=setup();const item={src:'sms',sgg:['30110'],sido:[],title:'대전 소식'};
  assert.equal(ctx.visible(item),false);ctx.pulse(item,true);assert.equal(flashes.length,0);assert.equal(points.length,0);
  ctx.selection=null;assert.equal(ctx.visible(item),true);
});

test('노원구 주변: 대전 단독 제외, 공동 특보도 제목·라벨·반짝임은 노원구 기준',()=>{
  const {ctx,flashes,scope}=setup();
  ctx.selection={center:nowon,codes:scope.regionCodes(nowon,[seoul,neighbor,daejeon]),origin:nowon.center};
  assert.equal(ctx.selection.codes.has(daejeon.code),false);
  const distant={src:'sms',sgg:[daejeon.code],sido:['30'],title:'대전 동구 소식'};
  assert.equal(ctx.visible(distant),false);ctx.pulse(distant,true);assert.equal(flashes.length,0);
  const shared={src:'wrn',sgg:[],sido:['30','11'],title:'강풍주의보 발효 — 대전, 서울'};
  assert.equal(ctx.visible(shared),true);assert.match(ctx.placeLabel(shared),/^서울 노원구/);
  assert.doesNotMatch(ctx.displayTitle(shared),/대전/);ctx.pulse(shared,true);
  assert.equal(flashes.includes(daejeon.code),false);assert.equal(flashes.includes(nowon.code),true);
});
test('대전·서울 공동 특보는 서울 제목·라벨·서울 반짝임으로, 원문은 보존',()=>{
  const {ctx,flashes,points}=setup();const item={src:'wrn',sgg:[],sido:['30','11'],title:'강풍주의보 발효 — 대전, 서울',body:'특보 구역: 대전, 서울'};
  assert.equal(ctx.visible(item),true);assert.match(ctx.placeLabel(item),/^서울 마포구/);assert.doesNotMatch(ctx.displayTitle(item),/대전/);
  ctx.pulse(item,true);assert.deepEqual(flashes,['11440','11410']);assert.deepEqual(points[0],seoul.center);
  assert.equal(item.title,'강풍주의보 발효 — 대전, 서울');assert.equal(item.body,'특보 구역: 대전, 서울');
});
test('해역 지진은 선택 지점에서 50km, 같은 도의 먼 시군구로 범위를 늘리지 않는다',()=>{
  const {ctx}=setup();const near={src:'eqk',sgg:[],lat:37.5,lon:126.6,time:new Date().toISOString()};
  assert.equal(ctx.nearbySea(near),true);assert.equal(ctx.nearbySea({...near,lat:36.3,lon:126.6}),false);
});
test('이번 주말: 한국 시간 일요일·월요일 및 연도 경계',()=>{
  const {scope}=setup(),day=s=>Date.parse(s+'T00:00:00+09:00')/86400000;
  assert.equal(scope.weekend(new Date('2026-10-25T01:00:00+09:00')).start,day('2026-10-25'));
  assert.equal(scope.weekend(new Date('2026-10-26T01:00:00+09:00')).start,day('2026-10-31'));
  assert.equal(scope.weekend(new Date('2026-12-31T23:00:00+09:00')).end,day('2027-01-03'));
});

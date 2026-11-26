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
  const ctx={allowedNews:it=>it.src==='brief',Date,Set,Math,munis:regions,muniByCode:new Map(regions.map(m=>[m.code,m])),sidos:new Map([['11',{short:'서울',munis:[seoul,neighbor],center:seoul.center}],['30',{short:'대전',munis:[daejeon],center:daejeon.center}]]),selection:{center:seoul,codes:new Set(['11440','11410']),origin:seoul.center},category:null,mode:'news',onMap:it=>it.onMap!==false&&it.src!=='brief',hasPoint:it=>Number.isFinite(it.lat)&&Number.isFinite(it.lon),label:m=>m.short+' '+m.name,validDate:d=>Number.isFinite(d.getTime()),signalName:()=>'',signalStyle:()=>'',flash:m=>flashes.push(m.code),reducedMotion:{matches:true},map:{},showMapBubble:()=>{},setTimeout:()=>{},L:{latLng:(lat,lon)=>[lat,lon],divIcon:()=>{},marker:at=>({addTo:()=>{points.push(at);return {};}})}};
  vm.createContext(ctx);vm.runInContext(scopeCode,ctx);
  for(const name of ['itemMunis','localItemMunis','displayTitle','placeLabel','visible','pulse']) {
    const code=app.match(new RegExp('function '+name+'\\([^]*?\\n}'))?.[0];assert.ok(code,name+' function missing');vm.runInContext(code,ctx);
  }
  return {ctx,scope:ctx.NallaeLocalScope,flashes,points};
}
test('서울 주변: 인접 지역 유지, 대전은 잘못 인접 입력이어도 30km 밖이라 제외',()=>{
  const {scope}=setup();const codes=scope.regionCodes(seoul,[neighbor,daejeon]);
  assert.deepEqual([...codes],['11440','11410']);assert.ok(scope.distance(seoul.center,daejeon.center)>100000);
});
test('일반 소식의 광역 지역은 선택한 중심·인접 지역만 라벨에 쓴다',()=>{
  const {ctx}=setup();
  const item={src:'brief',sgg:[],sido:['30','11'],title:'서울·대전 문화정책 안내'};
  assert.deepEqual([...ctx.itemMunis(item)].map(m=>m.code),['30110','11440','11410']);
  assert.deepEqual([...ctx.localItemMunis(item)].map(m=>m.code),['11440','11410']);
  assert.equal(ctx.displayTitle(item),'서울·대전 문화정책 안내');
  assert.match(ctx.placeLabel(item),/관련:/);
});
test('일반 정책은 전국 목록 전용이며 동네 지도에서 발생 사건으로 표시하지 않는다',()=>{
  const {ctx,flashes,points}=setup();
  const item={src:'brief',sgg:['11440'],sido:[],title:'마포구 문화정책 안내'};
  assert.equal(ctx.visible(item),false);ctx.pulse(item,true);
  ctx.selection=null;assert.equal(ctx.visible(item),true);ctx.pulse(item,true);
  assert.equal(flashes.length,0);assert.equal(points.length,0);
});
test('이전 캐시의 재난 출처는 전국·동네에서 모두 접근할 수 없다',()=>{
  const {ctx,flashes,points}=setup();
  for(const src of ['sms','wrn','eqk']){
    const item={src,sgg:['11440'],sido:['11'],title:'이전 캐시 소식'};
    assert.equal(ctx.visible(item),false);ctx.pulse(item,true);ctx.selection=null;
    assert.equal(ctx.visible(item),false);ctx.pulse(item,true);
  }
  assert.equal(flashes.length,0);assert.equal(points.length,0);
});
test('이번 주말: 한국 시간 일요일·월요일 및 연도 경계',()=>{
  const {scope}=setup(),day=s=>Date.parse(s+'T00:00:00+09:00')/86400000;
  assert.equal(scope.weekend(new Date('2026-10-25T01:00:00+09:00')).start,day('2026-10-25'));
  assert.equal(scope.weekend(new Date('2026-10-26T01:00:00+09:00')).start,day('2026-10-31'));
  assert.equal(scope.weekend(new Date('2026-12-31T23:00:00+09:00')).end,day('2027-01-03'));
});

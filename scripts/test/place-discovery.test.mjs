import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app=fs.readFileSync(new URL('../../web/app.js',import.meta.url),'utf8');
function setup() {
  const items=Array.from({length:80},(_,i)=>({id:String(i),sgg:i<40?'11440':'26350',district:i<40?'서울 마포구':'부산 해운대구',name:'식당 '+i,food:'냉면',source:{type:'heritage'}}));
  const ctx={allPlaceItems:()=>items,selection:{center:{code:'11440'}},placesShowAll:false,placesOnlySaved:false,savedPlaces:new Set(),placesSource:'',placesQuery:'',placesLimit:40,placeMapItems:[],label:()=> '서울 마포구',escapeHtml:x=>x,placeCard:x=>'<li>'+x.id+'</li>',feedEl:{scrollTop:0,innerHTML:''},renderPlaceMarkers:xs=>{ctx.markers=xs;}};
  vm.createContext(ctx);vm.runInContext(app.match(/function renderPlaceCards\([^]*?\n}/)[0],ctx);
  return ctx;
}
test('선택 지역에서 부산 검색이 비면 전국 검색 전환 제공, 전환 뒤 검색어 유지',()=>{
  const ctx=setup();ctx.placesQuery='부산';ctx.renderPlaceCards();
  assert.equal(ctx.markers.length,0);assert.match(ctx.feedEl.innerHTML,/전국에서 같은 검색 보기/);
  ctx.placesShowAll=true;ctx.renderPlaceCards();assert.equal(ctx.markers.length,40);assert.equal(ctx.placesQuery,'부산');
});
test('목록은 40곳씩 보여도 지도 후보는 필터에 맞는 전체 식당을 유지',()=>{
  const ctx=setup();ctx.placesShowAll=true;ctx.renderPlaceCards();
  assert.equal(ctx.markers.length,80);assert.equal(ctx.placeMapItems.length,80);
  assert.match(ctx.feedEl.innerHTML,/식당 더 보기 \(40 \/ 80\)/);
  ctx.placesOnlySaved=true;ctx.savedPlaces.add('75');ctx.renderPlaceCards();
  assert.equal(ctx.markers.length,1);assert.equal(ctx.markers[0].id,'75');
});

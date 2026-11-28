import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app=fs.readFileSync(new URL('../../web/app.js',import.meta.url),'utf8');
function load(ctx,name){const fn=app.match(new RegExp('(?:async )?function '+name+'\\([^]*?\\n}'))?.[0];assert.ok(fn);vm.runInContext(fn,ctx);}
function setup(){
  const ctx={Math,Promise,mode:'explore',exploreLayer:'outing',savedView:true,outingTheme:'restaurants',savedPlaces:new Set(['saved-a','saved-b']),placesData:null,heritageLoadState:'error',savedRestaurantRetryPending:false,exploreReady:true,exploreFailed:new Set(['places']),allPlaceItems:()=>[],escapeHtml:s=>String(s),addressLink:()=>'<a>지도</a>'};
  vm.createContext(ctx);load(ctx,'savedRestaurantContent');return ctx;
}

test('저장 맛집은 원본 ID 개수와 자료 확인 개수를 구분하고 누락·로딩을 저장 0건으로 바꾸지 않는다',()=>{
  const ctx=setup(),ids=[...ctx.savedPlaces];let html=ctx.savedRestaurantContent();
  assert.match(html,/저장한 맛집 2곳/);assert.match(html,/현재 자료 확인 0곳/);assert.match(html,/미확인 2곳/);assert.match(html,/저장 기록은 이 기기에 그대로/);assert.match(html,/data-saved-restaurants-retry/);assert.doesNotMatch(html,/저장해 보세요/);
  ctx.placesData={items:[]};ctx.exploreFailed.clear();ctx.heritageLoadState='ready';ctx.allPlaceItems=()=>[{id:'saved-a',name:'식당',address:'공개 주소'}];html=ctx.savedRestaurantContent();
  assert.match(html,/현재 자료 확인 1곳/);assert.match(html,/미확인 1곳/);assert.doesNotMatch(html,/data-saved-restaurants-retry/);assert.deepEqual([...ctx.savedPlaces],ids);
  ctx.heritageLoadState='loading';html=ctx.savedRestaurantContent();assert.match(html,/확인하고 있어요/);assert.match(html,/data-saved-restaurants-retry disabled/);
  ctx.savedPlaces.clear();assert.match(ctx.savedRestaurantContent(),/저장해 보세요/);
});

test('저장 맛집 재시도는 필요한 목록만 받고 중복 요청·ID 삭제 없이 스크롤과 재시도 초점을 복구한다',async()=>{
  const ctx=setup();ctx.savedPlaces=new Set(['saved-a']);ctx.placesData={items:[]};ctx.exploreFailed.clear();
  let resolveHeritage,heritageCalls=0,placeCalls=0,focused=0;
  const body={},button={matches:s=>s==='[data-saved-restaurants-retry]',closest:()=>null,focus:()=>{}},tab={focus:()=>{focused++;ctx.document.activeElement=tab;}};
  ctx.document={body,activeElement:button};ctx.feedEl={scrollTop:119,innerHTML:'',querySelector:()=>ctx.feedEl.innerHTML.includes('data-saved-restaurants-retry')?button:null,querySelectorAll:()=>[]};ctx.exploreTools={querySelector:()=>tab};
  ctx.loadHeritageData=()=>{heritageCalls++;return new Promise(resolve=>resolveHeritage=()=>{ctx.heritageLoadState='ready';ctx.allPlaceItems=()=>[{id:'saved-a',name:'식당',address:'공개 주소'}];ctx.document.activeElement=body;resolve();});};
  ctx.loadExploreData=async keys=>{placeCalls++;assert.deepEqual(Array.from(keys),['places']);ctx.placesData={items:[]};ctx.exploreFailed.delete('places');};
  load(ctx,'refreshSavedRestaurants');load(ctx,'retrySavedRestaurants');
  const job=ctx.retrySavedRestaurants();await ctx.retrySavedRestaurants();assert.equal(heritageCalls,1);assert.equal(placeCalls,0);
  resolveHeritage();await job;
  assert.equal(ctx.feedEl.scrollTop,119);assert.equal(focused,1);assert.equal(ctx.savedPlaces.size,1);assert.match(ctx.feedEl.innerHTML,/현재 자료 확인 1곳/);assert.doesNotMatch(ctx.feedEl.innerHTML,/미확인/);
  ctx.placesData=null;ctx.exploreFailed.add('places');await ctx.retrySavedRestaurants();assert.equal(placeCalls,1);assert.equal(heritageCalls,1);assert.equal(ctx.savedPlaces.size,1);
});

test('저장 맛집 바로가기에서 공개 ID로 지삐 지도 및 기존 주소 링크를 각각 제공한다',()=>{
  const ctx=setup(), id='식당/a&b';
  ctx.savedPlaces=new Set([id]);
  ctx.allPlaceItems=()=>[{id, name:'식당', branch:'본점', address:'공개 도로명 주소'}];
  ctx.heritageLoadState='ready';
  const html=ctx.savedRestaurantContent();
  assert.ok(html.includes('explore.html?view=places&amp;place='+encodeURIComponent(id)+'&amp;from=saved'));
  assert.ok(html.includes('<a>지도</a>'));
  assert.match(html,/식당 본점/);
});

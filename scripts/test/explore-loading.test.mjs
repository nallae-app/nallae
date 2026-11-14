import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app=fs.readFileSync(new URL('../../web/app.js',import.meta.url),'utf8');
const loadSource=app.match(/async function loadExploreData\([^]*?\n}/)?.[0];
assert.ok(loadSource);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup({preferred='outing'}={}) {
  const requests=new Map(),timers=new Map(),renders=[];
  let timerId=0,briefUpdates=0;
  const ctx={
    AbortController,Promise,Object,DEMO:false,exploreReady:false,exploreChoiceChanged:false,mode:'explore',exploreLayer:'outing',preferredExploreLayer:preferred,
    fuelData:null,weatherData:null,forecastData:null,foodIndex:null,parkingIndex:null,pharmacyIndex:null,erData:null,placesData:{items:[]},placeLocations:{items:{}},outingIndex:null,parkingLive:null,careRaw:{},
    exploreFailed:new Set(),feedEl:{scrollTop:0},exploreTools:{querySelector:()=>null},
    exploreValid:{'outings/index':d=>d.total>0,places:d=>Array.isArray(d.items),'place-locations':d=>!!d.items&&typeof d.items==='object'&&!Array.isArray(d.items),weather:d=>!!d.sgg,forecast:d=>!!d.sgg},
    fetch:(url,{signal})=>new Promise((resolve,reject)=>{
      const key=url.replace(/^data\//,'').replace(/\.json$/,'');
      requests.set(key,{signal,resolve:data=>resolve({ok:true,json:async()=>data})});
      signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});
    }),
    setTimeout:(callback,ms)=>{const id=++timerId;timers.set(id,{callback,ms});return id;},
    clearTimeout:id=>timers.delete(id),
    availableLayers:()=>[['outing','코스',ctx.outingIndex],['weather','날씨',ctx.weatherData]].filter(x=>x[2]),
    renderExplore:()=>{renders.push({layer:ctx.exploreLayer,forecast:!!ctx.forecastData,weather:!!ctx.weatherData,places:ctx.placesData?.items?.length||0,locations:Object.keys(ctx.placeLocations?.items||{}).length});ctx.feedEl.scrollTop=0;},
    fitSheet:()=>{},syncCategories:()=>{},updateBeforeOuting:()=>briefUpdates++,
  };
  vm.createContext(ctx);vm.runInContext(loadSource,ctx);
  return {ctx,requests,timers,renders,briefUpdates:()=>briefUpdates};
}

test('코스 첫 렌더는 무관한 날씨 요청 완료를 기다리지 않고 읽는 화면을 최종 완료 때 재생성하지 않는다',async()=>{
  const h=setup(),job=h.ctx.loadExploreData(['outings/index','weather']);
  h.requests.get('outings/index').resolve({total:1});await tick();
  assert.equal(h.ctx.exploreReady,false);assert.equal(h.renders.length,1);assert.equal(h.renders[0].layer,'outing');
  assert.equal(h.ctx.weatherData,null);h.ctx.feedEl.scrollTop=163;
  h.requests.get('weather').resolve({sgg:{11350:{t:7}}});await job;
  assert.equal(h.ctx.exploreReady,true);assert.equal(h.renders.length,1);assert.equal(h.ctx.feedEl.scrollTop,163);assert.equal(h.briefUpdates(),1);
});

test('점진 코스 뒤 날씨로 전환하면 늦게 도착한 예보도 최종 날씨 화면에 반영하고 스크롤을 보존한다',async()=>{
  const h=setup(),job=h.ctx.loadExploreData(['outings/index','weather','forecast']);
  h.requests.get('outings/index').resolve({total:1});h.requests.get('weather').resolve({sgg:{}});await tick();
  h.ctx.exploreLayer='weather';h.ctx.exploreChoiceChanged=true;h.ctx.renderExplore();
  assert.equal(h.renders.at(-1).forecast,false);h.ctx.feedEl.scrollTop=94;
  h.requests.get('forecast').resolve({sgg:{11350:{today:{pop:70}}}});await job;
  assert.equal(h.renders.at(-1).layer,'weather');assert.equal(h.renders.at(-1).forecast,true);assert.equal(h.ctx.feedEl.scrollTop,94);
});

test('최종 선호 화면이 점진 렌더 화면과 다르면 상태와 실제 화면을 함께 전환한다',async()=>{
  const h=setup({preferred:'weather'}),job=h.ctx.loadExploreData(['outings/index','weather']);
  h.requests.get('outings/index').resolve({total:1});await tick();
  assert.equal(h.renders.at(-1).layer,'outing');
  h.requests.get('weather').resolve({sgg:{}});await job;
  assert.equal(h.ctx.exploreLayer,'weather');assert.equal(h.renders.at(-1).layer,'weather');assert.equal(h.renders.length,2);
});

test('멈춘 자료 요청은 12초 제한에 abort하고 실패 표시 후 로딩을 종료한다',async()=>{
  const h=setup(),job=h.ctx.loadExploreData(['outings/index','weather']);
  h.requests.get('outings/index').resolve({total:1});await tick();
  const pending=h.requests.get('weather');assert.equal(pending.signal.aborted,false);assert.equal(h.timers.size,1);
  const timer=[...h.timers.values()][0];assert.equal(timer.ms,12000);timer.callback();await job;
  assert.equal(pending.signal.aborted,true);assert.equal(h.ctx.exploreFailed.has('weather'),true);assert.equal(h.ctx.exploreFailed.has('outings/index'),false);
  assert.equal(h.ctx.exploreReady,true);assert.equal(h.timers.size,0);assert.equal(h.briefUpdates(),1);assert.equal(h.renders.length,1);
});


test('식당 자료가 코스 인덱스보다 늦어도 둘을 반영한 첫 코스를 생활자료보다 먼저 표시한다',async()=>{
  const h=setup();h.ctx.placesData=null;
  const job=h.ctx.loadExploreData(['outings/index','places','weather']);
  h.requests.get('outings/index').resolve({total:1});await tick();
  assert.equal(h.renders.length,0,'식당을 누락한 코스로 첫 렌더하면 안 됨');
  h.requests.get('places').resolve({items:[{id:'restaurant',name:'식당'}]});await tick();
  assert.equal(h.ctx.exploreReady,false);assert.equal(h.renders.length,1);assert.equal(h.renders[0].layer,'outing');assert.equal(h.renders[0].places,1);
  h.ctx.feedEl.scrollTop=75;
  h.requests.get('weather').resolve({sgg:{}});await job;
  assert.equal(h.renders.length,1);assert.equal(h.ctx.feedEl.scrollTop,75);
});


test('늦은 식당 좌표도 첫 코스 렌더에 포함하고 무관한 날씨 완료는 기다리지 않는다',async()=>{
  const h=setup();h.ctx.placeLocations=null;
  const job=h.ctx.loadExploreData(['outings/index','place-locations','weather']);
  h.requests.get('outings/index').resolve({total:1});await tick();
  assert.equal(h.renders.length,0,'식당 좌표가 준비되기 전에 첫 코스를 고정하면 안 됨');
  h.requests.get('place-locations').resolve({items:{restaurant:{lat:37.65,lon:127.06}}});await tick();
  assert.equal(h.ctx.exploreReady,false);assert.equal(h.renders.length,1);assert.equal(h.renders[0].locations,1);
  h.requests.get('weather').resolve({sgg:{}});await job;assert.equal(h.renders.length,1);
});

test('식당 좌표 응답 실패에도 준비된 공원·관광 코스를 날씨보다 먼저 표시한다',async()=>{
  const h=setup();h.ctx.placeLocations=null;
  const job=h.ctx.loadExploreData(['outings/index','place-locations','weather']);
  h.requests.get('outings/index').resolve({total:1});await tick();assert.equal(h.renders.length,0);
  h.requests.get('place-locations').resolve({items:null});await tick();
  assert.equal(h.ctx.exploreFailed.has('place-locations'),true);assert.equal(h.ctx.exploreReady,false);
  assert.equal(h.renders.length,1);assert.equal(h.renders[0].layer,'outing');assert.equal(h.renders[0].locations,0);
  h.requests.get('weather').resolve({sgg:{}});await job;assert.equal(h.renders.length,1);
});

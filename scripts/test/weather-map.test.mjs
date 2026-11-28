import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app=fs.readFileSync(new URL('../../web/app.js',import.meta.url),'utf8');
function setup(names,dependencies={}) {
  const context=vm.createContext(dependencies);
  for (const name of names) {
    const code=app.match(new RegExp('^function '+name+'\\([^]*?^}', 'm'))?.[0];
    assert.ok(code,name);
    vm.runInContext(code,context);
  }
  return context;
}

test('실황 지도는 수집 성공 시각과 별개로 원본 관측 시각·갱신 결과를 사용한다',()=>{
  const now=Date.parse('2026-11-28T12:00:00+09:00');
  const {weatherFreshness,weatherTime}=setup(['weatherFreshness','weatherTime']);
  const age=ms=>({base:new Date(now-ms).toISOString(),updated:new Date(now).toISOString()});
  assert.equal(weatherFreshness(age(119*60000),false,2,now),'current');
  assert.equal(weatherFreshness(age(120*60000),false,2,now),'old');
  assert.equal(weatherFreshness(age(3600000),true,2,now),'unverified');
  assert.equal(weatherFreshness(age(-60000),false,2,now),'unknown');
  assert.equal(weatherFreshness({},false,2,now),'unknown');
  assert.equal(weatherTime('2026-11-27T15:00:00Z'),'11월 28일 00:00');
});

test('강수형태가 있을 때만 원본 우산·눈사람·혼합 그림을 사용한다',()=>{
  const {weatherArtwork}=setup(['weatherArtwork']);
  for (const absent of [0,undefined,null,NaN,15]) assert.equal(weatherArtwork(absent),'');
  for (const rain of [1,4,5]) {
    assert.match(weatherArtwork(rain),/class="rain-umbrella"/);
    assert.doesNotMatch(weatherArtwork(rain),/class="snowman"/);
  }
  for (const snow of [3,7]) {
    assert.match(weatherArtwork(snow),/class="snowman"/);
    assert.doesNotMatch(weatherArtwork(snow),/class="rain-umbrella"/);
  }
  for (const mixed of [2,6]) {
    assert.match(weatherArtwork(mixed),/class="rain-umbrella"/);
    assert.match(weatherArtwork(mixed),/class="snow-flake"/);
  }
});

test('지도 표식 터치 영역은 화면 밖·시트·서로를 덮지 않고 확대 시 자료가 있는 좌표에 놓인다',()=>{
  const {weatherPointPosition:place}=setup(['weatherPointPosition']);
  const viewport={x:390,y:844};
  const blockers=[{left:0,top:350,right:390,bottom:844},{left:0,top:0,right:390,bottom:60}];
  const occupied=[...blockers];
  assert.equal(place({x:-4,y:110},60,viewport,occupied,blockers,true,false),null);
  assert.equal(place({x:130,y:380},60,viewport,occupied,blockers,true,true),null);
  assert.equal(place({x:130,y:21},60,viewport,occupied,blockers,true,false),null);
  assert.deepEqual([...place({x:150,y:140},60,viewport,occupied,blockers,false,false)],[0,0]);
  assert.equal(place({x:156,y:145},60,viewport,occupied,blockers,false,false),null);
  assert.ok(place({x:185,y:146},60,viewport,occupied,blockers,true,false));
  const last=occupied.at(-1),previous=occupied.at(-2);
  assert.ok(last.left>=previous.right||last.right<=previous.left||last.top>=previous.bottom||last.bottom<=previous.top);
});

test('실황 미수신 시 같은 동네 예보를 독립적으로 열고 지난 예보에는 현재 강수 그림을 붙이지 않는다',()=>{
  const now=Date.now();
  const today=new Date(now+9*3600000).toISOString().slice(0,10);
  const ctx=setup(['weatherFreshness','weatherTime','weatherArtwork','forecastHour','forecastCards'],{
    koreaDate:date=>new Date(date.getTime()+9*3600000).toISOString().slice(0,10),
    observedPrecipitation:['강수 없음','비','비·눈','눈'],
    exploreFailed:new Set(['weather']),
    forecastData:{base:new Date(now-3600000).toISOString(),sgg:{11110:{[today]:{pty:3,tmx:0,pop:40}}}},
  });
  const good=ctx.forecastCards('11110');
  assert.match(good,/snowman/);assert.match(good,/최고 0°/);assert.match(good,/오늘/);assert.match(good,/내일/);assert.match(good,/예보 미제공/);
  ctx.forecastData.base=new Date(now-38*3600000).toISOString();
  assert.doesNotMatch(ctx.forecastCards('11110'),/snowman/);
  assert.match(ctx.forecastCards('11110'),/지난 발표/);
  ctx.forecastData=null;
  assert.equal((ctx.forecastCards('11110').match(/예보 미제공/g)||[]).length,2);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../../web/discovery.js',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../../web/app.js',import.meta.url),'utf8');
const ctx={};vm.createContext(ctx);vm.runInContext(source,ctx);
const {beforeOuting}=ctx.NallaeDiscovery;
const now=Date.parse('2026-11-14T00:30:00+09:00');
const sample=()=>({now,code:'11350',codes:['11350','11320'],weather:{base:'2026-11-13T15:00:00Z',sgg:{11350:{t:0,pty:3}}},festivalLoaded:true,festivalUpdated:'2026-11-13T15:00:00Z',festivals:[
  {id:'today',start:'2026-11-14',end:'2026-11-14',sgg:['11350']},
  {id:'neighbor',start:'2026-11-13',end:'2026-11-15',sgg:'11320'},
  {id:'ended-kst',start:'2026-11-13',end:'2026-11-13',sgg:'11350'},
  {id:'tomorrow',start:'2026-11-15',end:'2026-11-15',sgg:'11350'},
  {id:'elsewhere',start:'2026-11-14',end:'2026-11-14',sgg:'26110'},
  {id:'invalid-date',start:'2026-02-30',end:'2026-11-14',sgg:'11350'},
]});

test('외출 요약은 한국 날짜와 선택 동네·이웃 범위를 사용하고 현재 실황 0도를 보존한다',()=>{
  const brief=beforeOuting({...sample(),festivalPeriod:'weekend'});
  assert.equal(brief.festival.count,2);assert.equal(brief.festival.label,'오늘 등록 축제 2건');
  assert.equal(brief.weather.label,'실황 0° · 눈');
  assert.equal(beforeOuting({...sample(),code:null}),null);
  assert.equal(beforeOuting({...sample(),codes:[]}).festival.count,1);
});

test('오래됨·미제공·미래 관측·갱신 실패를 오늘 상태로 표시하지 않는다',()=>{
  for(const base of [null,'invalid','2026-11-13T13:30:00Z','2026-11-13T15:31:00Z']){
    const input=sample();input.weather.base=base;
    const brief=beforeOuting(input);assert.equal(brief.weather.label,'실황 확인 필요');assert.equal(brief.weather.base,null);
  }
  const failed=beforeOuting({...sample(),weatherFailed:true,festivalFailed:true});
  assert.equal(failed.weather.label,'실황 확인 필요');assert.equal(failed.festival.count,null);
  for(const stamp of [null,'invalid','2026-11-12T15:30:00Z','2026-11-13T15:31:00Z']){
    const brief=beforeOuting({...sample(),festivalUpdated:stamp});
    assert.equal(brief.festival.count,null);assert.equal(brief.festival.label,'축제 확인 필요');
  }
  const missing=beforeOuting({...sample(),weather:null,festivalLoaded:false});
  assert.equal(missing.weather.available,false);assert.equal(missing.festival.available,false);
});

test('신선한 등록 축제 0건은 실제 행사가 없다는 뜻으로 바꾸지 않는다',()=>{
  const brief=beforeOuting({...sample(),festivals:[]});
  assert.equal(brief.festival.count,0);assert.equal(brief.festival.label,'오늘 등록 축제 0건');
  assert.equal(brief.festival.available,false,'전국 목록도 빈 경우 다른 분류로 튀는 버튼을 켜지 않는다');
  assert.doesNotMatch(brief.festival.label,/없/);
});

test('자료 도착 시 요약 DOM만 갱신하고 코스·스크롤·열린 필터를 건드리지 않는다',()=>{
  const summary={innerHTML:'old'},card={id:'keep-this-card'},filter={open:true};
  const feed={scrollTop:170,card,querySelector:selector=>selector==='[data-before-outing]'?summary:null};
  const local={mode:'explore',exploreLayer:'outing',savedView:false,outingTheme:'date',selection:{center:{code:'11350'}},feedEl:feed,beforeOutingContent:()=>'<strong>new weather</strong>',renderExplore:()=>{throw Error('전체 화면 재생성 금지');},exploreTools:{filter}};
  vm.createContext(local);const fn=app.match(/function updateBeforeOuting\([^]*?\n}/)?.[0];assert.ok(fn);vm.runInContext(fn,local);
  local.updateBeforeOuting();assert.equal(summary.innerHTML,'<strong>new weather</strong>');assert.equal(feed.scrollTop,170);assert.equal(feed.card,card);assert.equal(filter.open,true);
  local.selection=null;summary.innerHTML='unchanged';local.updateBeforeOuting();assert.equal(summary.innerHTML,'unchanged');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app=fs.readFileSync(new URL('../../web/app.js',import.meta.url),'utf8');
function load(ctx,name){const fn=app.match(new RegExp('function '+name+'\\([^]*?\\n}'))?.[0];assert.ok(fn);vm.runInContext(fn,ctx);}
const ctx={Date,Number};vm.createContext(ctx);load(ctx,'parkingObservation');
const now=Date.parse('2026-11-14T15:00:00+09:00');
const row={code:'seoul',matchId:'p',now:3,total:10,at:'2026-11-14 14:55:00'};
const data={updated:'2026-11-14T05:58:00Z',items:[row]};

test('주차 실황은 한국 원자료 시각을 기기 시간대와 무관하게 읽고 관측·수집 모두 30분 안인지 확인한다',()=>{
  const state=ctx.parkingObservation(row,data,now);assert.equal(state.current,true);assert.equal(state.at,Date.parse('2026-11-14T14:55:00+09:00'));
  const oldRow={...row,at:'2026-11-14 14:30:00'};assert.equal(ctx.parkingObservation(oldRow,data,now).current,false);
  assert.equal(ctx.parkingObservation(row,{...data,updated:'2026-11-14T14:30:00+09:00'},now).current,false);
  assert.equal(ctx.parkingObservation({...row,at:'2026-11-14T05:55:00Z'},data,now).current,true);
});

test('시각 미제공·잘못된 달력·미래 관측·미래 수집·갱신 실패는 현재 빈자리로 판정하지 않는다',()=>{
  for(const at of [undefined,'bad','2026-11-14','2026-02-30 14:55:00','2026-11-14 24:00:00','2026-11-14 15:00:01'])assert.equal(ctx.parkingObservation({...row,at},data,now).current,false,String(at));
  for(const updated of [undefined,'bad','2026-11-14T15:00:01+09:00'])assert.equal(ctx.parkingObservation(row,{updated},now).current,false,String(updated));
  assert.match(ctx.parkingObservation(row,data,now,true).reason,/갱신 실패/);
  assert.match(ctx.parkingObservation(row,{...data,lastFailure:{at:'2026-11-14T14:59:00+09:00'}},now).reason,/갱신 실패/);
});

test('과거 빈자리 수는 날짜가 있는 마지막 관측으로 보존하고 여유·혼잡이나 현재 수로 표현하지 않는다',()=>{
  const local={Date,Number,parkingLiveState:l=>ctx.parkingObservation(l,data,now),parkingSpace:l=>({free:l.total-l.now,state:'여유'})};vm.createContext(local);
  load(local,'parkingObservedTime');load(local,'parkingLiveText');
  assert.match(local.parkingLiveText(row),/최근 관측 빈자리 7면 · 여유/);
  const old={...row,at:'2026-11-12 14:55:00'},text=local.parkingLiveText(old);
  assert.match(text,/마지막 관측 빈자리 7면/);assert.match(text,/2026/);assert.match(text,/11/);assert.match(text,/12/);assert.match(text,/현재 현황 확인 필요/);assert.doesNotMatch(text,/지금 빈자리|여유|혼잡/);
});

test('주차 요약만 만료 갱신하고 오래된 지도 빈자리 표식을 숨기며 목록 스크롤은 유지한다',()=>{
  const old={...row,at:'2026-11-12 14:55:00'},label={dataset:{parkingObservation:'seoul'},textContent:'지금 빈자리 7면',className:'parking-live easy'},tag={dataset:{parkingLiveTag:'seoul'},hidden:false};
  const local={mode:'explore',exploreLayer:'parking',parkingFilter:'',parkingLive:{...data,items:[old]},parkingLiveState:l=>ctx.parkingObservation(l,data,now),parkingLiveText:()=> '마지막 관측 빈자리 7면 · 현재 현황 확인 필요',parkingSpace:()=>({tone:'easy'}),feedEl:{scrollTop:163},document:{querySelectorAll:s=>s==='[data-parking-observation]'?[label]:[tag]},renderParking:()=>{throw Error('전체 목록을 다시 만들면 안 됨');},Map};
  vm.createContext(local);load(local,'updateParkingLiveLabels');local.updateParkingLiveLabels();
  assert.match(label.textContent,/마지막 관측/);assert.doesNotMatch(label.className,/easy/);assert.equal(tag.hidden,true);assert.equal(local.feedEl.scrollTop,163);
});

test('최근 빈자리 필터와 지도 후보는 오래된 연결자료·실시간 전용자료를 현재 후보로 섞지 않는다',()=>{
  const items=[{id:'fresh',name:'최근',lat:37.57,lon:126.98},{id:'old',name:'과거',lat:37.58,lon:126.98}];
  const rows=[{...row,code:'fresh',matchId:'fresh'},{...row,code:'old',matchId:'old',at:'2026-11-12 14:55:00'},{...row,code:'extra-fresh',matchId:undefined,sgg:'11110',name:'최근 전용'},{...row,code:'extra-old',matchId:undefined,sgg:'11110',name:'과거 전용',at:'2026-11-12 14:55:00'}];
  const local={Number,Math,selection:{center:{code:'11110'},fromLocation:false},muniByCode:new Map([['11110',{}]]),parkingCode:'11110',parkingFilter:'live',parkingShown:[],parkingCache:new Map([['11110',{items}]]),parkingIndex:{counts:{11110:2}},parkingLive:{...data,items:rows},liveFor:x=>rows.find(l=>l.matchId===x.id),parkingLiveState:l=>ctx.parkingObservation(l,data,now),parkingSpace:l=>({free:l.total-l.now}),parkingDistance:()=>0,parkingText:x=>'['+(x.id||x.code)+']',renderParkingMarkers:()=>{},sourceDisclosure:()=>'',exploreTools:{innerHTML:''},feedEl:{innerHTML:''}};
  vm.createContext(local);load(local,'renderParking');local.renderParking();
  assert.deepEqual(Array.from(local.parkingShown,x=>x.id),['fresh']);assert.match(local.feedEl.innerHTML,/\[extra-fresh\]/);assert.doesNotMatch(local.feedEl.innerHTML,/\[old\]|\[extra-old\]/);
  local.parkingFilter='';local.renderParking();assert.match(local.feedEl.innerHTML,/\[old\]/);assert.match(local.feedEl.innerHTML,/\[extra-old\]/);
});

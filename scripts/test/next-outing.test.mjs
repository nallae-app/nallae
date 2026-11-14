import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app=fs.readFileSync(new URL('../../web/app.js',import.meta.url),'utf8');
function load(ctx,name){const fn=app.match(new RegExp('function '+name+'\\([^]*?\\n}'))?.[0];assert.ok(fn);vm.runInContext(fn,ctx);}
function setup(){
  const storage=new Map(),messages=[];
  const ctx={Map,Set,Math,Number,Object,String,Date,encodeURIComponent,nextPlanId:null,savedView:false,outingTheme:'date',outingQuery:'old search',exploreChoiceChanged:false,selection:null,savedPlans:new Map(),savedOutings:new Map(),communityUI:{reviewFor:()=>null},mobileSheet:{matches:true},feedEl:{querySelectorAll:()=>[]},exploreTools:{querySelector:()=>null},localStorage:{setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},toast:m=>messages.push(m),renderOutingCards:()=>{},renderOutings:()=>{},applyMode:()=>{},setSheetStage:()=>{}};
  vm.createContext(ctx);for(const file of ['local-scope','discovery'])vm.runInContext(fs.readFileSync(new URL('../../web/'+file+'.js',import.meta.url),'utf8'),ctx);
  for(const fn of ['escapeHtml','escapeAttr','nextOutingCard','toggleNextOuting','openNextOuting','toggleSavedPlan','outingPlanCard'])load(ctx,fn);
  const plan=ctx.NallaeDiscovery.snapshotPlan({stops:[{id:'meal',name:'식당 <한곳>',lat:37.65,lon:127.06,type:'restaurant',address:'공개주소'},{id:'park',name:'공원 "산책"',lat:37.655,lon:127.06,type:'park',kind:'근린공원',address:'공개주소'}]});
  ctx.savedPlans.set(plan.id,plan);
  return {ctx,storage,messages,plan};
}

test('다음 외출은 저장 코스 ID 하나만 기기에 기록하고 다시 누르면 해제한다',()=>{
  const {ctx,storage,plan}=setup();
  ctx.toggleNextOuting(plan.id);assert.equal(ctx.nextPlanId,plan.id);assert.deepEqual([...storage],[['nallae-next-plan-v1',plan.id]]);
  assert.doesNotMatch(JSON.stringify([...storage]),/37\.65|127\.06|origin/);
  ctx.toggleNextOuting(plan.id);assert.equal(ctx.nextPlanId,null);assert.equal(storage.size,0);
  ctx.toggleNextOuting('missing');assert.equal(ctx.nextPlanId,null);assert.equal(storage.size,0);
});

test('저장공간 오류는 다음 외출 선택 성공으로 표시하거나 메모리 상태를 바꾸지 않는다',()=>{
  const {ctx,messages,plan}=setup();ctx.localStorage.setItem=()=>{throw Error('quota');};
  ctx.toggleNextOuting(plan.id);assert.equal(ctx.nextPlanId,null);assert.match(messages.at(-1),/저장하지 못/);
});

test('명시 선택한 저장 코스만 지역과 무관하게 표시하고, 저장 해제하면 다음 외출도 제거한다',()=>{
  const {ctx,plan,storage}=setup();assert.equal(ctx.nextOutingCard(),'');
  ctx.toggleNextOuting(plan.id);const noRegion=ctx.nextOutingCard();assert.match(noRegion,/이번엔 여기/);assert.match(noRegion,/선택 동네와 무관/);assert.match(noRegion,/식당 &lt;한곳&gt;/);assert.doesNotMatch(noRegion,/<한곳>/);assert.match(noRegion,/map\.kakao\.com\/link\/by\/walk/);
  ctx.selection={origin:[35,129],center:{code:'26110'}};assert.equal(ctx.nextOutingCard(),noRegion);
  const saved=ctx.outingPlanCard(plan,0,true);assert.match(saved,/data-plan-next=.*aria-pressed="true"/);assert.match(saved,/data-plan-review=/);
  assert.doesNotMatch(ctx.outingPlanCard(plan,0,false),/data-plan-next=/);
  ctx.toggleSavedPlan(plan);assert.equal(ctx.nextPlanId,null);assert.equal(ctx.nextOutingCard(),'');assert.equal(storage.has('nallae-next-plan-v1'),false);
  ctx.nextPlanId='missing';assert.equal(ctx.nextOutingCard(),'');
});

test('다음 외출 보기는 저장 화면의 해당 코스를 찾아 펼치고 키보드 초점을 옮긴다',()=>{
  const {ctx,plan}=setup();let scrolled=false,focused=false,applied=false,stage=null;
  ctx.nextPlanId=plan.id;
  const target={dataset:{planCard:plan.id},scrollIntoView:()=>scrolled=true,focus:()=>focused=true};
  ctx.feedEl.querySelectorAll=()=>[{dataset:{planCard:'other'}},target];ctx.applyMode=()=>applied=true;ctx.setSheetStage=value=>stage=value;
  ctx.openNextOuting();assert.equal(ctx.savedView,true);assert.equal(ctx.outingTheme,'plans');assert.equal(ctx.outingQuery,'');assert.equal(ctx.exploreChoiceChanged,true);
  assert.equal(applied,true);assert.equal(stage,2);assert.equal(scrolled,true);assert.equal(focused,true);
});

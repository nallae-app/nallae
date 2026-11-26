import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app=fs.readFileSync(new URL('../../web/app.js',import.meta.url),'utf8');
function load(ctx,...names){for(const name of names){const fn=app.match(new RegExp('(?:async )?function '+name+'\\([^]*?\\n}'))?.[0];assert.ok(fn,name);vm.runInContext(fn,ctx);}}
function networkContext(fetch){
 const deadlines=new Map(),ctx={fetch,AbortController,Date,Map,Set,Number,encodeURIComponent,DEMO:false,
 setTimeout:(fn,ms)=>{deadlines.set(ms,fn);return ms;},clearTimeout:id=>deadlines.delete(id)};
 vm.createContext(ctx);load(ctx,'fetchJsonData');return {ctx,deadlines};
}
test('첫 방문도 응답 전·본문 중단을 제한하고 HTTP 오류를 정상 자료로 취급하지 않는다',async()=>{
 for(const phase of ['headers','body']){
  let started;const ready=new Promise(resolve=>started=resolve);
  const {ctx,deadlines}=networkContext((_url,{signal})=>phase==='headers'?new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(Error('timeout')));started();}):Promise.resolve({ok:true,json:()=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(Error('body timeout')));started();})}));
  const pending=ctx.fetchJsonData('data/places.json');await ready;deadlines.get(12000)();await assert.rejects(pending,/timeout/);assert.equal(deadlines.size,0);
 }
 const {ctx}=networkContext(async()=>({ok:false,json:()=>{throw Error('must not read');}}));await assert.rejects(ctx.fetchJsonData('data/places.json'),/data response/);
});
test('제어 워커가 없는 동네 코스 첫 요청이 멈춰도 실패·재시도로 복구한다',async()=>{
 let blocked=true,started;const ready=new Promise(resolve=>started=resolve);
 const {ctx,deadlines}=networkContext((_url,{signal})=>blocked?new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(Error('timeout')));started();}):Promise.resolve({ok:true,json:async()=>({items:[{id:'park',sgg:'11440',lat:37.55,lon:126.92}]})}));
 Object.assign(ctx,{outingPending:new Set(),outingErrors:new Set(),outingCache:new Map(),outingRevision:0,outingDataTimer:null,mode:'news'});
 vm.runInContext(fs.readFileSync(new URL('../../web/discovery.js',import.meta.url),'utf8'),ctx);load(ctx,'loadOutingRegion');
 const pending=ctx.loadOutingRegion('11440');await ready;assert.equal(ctx.outingPending.has('11440'),true);deadlines.get(12000)();await pending;
 assert.equal(ctx.outingPending.size,0);assert.equal(ctx.outingErrors.has('11440'),true);
 blocked=false;await ctx.loadOutingRegion('11440');assert.equal(ctx.outingErrors.size,0);assert.equal(ctx.outingCache.get('11440')[0].id,'park');
});
test('주차·식품 지역 조회도 첫 방문 지연 뒤 불러오는 중에 갇히지 않는다',async()=>{
 for(const [fn,prefix] of [['loadParking','parking'],['loadFood','food']]){
  const {ctx,deadlines}=networkContext((_url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('timeout')))));
  Object.assign(ctx,{mode:'news',[prefix+'Pending']:new Set(),[prefix+'Errors']:new Set(),[prefix+'Cache']:new Map()});load(ctx,fn);
  const pending=ctx[fn]('11440');deadlines.get(12000)();await pending;assert.equal(ctx[prefix+'Pending'].size,0);assert.equal(ctx[prefix+'Errors'].has('11440'),true);
 }
});
function locationContext(){
 const calls=[],messages=[],selected=[],region={center:[37.55,126.92],feature:{geometry:{}}};
 const ctx={locationRequestId:0,munis:[region],navigator:{geolocation:{getCurrentPosition:(success,error)=>calls.push({success,error})}},toast:m=>messages.push(m),containsPoint:()=>true,locateBtn:{classList:{add:()=>{}}},meMarker:null,map:{removeLayer:()=>{}},L:{divIcon:()=>{},marker:()=>({addTo:()=>({})})},select:(...args)=>selected.push(args),label:()=> '서울 마포구',Number};
 vm.createContext(ctx);load(ctx,'locationErrorMessage','requestLocation');return {ctx,calls,messages,selected};
}
test('위치 권한 거부·사용 불가·시간 초과를 구분하고 코스에서도 소식 성공으로 오인시키지 않는다',()=>{
 for(const code of [1,2,3]){const {ctx,calls,messages}=locationContext();ctx.requestLocation();calls[0].error({code});assert.equal(messages.at(-1).includes('권한'),code===1);if(code===3)assert.match(messages.at(-1),/시간/);}
 const {ctx,calls,messages}=locationContext();ctx.requestLocation();calls[0].success({coords:{latitude:37.55,longitude:126.92,accuracy:10}});assert.match(messages.at(-1),/주변을/);assert.doesNotMatch(messages.at(-1),/소식/);
});
test('새 위치 요청이나 직접 동네 선택 뒤 늦은 GPS 결과·오류가 현재 선택과 안내를 덮지 않는다',()=>{
 const {ctx,calls,messages,selected}=locationContext(),point={coords:{latitude:37.55,longitude:126.92,accuracy:10}};
 ctx.requestLocation();ctx.requestLocation();const before=messages.length;calls[0].success(point);calls[0].error({code:1});assert.equal(selected.length,0);assert.equal(messages.length,before);
 calls[1].success(point);assert.equal(selected.length,1);
 ctx.requestLocation();ctx.locationRequestId++;const manual=messages.length;calls[2].success(point);calls[2].error({code:3});assert.equal(selected.length,1);assert.equal(messages.length,manual);
 assert.match(app,/function select\([^]*?locationRequestId\+\+/);assert.match(app,/function clearSelection\(\)\s*{\s*locationRequestId\+\+/);
});
test('모바일 목록을 다시 올리면 출발점 선택을 취소하고 접힌 상태에서는 선택을 유지한다',()=>{
 const messages=[];let cleared=0;
 const ctx={routePicking:true,routePins:{clearLayers:()=>cleared++},toast:m=>messages.push(m),sheetFitTimer:null,clearTimeout:()=>{},setTimeout:()=>1,sheetStage:0,stages:['collapsed','middle','full'],stageNames:['접힘','중간','전체'],panel:{classList:{remove:()=>{}},dataset:{},style:{removeProperty:()=>{}}},handle:{setAttribute:()=>{}},chipsEl:{},feedEl:{},document:{getElementById:()=>({})},mobileSheet:{matches:true},applySheetHeight:()=>{},sheetHeights:()=>({}),reducedMotion:{matches:true},feedTouchAction:()=>{}};
 vm.createContext(ctx);load(ctx,'cancelRoutePicking','setSheetStage');ctx.setSheetStage(0,false);assert.equal(ctx.routePicking,true);ctx.setSheetStage(1,false);assert.equal(ctx.routePicking,false);assert.equal(cleared,1);assert.match(messages.at(-1),/取消|취소/);
 ctx.setSheetStage(2,false);assert.equal(cleared,1);assert.match(app,/function applyMode\(\)\s*{\s*cancelRoutePicking\(\)/);
});
function savingContext(){
 const messages=[],writes=[],targets=[];let fallbackFocus=0,rendered=0;
 const ctx={Map,Set,Math,Number,Object,String,Date,savedPlans:new Map(),savedOutings:new Map(),nextPlanId:null,toast:m=>messages.push(m),localStorage:{setItem:(...x)=>writes.push(x),removeItem:()=>{}},feedEl:{querySelectorAll:()=>targets},exploreTools:{querySelector:()=>({focus:()=>fallbackFocus++})},renderOutings:()=>rendered++,renderOutingCards:()=>rendered++};
 vm.createContext(ctx);for(const name of ['local-scope','discovery'])vm.runInContext(fs.readFileSync(new URL('../../web/'+name+'.js',import.meta.url),'utf8'),ctx);load(ctx,'restoreOutingFocus','persistOutings','toggleSavedPlan','saveOuting','toggleSavedOuting','saveCommunityPlace');
 const place={id:'park',name:'공원',lat:37.55,lon:126.92,type:'park'};
 const plan=ctx.NallaeDiscovery.snapshotPlan({stops:[place,{...place,id:'park2',lat:37.555}]});
 return {ctx,messages,writes,targets,place,plan,get fallbackFocus(){return fallbackFocus;},get rendered(){return rendered;}};
}
test('코스·장소 저장 뒤 같은 제어로 초점을 복원하고 사라진 카드에서는 저장 탭으로 복귀한다',()=>{
 const s=savingContext();let focused=0;
 s.targets.push({getAttribute:()=>s.plan.id,focus:()=>focused++});s.ctx.toggleSavedPlan(s.plan);assert.equal(focused,1);
 s.targets.length=0;s.ctx.toggleSavedPlan(s.plan);assert.equal(s.fallbackFocus,1);assert.match(s.messages.at(-1),/해제/);
 s.ctx.savedOutings.clear();s.targets.push({getAttribute:()=>s.place.id,focus:()=>focused++});s.ctx.toggleSavedOuting(s.place);assert.equal(focused,2);s.ctx.toggleSavedOuting(s.place);assert.equal(focused,3);assert.match(s.messages.at(-1),/해제/);assert.equal(s.ctx.savedOutings.has(s.place.id),false);
});
test('장소 저장 한도 실패와 이미 저장한 제보를 새 저장 성공으로 덮어쓰지 않는다',()=>{
 const s=savingContext();for(let i=0;i<300;i++)s.ctx.savedOutings.set('full-'+i,{id:'full-'+i});
 s.ctx.toggleSavedOuting(s.place);assert.match(s.messages.at(-1),/최대 300/);assert.equal(s.writes.length,0);assert.equal(s.rendered,0);
 s.ctx.saveCommunityPlace(s.place,'community');assert.match(s.messages.at(-1),/최대 300/);assert.equal(s.writes.length,0);
 s.ctx.savedOutings.set(s.place.id,s.place);s.ctx.saveCommunityPlace(s.place,'community');assert.match(s.messages.at(-1),/이미 저장/);assert.equal(s.writes.length,0);
});

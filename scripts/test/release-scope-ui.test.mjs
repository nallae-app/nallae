import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app=fs.readFileSync(new URL('../../web/app.js',import.meta.url),'utf8');
function extract(name){const fn=app.match(new RegExp('(?:async )?function '+name+'\\([^]*?\\n}'))?.[0];assert.ok(fn,name);return fn;}
function newsContext({scope=true}={}){
 const ctx={Date,Set,NEWS_URL:'data/news.json',fetchJsonData:async()=>({updated:'2026-11-26T00:00:00Z',sources:{brief:{ok:true},sms:{ok:true}},items:[]}),loadFailed:false,lastChecked:null,sources:{},seen:new Set(),items:[],updatedAt:null,munis:[],mode:'news',firstLoad:false,feedEl:{scrollTop:0,contains:()=>false},document:{activeElement:null},pending:new Set(),updateDecorations:()=>{},syncCategories:()=>{},restyle:()=>{},renderFeed:()=>{},visible:()=>true,setTimeout:()=>{},pulse:()=>{}};
 vm.createContext(ctx);
 if(scope)vm.runInContext(fs.readFileSync(new URL('../../web/release-scope.js',import.meta.url),'utf8'),ctx);
 vm.runInContext(app.match(/const allowedNews = [^;]+;/)[0],ctx);vm.runInContext(extract('load'),ctx);
 return ctx;
}
const valid={id:'life',src:'brief',cat:'생활',contentScope:'local-life-v1',title:'서울 문화공간 운영 안내',time:'2026-11-26T00:00:00Z',body:'',onMap:false};
test('실제 뉴스 로더는 기존 캐시의 응급·의료 및 범위 미검증 소식을 수신해도 노출 목록에 넣지 않는다',async()=>{
 const ctx=newsContext();
 const cached=[valid,...['sms','wrn','eqk'].map(src=>({...valid,id:src,src})),{...valid,id:'old',contentScope:undefined},{...valid,id:'care',title:'응급실 운영 안내'},{...valid,id:'badtime',time:null}];
 ctx.fetchJsonData=async()=>({sources:{brief:{ok:true},sms:{ok:false}},items:cached});await ctx.load();
 assert.deepEqual([...ctx.items].map(x=>x.id),['life']);assert.deepEqual(Object.keys(ctx.sources),['brief']);
});
test('범위 모듈 수신 실패 시 보수적으로 빈 소식 목록을 유지한다',async()=>{
 const ctx=newsContext({scope:false});ctx.fetchJsonData=async()=>({items:[valid]});await ctx.load();assert.equal(ctx.items.length,0);assert.equal(ctx.loadFailed,false);
});
test('과거 의료 선택값과 알 수 없는 분류는 코스 기본값으로 복귀하며 저장 코스·후기 키를 수정하지 않는다',()=>{
 const init=app.slice(app.indexOf("let exploreLayer='outing'"),app.indexOf('let fuelRadius='));
 for(const stored of ['er','pharmacy','unknown',null]){
  const calls=[],storage=new Map([['nallae-explore-layer',stored],['nallae-plans-v1','keep-plans'],['nallae-reviews-v1','keep-reviews']]);
  const ctx={localStorage:{getItem:k=>storage.get(k),setItem:(...x)=>calls.push(x),removeItem:(...x)=>calls.push(x)}};vm.createContext(ctx);vm.runInContext(init,ctx);
  assert.equal(vm.runInContext('exploreLayer',ctx),'outing');assert.equal(calls.length,0);assert.equal(storage.get('nallae-plans-v1'),'keep-plans');assert.equal(storage.get('nallae-reviews-v1'),'keep-reviews');
 }
 for(const stored of ['weather','parking','fuel','festival','food','places','outing']){
  const ctx={localStorage:{getItem:k=>k==='nallae-explore-layer'?stored:null}};vm.createContext(ctx);vm.runInContext(init,ctx);assert.equal(vm.runInContext('exploreLayer',ctx),stored);
 }
});

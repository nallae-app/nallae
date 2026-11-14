import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const script=fs.readFileSync(new URL('../../web/release-update.js',import.meta.url),'utf8');
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function setup(fetcher){
 const handlers={},buttons=[{disabled:false,textContent:'적용',addEventListener:(_name,fn)=>handlers.apply=fn}],banner={hidden:true},destinations=[];
 const location={protocol:'https:',href:'https://example.test/nallae/?travel=1',replace:url=>destinations.push(url)};
 let fetches=0;const reg={update:async()=>{}};
 const document={hidden:false,documentElement:{dataset:{appVersion:'84'}},getElementById:()=>banner,querySelectorAll:()=>buttons,addEventListener:(name,fn)=>handlers[name]=fn};
 vm.runInNewContext(script,{document,location,navigator:{serviceWorker:{addEventListener:(name,fn)=>handlers[name]=fn,register:async()=>reg}},window:{addEventListener:(name,fn)=>handlers[name]=fn},Number,Math,Date,URL,AbortController,setTimeout:()=>1,clearTimeout:()=>{},fetch:async(...args)=>{fetches++;return fetcher(...args);}});
 return {handlers,banner,destinations,buttons,get fetches(){return fetches;}};
}
test('새 릴리스 확인은 입력 중 화면을 강제로 다시 열지 않고 명시적 적용 때만 이동한다',async()=>{
 const s=setup(async()=>({ok:true,json:async()=>({version:85})}));await settle();
 assert.equal(s.banner.hidden,false);assert.equal(s.destinations.length,0);s.handlers.apply();await settle();
 assert.equal(new URL(s.destinations[0]).searchParams.get('appv'),'85');assert.equal(new URL(s.destinations[0]).searchParams.get('travel'),'1');
});
test('오프라인·잘못된 버전·현재 버전은 새 버전으로 오인하거나 화면을 바꾸지 않는다',async()=>{
 for(const fetcher of [async()=>{throw Error('offline');},async()=>({ok:true,json:async()=>({version:'85'})}),async()=>({ok:true,json:async()=>({version:84})})]){
  const s=setup(fetcher);await settle();assert.equal(s.banner.hidden,true);assert.equal(s.destinations.length,0);
 }
});
test('설치 HTML·worker·release 파일과 정적 자산 버전이 함께 일치한다',()=>{
 const html=fs.readFileSync(new URL('../../web/index.html',import.meta.url),'utf8'),sw=fs.readFileSync(new URL('../../web/sw.js',import.meta.url),'utf8'),release=JSON.parse(fs.readFileSync(new URL('../../web/data/app-release.json',import.meta.url)));
 assert.ok(html.includes('data-app-version="'+release.version+'"'));assert.ok(sw.includes("nallae-v"+release.version+"'"));
 for(const match of html.matchAll(/(?:src|href)="((?!vendor\/)[^"?]+\.(?:js|css))\?v=(\d+)"/g)){assert.equal(Number(match[2]),release.version);assert.ok(sw.includes("'"+match[1]+"'"),'precache source '+match[1]);}
 assert.ok(sw.includes("path+'?v="+release.version+"'"));
});

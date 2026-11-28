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
test('두 시작 문서와 버전이 지정된 자산은 현재 릴리스의 설치 캐시에 들어간다', () => {
 const webRoot = new URL('../../web/', import.meta.url);
 const sw = fs.readFileSync(new URL('sw.js', webRoot), 'utf8');
 const release = JSON.parse(fs.readFileSync(new URL('data/app-release.json', webRoot)));
 const base = new URL('https://example.test/nallae/');
 const installed = vm.runInNewContext(sw + '\n;({version: VERSION, paths: SHELL})', {
  importScripts() {},
  self: {addEventListener() {}},
 });
 assert.equal(installed.version, 'nallae-v' + release.version);
 const cached = new Set(installed.paths.map(path => new URL(path, base).href));
 for (const path of installed.paths) {
  const onDisk = new URL(path, webRoot);
  onDisk.search = '';
  assert.ok(fs.existsSync(onDisk), '설치 캐시에 지정했으나 배포본에 없는 파일 ' + path);
 }
 for (const document of ['index.html', 'explore.html']) {
  const html = fs.readFileSync(new URL(document, webRoot), 'utf8');
  assert.ok(html.includes('data-app-version="' + release.version + '"'), document);
  assert.ok(cached.has(new URL(document, base).href), '설치 문서 ' + document);
  assert.match(html, /id="app-update"/, '업데이트 안내 ' + document);
  assert.match(html, /src="(?:\.\/)?release-update\.js\?v=\d+"/, '업데이트 스크립트 ' + document);
  for (const [, reference] of html.matchAll(/(?:src|href)="([^"#]+\.(?:js|css)(?:\?[^"#]+)?)"/g)) {
   const asset = new URL(reference, base);
   if (asset.origin !== base.origin) continue;
   if (!asset.pathname.startsWith(base.pathname + 'vendor/')) {
    assert.equal(asset.searchParams.get('v'), String(release.version), reference);
   }
   assert.ok(cached.has(asset.href), '오프라인 자산 ' + reference);
   assert.ok(fs.existsSync(new URL(asset.pathname.slice(base.pathname.length), webRoot)), reference);
  }
 }
});

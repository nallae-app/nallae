import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const scopeSource=fs.readFileSync(new URL('../../web/release-scope.js',import.meta.url),'utf8');
const source = fs.readFileSync(new URL('../../web/sw.js', import.meta.url), 'utf8');
function worker(fetch, previous = new Map()) {
  const handlers = {}, writes = [];
  let deadline;
  let storing;
  const cacheStarted = new Promise(resolve => { storing = resolve; });
  const cache = { match: async request => previous.has(typeof request==='string'?request:request.url) ? new Response(previous.get(typeof request==='string'?request:request.url)) : undefined, put: async (request, response) => { storing(); writes.push([typeof request==='string'?request:request.url, await response.text()]); } };
  vm.runInNewContext(scopeSource+'\n'+source, {
    importScripts:()=>{},
    self: { addEventListener: (name, fn) => handlers[name] = fn },
    location: { origin: 'https://example.test' }, URL, Request, Response, Headers, AbortController,
    setTimeout: fn => { deadline = fn; return 1; }, clearTimeout: () => {}, fetch,
    caches: { keys: async () => [source.match(/const VERSION = '([^']+)'/)[1]], open: async () => cache, match: async request => previous.has(typeof request==='string'?request:request.url) ? new Response(previous.get(typeof request==='string'?request:request.url)) : undefined },
  });
  return {
    writes, cacheStarted, expire: () => deadline(),
    request(path,navigate=false) {
      let response;
      const request=new Request('https://example.test/nallae/'+path);
      handlers.fetch({ request:navigate?{url:request.url,method:'GET',mode:'navigate'}:request, respondWith: p => { response = p; }, waitUntil: p => p.catch(() => {}) });
      return response;
    },
  };
}
test('코스·식당·지역 자료도 첫 요청부터 새 정상 응답을 쓰며 캐시에 보관한다', async () => {
  for (const path of ['data/places.json', 'data/outings/index.json', 'data/outings/11440.json', 'data/place-locations.json', 'data/heritage-restaurants.json']) {
    const previous = new Map([['https://example.test/nallae/' + path, 'old']]);
    const sw = worker(async () => new Response('fresh'), previous);
    assert.equal(await (await sw.request(path)).text(), 'fresh');
    assert.deepEqual(sw.writes, [['https://example.test/nallae/' + path, 'fresh']]);
  }
});
test('오류 응답은 기존 정상 자료를 덮지 않고 캐시로 돌아간다', async () => {
  const sw = worker(async () => new Response('error', { status: 503 }), new Map([['https://example.test/nallae/data/places.json', 'previous']]));
  assert.equal(await (await sw.request('data/places.json')).text(), 'previous');
  assert.equal(sw.writes.length, 0);
});
test('응답이 멈추면 제한시간에 중단하고 캐시를 쓰며, 캐시도 없으면 명시적 네트워크 실패다', async () => {
  const blocked = (_request, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('timeout'))));
  const sw = worker(blocked, new Map([['https://example.test/nallae/data/outings/index.json', 'previous']]));
  const pending = sw.request('data/outings/index.json'); sw.expire();
  assert.equal(await (await pending).text(), 'previous');
  const empty = worker(blocked), missing = empty.request('data/places.json'); empty.expire();
  assert.equal((await missing).type, 'error');
});
test('정적 지도 경계는 느린 네트워크를 기다리지 않고 캐시로 시작한다', async () => {
  const sw = worker(() => new Promise(() => {}), new Map([['https://example.test/nallae/data/regions.json', 'map']]));
  assert.equal(await (await sw.request('data/regions.json')).text(), 'map');
});
test('헤더만 도착하고 본문이 멈춘 응답도 중단 후 정상 캐시로 돌아간다', async () => {
  const headersOnly = (_request, { signal }) => {
    const body = new ReadableStream({ start(controller) { signal.addEventListener('abort', () => controller.error(new Error('body timeout'))); } });
    return Promise.resolve(new Response(body));
  };
  const sw = worker(headersOnly, new Map([['https://example.test/nallae/data/places.json', 'previous']]));
  const pending = sw.request('data/places.json'); await sw.cacheStarted; sw.expire();
  assert.equal(await (await pending).text(), 'previous');
  assert.equal(sw.writes.length, 0);
});

function activation(cached, failedPut = false) {
  const handlers={}, removed=[];let claimed=false;
  const stores=new Map(Object.entries(cached).map(([name,items])=>[name,new Map(Object.entries(items))]));
  const cache=name=>({
    keys:async()=>[...(stores.get(name)||new Map()).keys()].map(url=>new Request(url)),
    delete:async req=>stores.get(name)?.delete(req.url),
    match:async req=>stores.get(name)?.has(req.url)?new Response(stores.get(name).get(req.url)):undefined,
    put:async(req,res)=>{if(failedPut)throw Error('quota');stores.get(name).set(req.url,await res.text());},
  });
  vm.runInNewContext(scopeSource+'\n'+source,{importScripts:()=>{},self:{addEventListener:(name,fn)=>handlers[name]=fn,clients:{claim:async()=>{claimed=true;}}},location:{origin:'https://example.test'},URL,Request,Response,AbortController,setTimeout,clearTimeout,fetch:async()=>{throw Error('offline');},caches:{
    keys:async()=>[...stores.keys()],open:async name=>{if(!stores.has(name))stores.set(name,new Map());return cache(name);},delete:async name=>{removed.push(name);stores.delete(name);},
  }});
  return {stores,removed,get claimed(){return claimed;},run(){let done;handlers.activate({waitUntil:p=>done=p});return done;},request(path){let response;handlers.fetch({request:new Request('https://example.test/nallae/'+path),respondWith:p=>response=p});return response;}};
}
test('앱 업데이트는 최신 정상 동네 자료를 이관하고 옛 껍데기만 지운다',async()=>{
  const url='https://example.test/nallae/data/places.json',map='https://example.test/nallae/data/regions.json';
  const sw=activation({'nallae-v9':{[url]:'old', [map]:'old map'},'nallae-v77':{[url]:'last normal'},'nallae-v999':{'https://example.test/future':'installing'},'other-app':{'https://example.test/other':'unrelated'}});
  await sw.run();const active=source.match(/const VERSION = '([^']+)'/)[1];
  assert.equal(sw.stores.get(active).get(url),'last normal');assert.equal(sw.stores.get(active).has(map),false);
  assert.deepEqual(sw.removed,['nallae-v77','nallae-v9']);assert.equal(sw.stores.get('other-app').get('https://example.test/other'),'unrelated');assert.equal(sw.stores.get('nallae-v999').get('https://example.test/future'),'installing');assert.equal(sw.claimed,true);
});
test('자료 이관의 저장공간 오류에도 마지막 정상 사본을 삭제하지 않는다',async()=>{
  const url='https://example.test/nallae/data/outings/index.json',sw=activation({'nallae-v77':{[url]:'last normal'}},true);
  await sw.run();assert.equal(sw.stores.get('nallae-v77').get(url),'last normal');assert.deepEqual(sw.removed,[]);assert.equal(sw.claimed,true);
});

test('이관 실패 뒤 오프라인에서도 가장 최근 정상 버전 자료를 골라 복구한다',async()=>{
 const url='https://example.test/nallae/data/places.json';
 const sw=activation({'nallae-v9':{[url]:'oldest'},'nallae-v77':{[url]:'last normal'},'other-app':{[url]:'unrelated'}},true);
 await sw.run();assert.equal(await(await sw.request('data/places.json')).text(),'last normal');
 assert.equal((await sw.request('data/missing.json')).type,'error');
});

test('새 문서를 우선 사용하고 오프라인에서 식사 홈과 지도 링크가 각각 원래 문서를 연다', async () => {
 const base = 'https://example.test/nallae/';
 const previous = new Map([[base + 'index.html', 'home'], [base + 'explore.html', 'map']]);
 const fresh = worker(async () => new Response('updated', {headers: {'content-type': 'text/html'}}), previous);
 assert.equal(await (await fresh.request('?appv=84', true)).text(), 'updated');
 const offline = worker(async () => { throw Error('offline'); }, previous);
 for (const [path, expected] of [
  ['', 'home'], ['?appv=84', 'home'], ['index.html', 'home'],
  ['explore.html?travel=1&appv=84', 'map'], ['explore.html?view=saved', 'map'],
 ]) {
  assert.equal(await (await offline.request(path, true)).text(), expected, path);
 }
 const bad = worker(async () => new Response('bad', {status: 404}), previous);
 assert.equal(await (await bad.request('index.html', true)).text(), 'home');
 assert.equal(await (await bad.request('explore.html?view=courses', true)).text(), 'map');
 assert.equal(bad.writes.length, 0);
});
test('릴리스 확인은 오래된 JSON을 최신인 것처럼 반환하지 않는다',async()=>{
 const sw=worker(async()=>{throw Error('offline');},new Map([['https://example.test/nallae/data/app-release.json','{"version":83}']]));
 await assert.rejects(sw.request('data/app-release.json'));assert.equal(sw.writes.length,0);
});

test('버전이 지정된 프로그램은 열린 문서 뒤에서 다른 버전으로 교체하지 않는다',async()=>{
 let requests=0;const sw=worker(async()=>{requests++;return new Response('future');},new Map([['https://example.test/nallae/app.js?v=84','v84']]));
 assert.equal(await(await sw.request('app.js?v=84')).text(),'v84');assert.equal(requests,0);assert.equal(sw.writes.length,0);
});

test('종료된 자료 URL은 구 캐시와 서버가 있어도 410이며 네트워크로 가지 않는다',async()=>{
 let calls=0;
 for(const path of ['data/er.json','data/pharmacy/index.json','data/pharmacy/11440.json?old=1','data/demo-er.json','data/demo-pharmacy/11440.json','data/earthquake.json','data/warnings.json','data/disaster-old.json','data/sms.json','data/pharmacy%2F11440.json']){
  const sw=worker(async()=>{calls++;return new Response('old dataset');},new Map([['https://example.test/nallae/'+path,'old cached dataset']]));
  assert.equal((await sw.request(path)).status,410,path);
 }
 assert.equal(calls,0);
});
test('네트워크와 오프라인 뉴스 모두 공유 범위 표식과 실제 내용 검증을 통과한 일반 소식만 반환한다',async()=>{
 const safe={id:'local',src:'brief',cat:'생활',title:'서울 공원 야간 개장 안내',time:new Date().toISOString(),contentScope:'local-life-v1'};
 const data={updated:'2026-11-26T11:00:00Z',contentScope:'local-life-v1',sources:{brief:{ok:true},sms:{ok:true},wrn:{ok:true}},items:[safe,{...safe,id:'unmarked',contentScope:undefined},{...safe,id:'hidden',body:'재난 대응 안내'},{...safe,id:'sms',src:'sms'}]};
 const old=new Map([['https://example.test/nallae/data/news.json',JSON.stringify(data)]]);
 for(const fetch of [async()=>new Response(JSON.stringify(data)),async()=>{throw Error('offline');}]){
  const out=await(await worker(fetch,old).request('data/news.json')).json();
  assert.deepEqual(out.items,[safe]);assert.deepEqual(Object.keys(out.sources),['brief']);assert.equal(out.updated,data.updated);
 }
});
test('업데이트 이관 실패 중에도 폐기 자료와 옛 뉴스는 삭제하고 마지막 정상 장소·다른 앱·미래 캐시는 보존한다',async()=>{
 const base='https://example.test/nallae/',active=source.match(/const VERSION = '([^']+)'/)[1];
 const sw=activation({'nallae-v92':{[base+'data/er.json']:'medical',[base+'data/pharmacy/11440.json']:'medical',[base+'data/news.json']:'old news',[base+'data/outings/index.json']:'saved places'},[active]:{[base+'index.html']:'current shell'},'other-app':{[base+'data/er.json']:'unrelated'},'nallae-v999':{[base+'data/er.json']:'future'}},true);
 await sw.run();const old=sw.stores.get('nallae-v92');
 assert.equal(old.has(base+'data/er.json'),false);assert.equal(old.has(base+'data/pharmacy/11440.json'),false);assert.equal(old.has(base+'data/news.json'),false);
 assert.equal(old.get(base+'data/outings/index.json'),'saved places');assert.equal(sw.stores.get('other-app').get(base+'data/er.json'),'unrelated');assert.equal(sw.stores.get('nallae-v999').get(base+'data/er.json'),'future');
 assert.equal((await sw.request('data/er.json')).status,410);
});

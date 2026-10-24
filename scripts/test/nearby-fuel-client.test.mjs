import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function setup(fetcher){const ctx={fetch:fetcher,AbortSignal,Date,Math,Map,Set,Number,String,Object};vm.createContext(ctx);for(const name of ['local-scope','discovery','nearby-fuel'])vm.runInContext(fs.readFileSync(new URL('../../web/'+name+'.js',import.meta.url),'utf8'),ctx);return ctx.NallaeNearbyFuel.createClient({fetcher});}
const q={lat:37.654,lon:127.056,radius:5000,product:'B027'};
const data={complete:true,radius:5000,product:'B027',asOf:'2026-10-25T00:00:00Z',stations:[{id:'near-expensive',lat:37.655,lon:127.056,price:{B027:2500}},{id:'far-cheap',lat:37.67,lon:127.056,price:{B027:1800}},{id:'outside',lat:36.3,lon:127.4,price:{B027:1500}}]};
test('클라이언트: 좌표는 URL 아닌 POST 본문, 가격 무관한 목록 유지, 정렬 전환 캐시 재사용',async()=>{
  let calls=0;const client=setup(async(url,opts)=>{calls++;assert.ok(!url.includes('37.654'));assert.equal(opts.method,'POST');assert.equal(JSON.parse(opts.body).lat,q.lat);return {ok:true,json:async()=>data};});
  const out=await client.load(q);assert.equal(out.stations.length,2);assert.equal(out.stations[0].price.B027,2500);assert.equal(client.peek(q).status,'ready');
  await client.load({...q,sort:'price'});assert.equal(calls,1);
});
test('서버 준비·한도·잘못된 유종 응답은 전체 조회 성공으로 포장하지 않음',async()=>{
  for(const error of ['not-configured','quota','upstream']){const client=setup(async()=>({ok:false,json:async()=>({error})}));await assert.rejects(client.load(q),new RegExp(error));assert.equal(client.peek(q).status,'error');}
  const bad=setup(async()=>({ok:true,json:async()=>({...data,product:'D047'})}));await assert.rejects(bad.load(q),/invalid-response/);
});

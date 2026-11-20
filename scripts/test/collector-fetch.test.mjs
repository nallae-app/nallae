import test from 'node:test';
import assert from 'node:assert/strict';
import { createCollectorFetch } from '../lib/collector-fetch.mjs';

const disconnected=()=>Object.assign(new TypeError('fetch failed'),{cause:{code:'UND_ERR_CONNECT_TIMEOUT'}});
test('재시도에도 최초 요청의 전체 제한 signal을 그대로 사용한다',async()=>{
  const controller=new AbortController(),signals=[];
  const fetch=createCollectorFetch(async(_url,options)=>{signals.push(options.signal);if(signals.length===1)throw disconnected();return new Response('ok');},{wait:async()=>{}});
  assert.equal(await (await fetch('https://apis.data.go.kr/data',{signal:controller.signal})).text(),'ok');
  assert.deepEqual(signals,[controller.signal,controller.signal]);
});
test('재시도 대기 중 원래 제한시간이 끝나면 새 제한시간으로 재요청하지 않는다',async()=>{
  let calls=0;
  const signal=AbortSignal.timeout(15),fetch=createCollectorFetch(async()=>{calls++;throw disconnected();},{retryDelayMs:1000});
  await assert.rejects(fetch('https://apis.data.go.kr/data',{signal}),error=>error.name==='AbortError'||error.name==='TimeoutError');
  assert.equal(calls,1);
});
test('호스트 연결이 계속 실패하면 남은 격자 요청을 차단하고 다른 출처는 계속 받는다',async()=>{
  let calls=0;
  const fetch=createCollectorFetch(async url=>{calls++;if(String(url).includes('apis.data.go.kr'))throw disconnected();return new Response('news');},{failureThreshold:2,wait:async()=>{}});
  await assert.rejects(fetch('https://apis.data.go.kr/a'));assert.equal(calls,2);
  await assert.rejects(fetch('https://apis.data.go.kr/b'));assert.equal(calls,2);
  assert.equal(await (await fetch('https://www.safetydata.go.kr/a')).text(),'news');assert.equal(calls,3);
});
test('복구 대기 뒤 연결이 성공하면 차단을 해제한다',async()=>{
  let clock=0,broken=true;
  const fetch=createCollectorFetch(async()=>{if(broken)throw disconnected();return new Response('recovered');},{failureThreshold:2,cooldownMs:100,now:()=>clock,wait:async()=>{}});
  await assert.rejects(fetch('https://apis.data.go.kr/a'));clock=101;broken=false;
  assert.equal(await (await fetch('https://apis.data.go.kr/a')).text(),'recovered');
});
test('HTTP401·500은 접속 실패로 오인하지 않고 키나 URL을 오류에 노출하지 않는다',async()=>{
  let calls=0;
  const fetch=createCollectorFetch(async()=>{calls++;return new Response('denied',{status:401});});
  assert.equal((await fetch('https://apis.data.go.kr/a')).status,401);assert.equal(calls,1);
  const offline=createCollectorFetch(async()=>{throw disconnected();},{failureThreshold:1});
  await assert.rejects(offline('https://apis.data.go.kr/a?serviceKey=private-secret'),error=>!error.message.includes('private-secret')&&!error.message.includes('serviceKey'));
});
test('Node 연결 AggregateError 내부의 ETIMEDOUT도 감지한다',async()=>{
 let calls=0;
 const fetch=createCollectorFetch(async()=>{calls++;throw new TypeError('fetch failed',{cause:new AggregateError([Object.assign(new Error('connect'),{code:'ETIMEDOUT'})])});},{failureThreshold:1});
 await assert.rejects(fetch('https://apis.data.go.kr/a'),e=>e.code==='ETIMEDOUT');
 await assert.rejects(fetch('https://apis.data.go.kr/b'));
 assert.equal(calls,1);
});

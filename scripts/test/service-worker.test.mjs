import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../web/sw.js', import.meta.url), 'utf8');
function worker(fetch, previous = new Map()) {
  const handlers = {}, writes = [];
  let deadline;
  let storing;
  const cacheStarted = new Promise(resolve => { storing = resolve; });
  const cache = { put: async (request, response) => { storing(); writes.push([request.url, await response.text()]); } };
  vm.runInNewContext(source, {
    self: { addEventListener: (name, fn) => handlers[name] = fn },
    location: { origin: 'https://example.test' }, URL, Request, Response, AbortController,
    setTimeout: fn => { deadline = fn; return 1; }, clearTimeout: () => {}, fetch,
    caches: { open: async () => cache, match: async request => previous.has(request.url) ? new Response(previous.get(request.url)) : undefined },
  });
  return {
    writes, cacheStarted, expire: () => deadline(),
    request(path) {
      let response;
      handlers.fetch({ request: new Request('https://example.test/nallae/' + path), respondWith: p => { response = p; }, waitUntil: p => p.catch(() => {}) });
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

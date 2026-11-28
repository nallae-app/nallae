import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import * as topojson from 'topojson-client';

const read = path => fs.readFileSync(new URL('../../web/' + path, import.meta.url), 'utf8');
const source = read('meals/restaurant-region.js');
const topology = JSON.parse(read('data/regions.json'));
function setup(fetch) {
  const ctx = vm.createContext({ fetch, AbortController, setTimeout, clearTimeout, topojson });
  vm.runInContext(source, ctx);
  return ctx.JippiRestaurantRegion;
}

test('홀·섬·행정경계의 경계선 위를 구분한다', () => {
  const { containsPoint } = setup();
  const box = (min,max) => [[min,min],[min,max],[max,max],[max,min],[min,min]];
  const geometry = { type: 'MultiPolygon', coordinates: [[box(0,5),box(1,4)],[box(6,7)]] };
  for (const point of [[0.5,0.5],[6.5,6.5]]) assert.equal(containsPoint(geometry,point),true);
  for (const point of [[3,3],[0,0],[0,3],[1,2],[7,6.5],[8,8]]) assert.equal(containsPoint(geometry,point),false);
});

test('좌표는 전송하지 않고 시군구 자료 하나를 재사용한다', async () => {
  const urls = [];
  const { find } = setup(async url => {
    urls.push(url);
    return { ok: true, json: async () => topology };
  });
  assert.equal(await find(null),null);
  assert.equal(urls.length,0);
  assert.deepEqual(await Promise.all([
    find({lat:37.5663,lon:126.9779}), // 서울시청·중구
    find({lat:35.1796,lon:129.0756}), // 부산시청·연제구
    find({lat:35.68,lon:139.76}), // 국외
    find({lat:37.00,lon:124.60}), // 서해
  ]),['11140','26470',null,null]);
  assert.deepEqual(urls,['data/regions.json']);
});

test('경계 수신 실패 후 다시 시도할 수 있다', async () => {
  let requests = 0;
  const { find } = setup(async () => ({ ok: ++requests > 1, json: async () => topology }));
  const point = {lat:37.5663,lon:126.9779};
  assert.equal(await find(point),null);
  assert.equal(await find(point),'11140');
  assert.equal(requests,2);
});

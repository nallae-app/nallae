import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const code = readFileSync(new URL('../../web/meals/restaurant-location.js', import.meta.url), 'utf8');

function fixture(query, geolocationSupported = true) {
  const calls = [], changes = [], timers = new Map();
  let now = Date.UTC(2026, 10, 28), nextTimer = 0;
  const browser = {
    geolocation: geolocationSupported ? {
      getCurrentPosition(ok, fail, options) { calls.push({ ok, fail, options }); },
    } : undefined,
    permissions: query && { query },
  };
  const win = vm.createContext({
    Date: { now: () => now },
    clearTimeout(id) { timers.delete(id); },
    setTimeout(fn, ms) {
      const id = ++nextTimer;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
  });
  vm.runInContext(code, win);
  const controller = win.JippiRestaurantLocation.create(browser, s => changes.push(s.status));
  function advance(ms) {
    now += ms;
    for (const [id, timer] of timers) {
      if (timer.at <= now) { timers.delete(id); timer.fn(); }
    }
  }
  const position = (lat = 37.5, lon = 127, age = 0) =>
    ({ coords: { latitude: lat, longitude: lon }, timestamp: now - age });
  return { controller, calls, advance, changes, position };
}

test('외식 탭 진입 시 이미 허용한 기기에서만 자동 위치 확인', async () => {
  for (const query of [undefined, async () => { throw Error('unsupported'); },
    async () => ({ state: 'prompt' }), async () => ({ state: 'denied' })]) {
    const { controller, calls } = fixture(query);
    await controller.activate();
    assert.equal(calls.length, 0);
    controller.request();
    assert.equal(calls.length, 1);
  }
  const { controller, calls, position, changes } = fixture(async () => ({ state: 'granted' }));
  await controller.activate();
  await controller.activate();
  controller.request();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.enableHighAccuracy, false);
  calls[0].ok(position());
  assert.deepEqual(changes, ['locating', 'ready']);
  assert.equal(controller.getState().point.lon, 127);
});

test('권한 조회가 늦어도 명시 클릭은 즉시 처리하고 숨김·복귀 후 옛 응답은 무시', async () => {
  const queries = [];
  const { controller, calls, position } = fixture(() => new Promise(resolve => queries.push(resolve)));
  const first = controller.activate();
  controller.request();
  assert.equal(calls.length, 1);
  controller.deactivate();
  const second = controller.activate();
  queries[0]({ state: 'granted' });
  await first;
  calls[0].ok(position());
  assert.equal(controller.getState().status, 'idle');
  assert.equal(calls.length, 1);
  queries[1]({ state: 'granted' });
  await second;
  assert.equal(calls.length, 2);
  calls[1].ok(position());
  assert.equal(controller.getState().status, 'ready');
  controller.deactivate();
  assert.equal(controller.getState().point, null);
});

test('오류·무응답 복구와 오래됐거나 잘못된 좌표 제외', async () => {
  const { controller, calls, advance, position } = fixture();
  await controller.activate();
  for (const [code, status] of [[1, 'denied'], [2, 'unavailable'], [3, 'timeout']]) {
    controller.request();
    calls.at(-1).fail({ code });
    assert.equal(controller.getState().status, status);
  }
  controller.request();
  const delayed = calls.at(-1);
  advance(12_001);
  assert.equal(controller.getState().status, 'locating');
  advance(48_000);
  assert.equal(controller.getState().status, 'timeout');
  for (const invalid of [position(91), position(37, 181), position(37, 127, 61_000), {}]) {
    controller.request();
    calls.at(-1).ok(invalid);
    assert.equal(controller.getState().status, 'unavailable');
  }
  controller.request();
  delayed.ok(position());
  assert.equal(controller.getState().status, 'locating');
  calls.at(-1).ok(position());
  assert.equal(controller.getState().status, 'ready');
  advance(5 * 60_000);
  assert.equal(controller.getState().status, 'expired');
  assert.equal(controller.getState().point, null);
});

test('위치 미지원 기기와 실행 중 권한 철회 처리', async () => {
  const absent = fixture(undefined, false).controller;
  await absent.activate();
  assert.equal(absent.getState().status, 'unavailable');
  let listener;
  const permission = {
    state: 'granted',
    addEventListener(_, fn) { listener = fn; },
    removeEventListener(_, fn) { assert.equal(fn, listener); listener = null; },
  };
  const { controller, calls, position } = fixture(async () => permission);
  await controller.activate();
  calls[0].ok(position());
  permission.state = 'denied';
  listener();
  assert.equal(controller.getState().status, 'denied');
  assert.equal(controller.getState().point, null);
  controller.deactivate();
  assert.equal(listener, null);
});

test('공공 주소 좌표는 수록된 식당 한 곳과 연결되고 기존 OSM 좌표를 덮어쓰지 않는다', () => {
  const data = name => JSON.parse(readFileSync(new URL('../../web/data/' + name + '.json', import.meta.url)));
  const restaurants = [...data('places').items, ...data('heritage-restaurants').items];
  const ids = new Set(restaurants.map(restaurant => restaurant.id));
  const { items, sourceDate, url } = data('meal-restaurant-coordinates');
  const existing = data('place-locations').items;
  assert.match(sourceDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(url, 'https://www.data.go.kr/data/15083033/fileData.do');
  assert.ok(Object.keys(items).length > 0);
  for (const [id, point] of Object.entries(items)) {
    assert.ok(ids.has(id), id);
    assert.equal(Object.hasOwn(existing, id), false, id);
    assert.ok(Number.isFinite(point.lat) && point.lat >= 33 && point.lat <= 39, id);
    assert.ok(Number.isFinite(point.lon) && point.lon >= 124 && point.lon <= 132, id);
  }
});

test('탄탄면공방은 입점 건물 공식 안내에 표시된 별도 출처와 대표 좌표를 쓴다', () => {
  const catalog = JSON.parse(readFileSync(new URL('../../web/data/meal-restaurant-coordinates.json', import.meta.url)));
  const point = catalog.items['menu-dandan-starfield-goyang'];
  assert.deepEqual([point.lat, point.lon], [37.646840, 126.895316]);
  assert.equal(point.url, 'https://www.starfield.co.kr/goyang/about/directions.do');
  assert.equal(point.basis, '입점 건물 대표 좌표');
});

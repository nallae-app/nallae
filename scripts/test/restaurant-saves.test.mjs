import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const program = readFileSync(new URL('../../web/restaurant-saves.js',import.meta.url),'utf8');
const key = 'nallae-saved-places-v1';

function tab(storage, locks) {
  const events = new EventTarget();
  const ctx = vm.createContext({localStorage:storage, navigator:{locks}, window:events, EventTarget, Event});
  vm.runInContext(program,ctx);
  return {store:ctx.JippiRestaurantSaves, events};
}
function storage(initial) {
  const data = new Map();
  if (initial) data.set(key, JSON.stringify(initial));
  return {getItem:k=>data.get(k) ?? null, setItem:(k,v)=>data.set(k,v)};
}

test('기존 저장 식당을 보존하며 홈·탐색 탭 동시 저장 및 재시도 시 한 번만 반영', async () => {
  const db = storage(['옛-목록에-없는-식당']);
  let tail = Promise.resolve();
  const locks = {request(name,fn) {
    assert.equal(name,key);
    tail = tail.then(fn);
    return tail;
  }};
  const home = tab(db,locks), explore = tab(db,locks);
  let changes = 0;
  const unsubscribe = home.store.subscribe(()=>changes++);
  await Promise.all([home.store.setSaved('강원-칼국수',true),explore.store.setSaved('부산-밀면',true)]);
  assert.deepEqual(JSON.parse(db.getItem(key)),['옛-목록에-없는-식당','강원-칼국수','부산-밀면']);
  home.events.dispatchEvent(Object.assign(new Event('storage'), {key}));
  assert.equal(home.store.size,3);
  assert.equal(changes,2);
  const again = await home.store.setSaved('강원-칼국수',true);
  assert.ok(again.ok && again.saved);
  assert.equal(changes,2);
  unsubscribe();
  await explore.store.setSaved('강원-칼국수',false);
  home.events.dispatchEvent(new Event('pageshow'));
  assert.equal(home.store.has('강원-칼국수'),false);
  assert.equal(changes,2);
  assert.ok(tab(db).store.has('옛-목록에-없는-식당'));
});

test('저장 한도·기기 저장 실패·형식 오류 시 기존 값과 표시 상태 보존', async () => {
  const ids = Array.from({length:500},(_,i)=>'p-'+i);
  const db = storage(ids), {store} = tab(db);
  const result = await store.setSaved('new',true);
  assert.equal(result.reason,'limit');
  assert.equal(store.has('new'),false);
  assert.deepEqual(JSON.parse(db.getItem(key)),ids);
  const setItem = db.setItem;
  db.setItem = () => {throw Error('quota');};
  const remove = await store.setSaved('p-1',false);
  assert.equal(remove.reason,'storage');
  assert.ok(remove.saved && store.has('p-1'));
  db.setItem = setItem;
  assert.ok((await store.setSaved('p-1',false)).ok);
  assert.ok((await store.setSaved('new',true)).ok);
  assert.equal((await store.setSaved('',true)).reason,'invalid');
  db.setItem(key,'{"old-format":true}');
  assert.equal((await store.setSaved('b',true)).reason,'storage');
  assert.equal(db.getItem(key),'{"old-format":true}');
  assert.ok(store.has('new'));
});

test('손상된 JSON은 저장 동작 때 원문과 마지막 정상 식당을 보존한다', async () => {
  const db = storage(['처음']);
  const home = tab(db).store;
  db.setItem(key, '[broken');
  assert.ok((await home.setSaved('다음',true)).ok);
  assert.equal(db.getItem(key+'-invalid-json'),'[broken');
  assert.deepEqual(JSON.parse(db.getItem(key)),['처음','다음']);
});

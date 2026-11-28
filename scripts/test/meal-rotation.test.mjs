import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = (file) => readFileSync(new URL('../../web/' + file, import.meta.url), 'utf8');
const calendar = vm.createContext({});
vm.runInContext(source('meals/menu-calendar.js'), calendar);
const epochDay = date => Date.parse(date + 'T00:00:00Z') / 86400000;
const firstMonday = epochDay('2026-11-23');
const meal = day => calendar.mealForDay(day);

test('첫 4주에는 서로 다른 집밥 28개·외식 28개와 각각에 맞는 이미지가 있다', () => {
  const cooks = new Set(), dining = new Set(), images = new Set();
  for (let offset = 0; offset < 28; offset++) {
    const {cook, dine} = meal(firstMonday + offset);
    cooks.add(cook.name);
    dining.add(dine.name);
    for (const item of [cook, dine]) {
      assert.ok(item.image.endsWith('.webp'));
      images.add(item.image);
    }
    assert.equal(cook.steps.length, 3);
    assert.ok(cook.steps.every(step => step.length > 10));
    assert.match(cook.ingredients, /[0-9¼⅓½]/);
    assert.ok(cook.intro && cook.tip && dine.note);
  }
  assert.equal(cooks.size, 28);
  assert.equal(dining.size, 28);
  assert.equal(images.size, 56);
  assert.equal(meal(epochDay('2026-11-28')).cook.name, '대파간장 두부덮밥');
  assert.equal(meal(epochDay('2026-11-29')).cook.name, '두부된장국');
  assert.equal(meal(epochDay('2026-11-30')).cook.name, '토마토달걀볶음');
});

test('과거·연말·윤일 포함 4년 동안 연속 4개 같은 요일에 중복이 없고 다음 4주의 조합은 바뀐다', () => {
  for (let day = epochDay('2025-01-01'); day < epochDay('2029-01-01'); day++) {
    const current = meal(day);
    for (const kind of ['cook', 'dine']) {
      assert.notEqual(current[kind].name, meal(day + 1)[kind].name);
      assert.equal(new Set([0, 7, 14, 21].map(delta => meal(day + delta)[kind].name)).size, 4);
      assert.notEqual(current[kind].name, meal(day + 28)[kind].name);
    }
    assert.equal(meal(day).cook.name, current.cook.name);
  }
  const pairs = new Set();
  for (let offset = 0; offset < 196; offset++) {
    const {cook, dine} = meal(firstMonday + offset);
    pairs.add(cook.name + '/' + dine.name);
  }
  assert.equal(pairs.size, 196);
});

test('한국 자정과 복귀에서 오늘·내일 및 실제 메뉴의 장보기가 함께 바뀐다', () => {
  const app = source('meals/app.js');
  const functions = ['issue', 'renderShopping', 'refreshDate'].map(name => {
    const match = app.match(new RegExp('function ' + name + '\\([^]*?\\n}'));
    assert.ok(match, name);
    return match[0];
  }).join('\n');
  const displayedOffsets = [];
  let shopping = [];
  let now = Date.parse('2026-11-28T14:59:59.950Z');
  let delay;
  let timer;
  class Clock extends Date { static now() { return now; } }
  const context = vm.createContext({
    Date: Clock, clearTimeout() {},
    setTimeout(callback, duration) {timer = callback; delay = duration;},
    selectDay(offset) {displayedOffsets.push(offset);},
    document: {
      querySelector: () => ({replaceChildren(...rows){shopping = rows.map(row => row.textContent);}}),
      createElement: () => ({}),
    },
  });
  vm.runInContext(source('meals/menu-calendar.js'), context);
  const timeConstants = app.slice(app.indexOf('const dayMs ='), app.indexOf('const shortDate ='));
  vm.runInContext(timeConstants + '\nlet baseDay = koreaDay(Date.now()), midnightTimer;\n' + functions, context);
  assert.equal(context.issue(0).cook.name, '대파간장 두부덮밥');
  assert.equal(context.issue(1).cook.name, '두부된장국');
  context.renderShopping();
  assert.ok(shopping.some(row => row.includes('두부 1모(300g)')));
  context.refreshDate();
  assert.equal(delay, 100);
  now += 100;
  timer();
  assert.equal(context.issue(0).cook.name, '두부된장국');
  assert.equal(context.issue(1).dine.name, '쌀국수');
  assert.deepEqual(displayedOffsets, [0]);
  context.renderShopping();
  assert.ok(shopping.includes('내일 · 토마토달걀볶음'));
  now = Date.parse('2026-12-05T03:00:00Z');
  context.refreshDate();
  context.renderShopping();
  assert.ok(shopping.includes('오늘 · 양배추달걀토스트'));
  assert.ok(!shopping.some(row => row.includes('두부 1모(300g)')));
  assert.match(app, /addEventListener\('pageshow', refreshDate\)/);
  assert.match(app, /if \(!document\.hidden\) refreshDate\(\)/);
  assert.ok(source('index.html').indexOf('meals/menu-calendar.js') < source('index.html').indexOf('meals/app.js'));
});

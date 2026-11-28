import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read = name => readFileSync(new URL('../../web/' + name, import.meta.url), 'utf8');
const context = vm.createContext({});
for (const file of ['local-scope.js', 'meals/restaurant-match.js', 'meals/menu-calendar.js']) {
  vm.runInContext(read(file), context);
}
const {find} = context.JippiMealRestaurants;
const catalog = ['places', 'heritage-restaurants'].flatMap(name => JSON.parse(read('data/' + name + '.json')).items);
const place = (id, food) => ({id, name:id, food, district:'서울 종로구', address:'서울 종로구 ' + id});

test('28개 외식 모두 등록 메뉴가 일치하는 실재 식당과 연결된다', () => {
  const start = Date.UTC(2026, 10, 23) / 86400000;
  const menus = new Set(Array.from({length:28}, (_, i) => context.mealForDay(start + i).dine.name));
  assert.equal(menus.size, 28);
  for (const menu of menus) {
    const rows = find(menu, catalog);
    assert.ok(rows.length > 0, menu);
    assert.equal(new Set(rows.map(r => r.place.id)).size, rows.length);
    assert.ok(rows.every(r => r.place.source && r.place.address && r.place.food && r.distanceKm === null));
  }
});

test('메뉴 표기·명시된 변형을 찾고 상호·비슷한 메뉴·판매 종료는 제외한다', () => {
  const matches = (meal, food) => find(meal, [{...place('가게', food), name:meal}]).length;
  for (const [meal, food] of [['칼국수','샤브손칼국수'],['돈카츠','우동·돈가스'],['우동','수제돈까스\n우동'],['샤크슈카','에그인헬 (브런치)'],['소바','돈까스, 메밀(소바)'],['초밥 모둠','모듬초밥(10p)'],['전주비빔밥','전주 비빔밥'],['치킨 부리토','치킨 브리또']]) {
    assert.equal(matches(meal,food),1,meal+' / '+food);
  }
  for (const [meal, food] of [['소바','마제소바'],['바질페스토 파스타','바질페스토 피자'],['초밥 모둠','모듬회, 초밥'],['순두부찌개','순두부'],['전주비빔밥','비빔밥'],['돈카츠','돈코츠 라멘'],['우동','볶음우동'],['칼국수',null],['칼국수','칼국수 (판매 종료)']]) {
    assert.equal(matches(meal,food),0,meal+' / '+food);
  }
});

test('가게 좌표가 있는 식당만 직선 거리로 정렬하고 위치가 없으면 지역·상호 순서로 보여준다', () => {
  const points = {나:{lat:37.5,lon:127},다:{lat:37.6,lon:127},라:{lat:0,lon:0}};
  const items = ['다','가','라','나','나'].map(id=>place(id,'손칼국수'));
  const near = find('칼국수',items,points,{lat:37.5,lon:127});
  assert.deepEqual(Array.from(near,r=>r.place.id), ['나','다','가','라']);
  assert.equal(near[0].distanceKm,0);
  assert.ok(near[1].distanceKm>11 && near[1].distanceKm<11.2);
  assert.equal(near[2].distanceKm,null);
  for (const origin of [undefined,{lat:null,lon:127},{lat:37.5,lon:Infinity}]) {
    const rows = find('칼국수',items,points,origin);
    assert.deepEqual(Array.from(rows,r=>r.place.id),['가','나','다','라']);
    assert.ok(rows.every(r=>r.distanceKm===null));
  }
  assert.equal(find('신메뉴',items,points).length,0);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../web/restaurant-focus-map.js',import.meta.url),'utf8');
const point = vm.runInNewContext('('+source.match(/  function restaurantPoint\(id, data\) \{[\s\S]*?\n  \}/)[0]+')');

test('지삐 식당 지도는 양쪽 카탈로그의 검증된 실제 좌표와 해당 출처를 선택한다',()=>{
  const files = new Map(['place-locations','meal-restaurant-coordinates'].map(name => [name,
    JSON.parse(fs.readFileSync(new URL('../../web/data/'+name+'.json',import.meta.url))).items]));
  const cafes = ['places','heritage-restaurants'].flatMap(name=>
    JSON.parse(fs.readFileSync(new URL('../../web/data/'+name+'.json',import.meta.url))).items);
  const verified = cafes.map(c=>point(c.id,files)).filter(Boolean);
  assert.ok(verified.length >= 614);
  assert.ok(verified.some(p=>p.credit==='osm'));
  assert.ok(verified.some(p=>p.credit==='official'));
  assert.ok(verified.some(p=>p.credit==='venue'));
  assert.deepEqual(Array.from(point(cafes.find(c=>c.name==='낭만국시').id,files).at),[37.878117,127.725964]);
  assert.equal(point(cafes.find(c=>c.name==='만우장').id,files),null);
  assert.equal(point('등록 안 된 식당',files),null);
});

test('좌표 누락·범위 오류는 행정 중심점 또는 다른 가게 위치로 바뀌지 않는다',()=>{
  const files=new Map([['place-locations', {bad:{lat:0,lon:0},name:{lat:null,lon:128}}],['meal-restaurant-coordinates',{bad:{lat:37.4,lon:127},other:{lat:37.3,lon:127.2}}]]);
  assert.equal(point('bad',files).credit,'official');
  assert.equal(point('name',files),null);
  assert.equal(point('missing',files),null);
});

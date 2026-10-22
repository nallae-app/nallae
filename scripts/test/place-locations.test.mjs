import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=name=>JSON.parse(fs.readFileSync(new URL('../../web/data/'+name,import.meta.url),'utf8'));
test('식당 좌표는 수록 식당·허용 범위·공개 OSM 근거와 연결된다',()=>{
 const places=new Set(read('places.json').items.map(x=>x.id)),data=read('place-locations.json');
 assert.equal(data.license,'ODbL-1.0');assert.ok(Object.keys(data.items).length>0);
 for(const [id,p] of Object.entries(data.items)){
  assert.ok(places.has(id));assert.ok(Number.isFinite(p.lat)&&p.lat>=33&&p.lat<=39);assert.ok(Number.isFinite(p.lon)&&p.lon>=124&&p.lon<=132);
  assert.match(p.sourceUrl,/^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/\d+$/);assert.ok(p.basis);assert.match(p.checkedAt,/^\d{4}-\d{2}-\d{2}$/);
 }
});

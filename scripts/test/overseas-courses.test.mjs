import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const catalogue=JSON.parse(fs.readFileSync(new URL('../../web/data/overseas-courses.json',import.meta.url)));
function setup(){const window={};vm.runInNewContext(fs.readFileSync(new URL('../../web/overseas-courses.js',import.meta.url),'utf8'),{window,URL,Set,JSON});return window.JippiTravel;}
test('해외 코스는 실제 제공 도시와 같은 도시 장소 두 곳만 참조한다',()=>{
 const m=setup();assert.equal(m.validate(catalogue),catalogue);assert.equal(catalogue.cities.length,3);assert.equal(catalogue.courses.length,6);
 const bad=structuredClone(catalogue);bad.courses[0].stopIds[1]='cn-shanghai-bund';assert.throws(()=>m.validate(bad));
 const range=structuredClone(catalogue);range.places[0].lat=91;assert.throws(()=>m.validate(range));
 const unsafe=structuredClone(catalogue);unsafe.places[0].source.url='javascript:alert(1)';assert.throws(()=>m.validate(unsafe));
});
test('일본 링크는 공개 장소명 검색·도보 URL, 중국에는 잘못된 도보 경로를 만들지 않는다',()=>{
 const m=setup();for(const course of catalogue.courses){const city=catalogue.cities.find(x=>x.id===course.cityId),stops=course.stopIds.map(id=>catalogue.places.find(x=>x.id===id));const search=new URL(m.placeUrl(stops[0],city));assert.equal(search.searchParams.get('api'),'1');assert.ok(search.searchParams.get('query').includes(stops[0].nameLocal));if(city.countryCode==='CN')assert.equal(m.routeUrl(stops,city),'');else{const route=new URL(m.routeUrl(stops,city));assert.equal(route.searchParams.get('travelmode'),'walking');assert.ok(route.searchParams.get('destination').includes(stops[1].nameLocal));}}
});
test('여행 저장은 별도 키로만 쓰며 손상·저장 실패에도 기존 자료를 덮지 않는다',()=>{
 const m=setup(),store=new Map([['nallae-saved-plans','domestic'],[m.KEY,'["jp-osaka-river-alley"]']]);const storage={getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)};
 const saved=m.readSaved(storage);assert.equal(saved.size,1);saved.add('cn-shanghai-river');m.writeSaved(saved,storage);assert.equal(store.get('nallae-saved-plans'),'domestic');assert.equal(m.readSaved(storage).size,2);
 assert.equal(m.readSaved({getItem:()=>'{broken'}).size,0);assert.throws(()=>m.writeSaved(saved,{setItem:()=>{throw Error('quota');}}));assert.equal(m.readSaved(storage).size,2);
});
test('여행 카드의 자료 텍스트는 HTML 실행 없이 표시하고 중국에는 현지어 복사를 제공한다',()=>{
 const m=setup(),data=structuredClone(catalogue);data.courses[0].title='<img src=x onerror=alert(1)>';const html=m.card(data.courses[0],data,new Set());assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));
 const cn=data.courses.find(x=>x.cityId==='cn-shanghai');const card=m.card(cn,data,new Set());assert.ok(card.includes('현지어 이름·주소 복사'));assert.ok(!card.includes('Google 도보 경로'));assert.ok(!card.includes('평점'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=name=>fs.readFileSync(new URL('../../'+name,import.meta.url),'utf8');
const catalog=JSON.parse(read('web/data/discovery-shelf.json'));
const ctx={};vm.createContext(ctx);
for(const name of ['local-scope','discovery','discovery-shelf'])vm.runInContext(read('web/'+name+'.js'),ctx);
const {validate,render}=ctx.JippiDiscoveryShelf;
const copy=()=>structuredClone(catalog);

test('첫 화면 세 조합은 실제 지역 자료의 필드를 그대로 보존하고 기존 저장 ID와 순서가 일치한다',()=>{
  assert.equal(validate(catalog),catalog);
  assert.deepEqual(catalog.items.map(x=>x.city),['부산','서울','제주']);
  for(const p of catalog.items){
    const regional=JSON.parse(read('web/data/outings/'+p.stops[0].sgg+'.json')).items;
    for(const stop of p.stops)assert.deepEqual(stop,regional.find(x=>x.id===stop.id));
    const snapshot=ctx.NallaeDiscovery.snapshotPlan(p,'2026-11-14T00:00:00Z');
    assert.ok(snapshot);assert.equal(snapshot.id,p.id);assert.equal(snapshot.meters,p.meters);
    assert.deepEqual(Array.from(snapshot.stops,x=>x.id),p.stops.map(x=>x.id));
    assert.equal(p.sourceType,'editorial-pair');assert.equal(p.stops.length,2);
  }
});

test('없는 장소·다른 ID·잘못된 좌표·과도한 거리·제보 위장 자료는 선반에 표시하지 않는다',()=>{
  const mutations=[
    d=>d.items[0].stops.pop(),
    d=>d.items[0].id='invented',
    d=>d.items[0].stops[0].lat=null,
    d=>d.items[0].stops[1].lat+=1,
    d=>d.items[0].meters=10,
    d=>d.items[0].sourceType='community',
    d=>d.items[0].stops[1].sgg='11440',
    d=>d.items.push(structuredClone(d.items[0]))
  ];
  for(const mutate of mutations){const d=copy();mutate(d);assert.equal(validate(d),null);assert.equal(render({catalog:d}),'');}
  assert.equal(render(),'');
});

test('활성 도시와 저장 상태만 렌더하며 원본/저장 상태는 바꾸지 않고 모든 외부 문구를 escape한다',()=>{
  const d=copy(),p=d.items[1];p.title='<img src=x onerror="bad()">';p.city='서울<script>bad()</script>';p.reason='" & 방문 수 없음';p.stops[0].name="공원 <이름> '문자'";
  const before=JSON.stringify(d),saved=new Set([p.id]);const html=render({catalog:d,activeIndex:1,saved});
  assert.equal(JSON.stringify(d),before);assert.equal(saved.size,1);
  assert.ok(!html.includes('<img'));assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;img'));assert.ok(html.includes('&amp;'));assert.ok(html.includes('&#39;문자&#39;'));
  assert.match(html,/data-discover-open="1"/);assert.match(html,/data-discover-save="1" aria-pressed="true"/);
  assert.ok(!html.includes('data-discover-map'));assert.match(html,/data-outing-choose/);
  assert.ok(!html.includes(catalog.items[0].stops[0].name));
  assert.equal((html.match(/role="tabpanel"/g)||[]).length,1);
  assert.equal((html.match(/aria-selected="true"/g)||[]).length,1);
  assert.match(html,/직선 약 789m/);assert.match(html,/거리로 묶은 두 곳/);
  assert.match(render({catalog,activeIndex:-1}),/data-discover-open="0"/);
  assert.match(render({catalog,saved:[catalog.items[0].id]}),/aria-pressed="true"/);
});

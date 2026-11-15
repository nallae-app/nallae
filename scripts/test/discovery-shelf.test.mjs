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
  assert.ok(!html.includes('<img src=x'));assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;img'));assert.ok(html.includes('&amp;'));assert.ok(html.includes('&#39;문자&#39;'));
  assert.match(html,/data-discover-open="1"/);assert.match(html,/data-discover-save="1" aria-pressed="true"/);
  assert.ok(!html.includes('data-discover-map'));assert.match(html,/data-outing-choose/);
  assert.ok(!html.includes(catalog.items[0].stops[0].name));
  assert.ok(!html.includes('role="tablist"'));assert.ok(!html.includes('role="tabpanel"'));
  assert.match(html,/data-discover-city-picker="1"/);
  assert.match(html,/직선 789m/);assert.match(html,/두 지점의 직선 연결 · 실제 길 아님/);
  assert.match(render({catalog,activeIndex:-1}),/data-discover-open="0"/);
  assert.match(render({catalog,saved:[catalog.items[0].id]}),/aria-pressed="true"/);
});


test('사진 표지는 안전한 로컬 자산과 출처 메타데이터만 허용하며 원본 저장 구조는 보존한다',()=>{
  const d=copy(),p=d.items[0];
  assert.equal(p.title,'책 사이로, 공원 곁으로');
  const html=render({catalog:d});
  assert.match(html,/src="images\/courses\/bosu-books\.webp"/);
  assert.match(html,/data-discover-photo-source="0"/);
  assert.match(html,/부산관광공사/);assert.match(html,/하이픈그룹/);
  assert.equal(ctx.NallaeDiscovery.snapshotPlan(p,'2026-11-14T00:00:00Z').id,p.id);
  for(const [key,value] of [['placeId',p.stops[1].id],['placeId','unrelated-landmark'],['src','https://example.com/x.webp'],['src','images/courses/../x.webp'],['src','images/courses/x.webp" onerror="bad()'],['sourceUrl','javascript:alert(1)'],['licenseUrl','data:text/html,x'],['year','2024'],['width',-1],['height','675'],['author',''],['objectPosition','0% 100%; background:url(x)'],['objectPosition','101% 50%']]){
    const bad=copy();bad.items[0].cover[key]=value;assert.equal(validate(bad),null);assert.equal(render({catalog:bad}),'');
  }
  const external=copy();external.items[0].stops[0].sourceUrl='javascript:alert(1)';assert.equal(validate(external),null);
  d.items[0].cover.author='<script>bad()</script>';d.items[0].cover.alt='" onerror="bad()';
  const escaped=render({catalog:d});assert.ok(!escaped.includes('<script>'));assert.match(escaped,/&lt;script&gt;/);assert.match(escaped,/alt="&quot; onerror=&quot;bad\(\)"/);
});

test('사진 없는 도시는 좌표의 북쪽 방향과 동일 축척을 보존한 두 점만 표시한다',()=>{
  for(const index of [1,2]){
    const fixture=copy();delete fixture.items[index].cover;const p=fixture.items[index],html=render({catalog:fixture,activeIndex:index});
    assert.ok(!html.includes('discover-cover-photo'));assert.ok(!html.includes('data-discover-photo-source'));
    assert.match(html,/북쪽 ↑/);assert.match(html,/점선은 실제 길이 아닙니다/);
    const positions=[...html.matchAll(/transform="translate\(([-\d.]+) ([-\d.]+)\)"/g)].map(m=>[+m[1],+m[2]]);
    assert.equal(positions.length,2);
    const [a,b]=p.stops,dx=(b.lon-a.lon)*Math.cos((a.lat+b.lat)/2*Math.PI/180),dy=b.lat-a.lat;
    const sx=positions[1][0]-positions[0][0],sy=positions[0][1]-positions[1][1];
    assert.equal(Math.sign(sx),Math.sign(dx));assert.equal(Math.sign(sy),Math.sign(dy));
    assert.ok(Math.abs(sx*dy-sy*dx)<.0001,'두 축은 동일한 축척이어야 한다');
    for(const [x,y] of positions){assert.ok(x>=54&&x<=306);assert.ok(y>=39&&y<=95);}
  }
});

 test('첫 장소 사진의 연결은 장소 ID로 검증하며 코스 순서나 실제 장소를 사진에 맞춰 바꾸지 않는다',()=>{
  for(let index=0;index<catalog.items.length;index++){
    const item=catalog.items[index];if(!item.cover)continue;
    assert.equal(item.cover.placeId,item.stops[0].id);
    assert.ok(fs.existsSync(new URL('../../web/'+item.cover.src,import.meta.url)));
    const html=render({catalog,activeIndex:index});
    assert.ok(html.includes('첫 장소 · '+item.stops[0].name));
    assert.ok(html.includes('width="'+item.cover.width+'" height="'+item.cover.height+'"'));
    assert.match(html,/discover-cover-photo/);assert.match(html,/class="discover-photo-fallback" hidden/);assert.match(html,/사진을 불러오지 못했어요/);
    const mismatch=copy();mismatch.items[index].cover.placeId=item.stops[1].id;assert.equal(validate(mismatch),null);
  }
});

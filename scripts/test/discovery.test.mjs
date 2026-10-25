import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ctx={};vm.createContext(ctx);
for(const name of ['local-scope','discovery'])vm.runInContext(fs.readFileSync(new URL('../../web/'+name+'.js',import.meta.url),'utf8'),ctx);
const {planId,plans,snapshotPlan}=ctx.NallaeDiscovery;
const origin=[37.65,127.06];
const stop=(id,lat,type='park',kind='근린공원')=>({id,name:id,lat,lon:127.06,type,kind,address:'공개 장소 주소',source:'공개 자료',referenceDate:'2026-10-25'});
const food=stop('식당',37.65,'restaurant','소개된 식당'),park=stop('공원',37.655),attraction=stop('관광지',37.66,'attraction','관광지');

test('코스 ID v2는 실제 방문 순서와 임의 ID 구분자를 보존한다',()=>{
  assert.equal(planId([food,park]),'v2:'+JSON.stringify(['식당','공원']));
  assert.notEqual(planId([food,park]),planId([park,food]));
  assert.notEqual(planId([{id:'a|b'},{id:'c'}]),planId([{id:'a'},{id:'b|c'}]));
});

test('자동 코스 방향은 출발점·입력 순서가 바뀌어도 고정되며 명시한 역방향 후기는 분리한다',()=>{
  const spots=[park,attraction];
  for(const stopCount of [2,3]){
    const one=plans(spots,[food],{origin:[37.645,127.06],originRadius:10000,stopCount,seed:'fixed'});
    const two=plans([...spots].reverse(),[food],{origin:[37.67,127.06],originRadius:10000,stopCount,seed:'fixed'});
    assert.equal(one[0].id,two[0].id);assert.deepEqual(Array.from(one[0].stops,x=>x.id),Array.from(two[0].stops,x=>x.id));
    assert.notEqual(planId(one[0].stops),planId([...one[0].stops].reverse()));
  }
});

test('세 장소 자동 코스는 종류가 서로 다르고 두 구간의 합이 3km 이내다',()=>{
  const xs=plans([park,attraction],[food],{origin,originRadius:5000,stopCount:3,limit:3,seed:'today'});
  assert.equal(xs.length,1);const p=xs[0];
  assert.equal(p.stops.length,3);assert.equal(p.stops[0].id,food.id);assert.equal(p.withFood,true);
  assert.equal(p.legMeters.length,2);assert.ok(p.legMeters.every(m=>m>=100&&m<=2000));assert.ok(p.meters<=3000);
  assert.equal(p.id,planId(p.stops));assert.match(p.reason,/소개된 식당/);assert.match(p.reason,/근린공원/);assert.match(p.reason,/관광지/);
  assert.deepEqual(xs.map(x=>x.id),plans([park,attraction],[food],{origin,originRadius:5000,stopCount:3,limit:3,seed:'today'}).map(x=>x.id));
});

test('세 장소 자동 코스에서 공원만 세 곳·반복 종류·원점 밖·총거리 초과를 제외한다',()=>{
  const options={origin,originRadius:5000,stopCount:3};
  assert.equal(plans([park,stop('체육',37.66,'park','체육공원'),stop('문화',37.665,'park','문화공원')],[],options).length,0);
  assert.equal(plans([park,stop('다른 근린',37.66)],[food],options).length,0);
  assert.equal(plans([park,attraction],[food],{...options,originRadius:1000}).length,0);
  assert.equal(plans([stop('먼 공원',37.666),stop('먼 관광지',37.682,'attraction','관광지')],[food],options).length,0);
  assert.equal(plans([park,attraction],[food],{...options,stopCount:4}).length,0);
});

test('두 장소 자동 코스는 unordered 후보 중복 없이 ordered ID를 반환하고 최대 6개다',()=>{
  const spots=Array.from({length:20},(_,i)=>stop('공원'+i,37.65+i*.0015,'park',i%2?'체육공원':'근린공원'));
  const xs=plans(spots,[food],{origin,originRadius:5000,seed:'today',limit:99});
  assert.equal(xs.length,6);assert.equal(xs[0].withFood,true);
  assert.equal(new Set(xs.flatMap(p=>p.stops.map(x=>x.id))).size,xs.length*2);
  assert.ok(xs.every(p=>p.id===planId(p.stops)));
  assert.equal(plans(spots,[food],{limit:0}).length,0);
});

test('옛 코스 저장을 읽으면 실제 순서로 v2 ID를 재계산하고 생성일·공개 출처를 보존한다',()=>{
  const legacy={id:'식당|공원',stops:[food,park],createdAt:'2026-10-20T12:00:00Z',origin:[37.65,127.06],approachMeters:10,privateNote:'저장하면 안 됨'};
  const saved=snapshotPlan(legacy),loaded=snapshotPlan(JSON.parse(JSON.stringify(saved)));
  assert.equal(saved.id,planId([food,park]));assert.equal(loaded.id,saved.id);assert.equal(loaded.createdAt,legacy.createdAt);
  assert.deepEqual(Array.from(loaded.stops,x=>x.id),['식당','공원']);assert.equal(loaded.stops[0].source,'공개 자료');
  assert.equal(loaded.origin,undefined);assert.equal(loaded.approachMeters,undefined);assert.equal(loaded.privateNote,undefined);
  const a=stop('a',37.65),b=stop('b',37.655);
  assert.equal(snapshotPlan({id:'a|b',stops:[b,a]}).id,planId([a,b]),'순서 없는 옛 자동 코스는 최초 이전 때만 정규화한다');
  assert.equal(snapshotPlan({id:planId([b,a]),stops:[b,a]}).id,planId([b,a]),'순서 있는 새 개인 기록은 뒤집지 않는다');
  assert.equal(snapshotPlan({id:'old',stops:[b,a],sourceType:'community'}).id,planId([b,a]),'명시적으로 제보한 방문 순서는 뒤집지 않는다');
});

test('공개 장소 3·4개 저장은 순서·제보 식별자만 보존하고 거리·중복·잘못된 좌표는 거부한다',()=>{
  const three=snapshotPlan({stops:[food,park,attraction]});assert.equal(three.stops.length,3);assert.equal(three.legMeters.length,2);
  const stops=Array.from({length:4},(_,i)=>stop('장소'+i,37.65+i*.004));
  const saved=snapshotPlan({stops,sourceType:'community',communityId:'approved-1',author:'비공개 이름',community:{ip:'비공개'}});
  assert.equal(saved.stops.length,4);assert.equal(saved.sourceType,'community');assert.equal(saved.communityId,'approved-1');assert.equal(saved.author,undefined);assert.equal(saved.community,undefined);
  assert.equal(snapshotPlan({stops:[food,food,attraction]}),null);
  assert.equal(snapshotPlan({stops:[food,{...park,lat:null}]}),null);
  assert.equal(snapshotPlan({stops:[food,stop('너무 가까움',37.65001)]}),null);
  assert.equal(snapshotPlan({stops:[food,stop('먼 곳',37.68)]}),null);
  assert.equal(snapshotPlan({stops:Array.from({length:4},(_,i)=>stop('긴 구간'+i,37.65+i*.016))}),null);
  assert.equal(snapshotPlan({stops:[...stops,stop('다섯째',37.67)]}),null);
});

test('방문 제보 저장·복원에도 재방문 이유와 광고 관계를 유지하고 비공개 필드는 버린다',()=>{
  const details={reason:'직접 다녀온 이유',caution:'방문 전 확인할 점',recentVisit:'2026-10',relationship:'compensated',email:'비공개'};
  const saved=snapshotPlan({stops:[food,park],sourceType:'community',communityId:'approved-1',reason:details.reason,communityDetails:details});
  const restored=snapshotPlan(JSON.parse(JSON.stringify(saved)));
  assert.equal(restored.reason,details.reason);assert.equal(restored.communityDetails.relationship,'compensated');
  assert.equal(restored.communityDetails.recentVisit,'2026-10');assert.equal(restored.communityDetails.caution,details.caution);
  assert.equal(restored.communityDetails.email,undefined);
  assert.equal(snapshotPlan({stops:[food,park],communityDetails:details}).communityDetails,undefined);
});

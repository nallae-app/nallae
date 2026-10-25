import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const ctx={URL};vm.createContext(ctx);vm.runInContext(fs.readFileSync(new URL('../../web/community.js',import.meta.url),'utf8'),ctx);
const api=ctx.NallaeCommunity,now='2026-10-25T00:00:00Z',options={now};
const plain=x=>JSON.parse(JSON.stringify(x));
const place=(id='park-a')=>({id,name:'동네 공원',address:'서울특별시 노원구 공개 주소',lat:37.654,lon:127.056,source:'공개 장소 자료',sourceUrl:'https://example.com/places/'+id,referenceDate:'2026-10-01'});
const submission=(extra={})=>({kind:'place',title:'제가 다녀온 동네 공원',stops:[place()],recentVisit:'2026-10',reason:'산책 장소로 제보해요.',caution:'방문 전에 개방 여부를 확인해 주세요.',relationship:'none',consent:{publication:true,sourceDetails:true},...extra});
const approved=(extra={})=>submission({id:'community-1',status:'approved',checked:true,checkedAt:'2026-10-25',...extra});

test('입력 중 초안은 빈 칸과 미확인 좌표 허용, 알려진 필드만 보존',()=>{
  const draft=api.normalizeDraft({kind:'course',origin:[45.123456,135.654321],email:'private@example.com',stops:[{name:' 아직 확인 중 ',source:'직접 방문',userGps:{lat:45.123456}}]});
  assert.equal(draft.stops[0].id,'submitted-1');assert.equal(draft.stops[0].name,'아직 확인 중');assert.equal(draft.stops[0].lat,null);
  assert.equal(draft.origin,undefined);assert.equal(draft.email,undefined);assert.equal(draft.stops[0].userGps,undefined);
  assert.equal(api.validateSubmission(draft,options),null);
});

test('이해관계는 직접 선택하기 전까지 빈 값으로 유지',()=>{
  for(const relationship of [undefined,'','unknown']){
    const draft=api.normalizeDraft(submission({relationship}));
    assert.equal(draft.relationship,'');
    assert.equal(api.validateSubmission(draft,options),null);
  }
  for(const relationship of ['none','owner','compensated'])assert.equal(api.normalizeDraft({relationship}).relationship,relationship);
});

test('목록에 없는 곳 제보는 상호·주소·출처를 갖추면 좌표 없이 제출 가능',()=>{
  const input=submission({stops:[{name:'새로 제보한 곳',address:'서울 노원구 공개 주소',source:'직접 방문'}]});
  const result=api.validateSubmission(input,options);assert.ok(result);assert.equal(result.stops[0].lat,null);assert.equal(result.stops[0].lon,null);
  assert.equal(result.stops[0].id,'submitted-1');assert.equal(api.parseCatalog({schemaVersion:1,items:[{...input,id:'item',status:'approved',checked:true}]},options).items.length,0);
});

test('완성 제보는 동의·이해관계·방문월·장소수와 좌표 쌍을 엄격 확인',()=>{
  assert.ok(api.validateSubmission(submission(),options));
  for(const input of [submission({consent:{publication:false,sourceDetails:true}}),submission({relationship:'unknown'}),submission({recentVisit:'2026-11'}),submission({recentVisit:'2026-13'}),submission({reason:''}),submission({stops:[{...place(),lon:null}]}),submission({stops:[{...place(),lat:0,lon:0}]}),submission({stops:[{...place(),source:'',sourceUrl:''}]}),submission({stops:[place(),place('b')]})])assert.equal(api.validateSubmission(input,options),null);
  assert.ok(api.validateSubmission(submission({kind:'course',stops:[place(),{...place('b'),name:'다른 장소',lat:37.66}]}),options));
  assert.equal(api.validateSubmission(submission({kind:'course',stops:[place()]}),options),null);
});

test('공개 링크는 http(s)만, 자격증명 링크·가짜 기준일·미래 기준일 거부',()=>{
  for(const sourceUrl of ['javascript:alert(1)','data:text/html,test','file:///private','https://name:secret@example.com'])assert.equal(api.validateSubmission(submission({stops:[{...place(),sourceUrl}]}),options),null);
  for(const referenceDate of ['2026-02-30','2026-10-26'])assert.equal(api.validateSubmission(submission({stops:[{...place(),referenceDate}]}),options),null);
  assert.ok(api.validateSubmission(submission({stops:[{...place(),source:'',sourceUrl:'https://example.com/place'}]}),options));
});

test('카탈로그는 운영 확인·공개 동의·공개 좌표가 있는 승인 항목만 게시',()=>{
  const data={schemaVersion:1,items:[approved(),approved({id:'pending',status:'pending'}),approved({id:'unchecked',checked:false}),approved({id:'no-consent',consent:{publication:true,sourceDetails:false}}),approved({id:'unknown-coordinate',stops:[{...place('x'),lat:null,lon:null}]}),approved({id:'future-check',checkedAt:'2026-10-26'})]};
  const parsed=api.parseCatalog(data,options);assert.equal(parsed.valid,true);assert.equal(parsed.items.length,1);assert.equal(parsed.rejected,5);
  assert.equal(parsed.items[0].verification,'unverified');assert.equal(parsed.items[0].status,'approved');
  assert.equal(api.parseCatalog({schemaVersion:2,items:[]},options).valid,false);
  assert.equal(api.parseCatalog({schemaVersion:1,items:[]},options).valid,true);
});

test('카탈로그의 중복 게시 ID와 같은 장소 ID의 충돌 좌표를 거부',()=>{
  const parsed=api.parseCatalog({schemaVersion:1,items:[approved(),approved(),approved({id:'other',stops:[{...place(),lat:37.7}]})]},options);
  assert.equal(parsed.items.length,1);assert.equal(parsed.rejected,2);
});

test('순서 있는 v2 코스 ID는 구분자 포함 ID도 충돌 없이 구분',()=>{
  assert.equal(api.orderedPlanId([{id:'a|b'},{id:'c'}]),'v2:["a|b","c"]');
  assert.notEqual(api.orderedPlanId(['a|b','c']),api.orderedPlanId(['a','b|c']));
  assert.notEqual(api.orderedPlanId(['a','b']),api.orderedPlanId(['b','a']));
  assert.equal(api.orderedPlanId(['a','a']),null);assert.equal(api.orderedPlanId(['a']),null);
});

test('별점은 전체 코스 개인 메모만, 별점 1~5와 500자 한도를 적용하며 GPS 제외',()=>{
  const review=api.normalizeReview({stops:[place(),place('b')],rating:'5',text:' 다음에 다시 가고 싶어요. ',origin:[45.123456,135.654321],nickname:'저장하지 않을 이름'},options);
  assert.deepEqual(plain(review),{schemaVersion:1,planId:'v2:["park-a","b"]',scope:'course',rating:5,text:'다음에 다시 가고 싶어요.',updatedAt:new Date(now).toISOString()});
  assert.equal(review.origin,undefined);assert.equal(review.nickname,undefined);
  for(const rating of [0,6,4.5,true,null,'5.0'])assert.equal(api.normalizeReview({planId:review.planId,rating,text:''},options),null);
  assert.equal(api.normalizeReview({planId:review.planId,rating:5,text:'가'.repeat(501)},options),null);
  assert.equal(api.normalizeReview({planId:review.planId,rating:5,scope:'restaurant'},options),null);
  assert.ok(api.normalizeReview({planId:review.planId,rating:5,updatedAt:'2026-10-26T00:00:00Z'},options),'기기 시계가 뒤로 가도 이미 기록한 메모를 버리지 않는다');
});

test('개인 메모 복원은 정규화 ID만 허용하고 순서가 다른 코스에 붙이지 않음',()=>{
  const planId=api.orderedPlanId(['a','b']);
  assert.ok(api.normalizeReview({planId,rating:3,text:''},options));
  assert.equal(api.normalizeReview({planId:'v2:[ "a", "b" ]',rating:3},options),null);
  assert.equal(api.normalizeReview({planId,stops:[{id:'b'},{id:'a'}],rating:3},options),null);
  assert.equal(api.normalizeReview({planId,stops:[{id:'a'},{id:'a'}],rating:3},options),null);
  assert.equal(api.normalizeReview({planId:'a|b',rating:3},options),null);
});

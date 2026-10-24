import test from 'node:test';
import assert from 'node:assert/strict';
import {tourItems,fetchTourism} from '../sources/tourism.mjs';
const row={contentid:'123',contenttypeid:'39',title:'시험 식당',addr1:'서울특별시 노원구 동일로 1414',mapx:'127.0568',mapy:'37.6542',modifiedtime:'20261025090000'};
test('관광정보: 실제 좌표·주소 지역 대조, 중복·유형·좌표 없는 곳 처리',()=>{
  const list=tourItems([row,row,{...row,contentid:'124',mapx:'127.4',mapy:'36.3'},{...row,contentid:'125',mapx:'0',mapy:'0'},{...row,contentid:'126',contenttypeid:'32'}]);
  assert.equal(list.length,3);assert.equal(list[0].sgg,'11350');assert.ok(list[0].lat);
  assert.equal(list[1].lat,undefined);assert.equal(list[2].lat,undefined);assert.equal(list[0].sourceDate,'2026-10-25');
  assert.equal(list[0].rating,undefined);assert.equal(list[0].firstimage,undefined);
});
const response=(items,total=items.length)=>({ok:true,text:async()=>JSON.stringify({response:{header:{resultCode:'0000'},body:{items:{item:items},totalCount:total}}})});
test('관광정보 전체 수집 확인 및 오류 시 비밀키·응답 원문 비노출',async()=>{
  const good=await fetchTourism({key:'secret',types:['39'],fetcher:async()=>response([row])});assert.equal(good.complete,true);assert.equal(good.items.length,1);
  await assert.rejects(fetchTourism({key:'secret',types:['39'],fetcher:async()=>response([row],2)}),/중복 페이지/);
  await assert.rejects(fetchTourism({key:'secret',types:['39'],fetcher:async()=>({ok:true,text:async()=>'<error>secret</error>'})}),e=>!e.message.includes('secret'));
  await assert.rejects(fetchTourism({key:'secret',types:['39'],fetcher:async()=>response([],0)}),/전체 건수/);
});

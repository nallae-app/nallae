import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildHeritage} from '../build-heritage-restaurants.mjs';
test('최신 지정+음식 업종 근거가 모두 있는 곳만, 비식품·타지역·중복 제외',()=>{
  const current=[{업체명:'동네집',업체주소:'서울 마포구 월드컵로 1'},{업체명:'동네집',업체주소:'대전 동구 중앙로 1'},{업체명:'안경집',업체주소:'서울 마포구 월드컵로 2'},{업체명:'족발공장',업체주소:'서울 마포구 월드컵로 3'}];
  const legacy=[{업체명:'동네집',기본주소:'서울 마포구 월드컵로 1',주요사업:'한식'},{업체명:'안경집',기본주소:'서울 마포구 월드컵로 2',주요사업:'안경'},{업체명:'족발공장',기본주소:'서울 마포구 월드컵로 3',주요사업:'식품가공(족발)'}];
  const data=buildHeritage([...current,current[0]],legacy);assert.equal(data.items.length,1);assert.equal(data.items[0].sgg,'11440');
  assert.equal(data.items[0].sourceDate,'2026-08-20');assert.equal(data.items[0].kindDate,'2022-07-13');assert.equal(data.items[0].source.type,'heritage');
  assert.equal('lat' in data.items[0],false);assert.equal('연락처' in data.items[0],false);
});
test('실제 확대 자료: 400곳 이상, 출처·주소·자료 시각, 가짜 평점·좌표 없음',()=>{
  const data=JSON.parse(fs.readFileSync(new URL('../../web/data/heritage-restaurants.json',import.meta.url),'utf8'));
  assert.ok(data.items.length>=400);assert.ok(new Set(data.items.map(x=>x.sgg)).size>=150);
  assert.equal(new Set(data.items.map(x=>x.id)).size,data.items.length);
  for(const x of data.items){assert.ok(x.name&&x.address&&x.food);assert.equal(x.source.type,'heritage');assert.equal('rating' in x,false);assert.equal('lat' in x,false);}
});

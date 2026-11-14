import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app=fs.readFileSync(new URL('../../web/app.js',import.meta.url),'utf8');
const note=app.match(/function outingCoreFailureNote\([^]*?\n}/)?.[0];assert.ok(note);

test('코스 식당자료 안내는 실제 실패만 설명하고 미지원 좌표·초기로딩·저장화면과 구분한다',()=>{
  const ctx={savedView:false,outingTheme:'date',exploreFailed:new Set(),placesData:null,placeLocations:null};
  vm.createContext(ctx);vm.runInContext(note,ctx);
  assert.equal(ctx.outingCoreFailureNote(),'','자료 미도착은 수집 실패가 아님');
  ctx.placesData={items:[{id:'no-verified-coordinate'}]};ctx.placeLocations={items:{}};
  assert.equal(ctx.outingCoreFailureNote(),'','정상 좌표 파일에서 누락된 식당은 수집 실패가 아님');
  ctx.exploreFailed.add('place-locations');ctx.placeLocations=null;
  const fallback=ctx.outingCoreFailureNote();assert.match(fallback,/식당 위치 자료를 받지 못해 공원·관광지로/);
  assert.equal((fallback.match(/<button /g)||[]).length,1);assert.match(fallback,/data-outing-core-retry/);
  ctx.placeLocations={items:{}};assert.match(ctx.outingCoreFailureNote(),/이전 자료를 사용/);assert.doesNotMatch(ctx.outingCoreFailureNote(),/공원·관광지로/);
  ctx.savedView=true;assert.equal(ctx.outingCoreFailureNote(),'');
  ctx.savedView=false;ctx.outingTheme='park';assert.equal(ctx.outingCoreFailureNote(),'');
  ctx.outingTheme='date';ctx.exploreFailed.clear();ctx.exploreFailed.add('weather');assert.equal(ctx.outingCoreFailureNote(),'');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app=fs.readFileSync(new URL('../../web/app.js',import.meta.url),'utf8');
function setup(){
  const handlers=new Map(),classes=new Set(['sheet-scroll']);
  const ctx={mode:'explore',exploreLayer:'outing',savedView:false,exploreChoiceChanged:false,lastUtilityLayer:'weather',festivalPeriod:'all',category:null,outingTheme:'date',selectedFeedPositions:new Map(),
    panel:{scrollTop:230,classList:{contains:c=>classes.has(c)}},feedEl:{scrollTop:165},localStorage:{setItem:()=>{}},
    mobileSheet:{matches:true},sheetStage:2,availableLayers:()=>[['outing','코스'],['weather','날씨'],['parking','주차장']],
    map:{closePopup:()=>{}},fitSheet:()=>{},feedTouchAction:()=>{},
    // Preserve the old position when rendering, as DOM replacement does on the real scroller.
    applyMode:()=>{},renderExplore:()=>{},renderFeed:()=>{},
    document:{querySelector:selector=>({addEventListener:(_event,handler)=>handlers.set(selector,handler)}),querySelectorAll:()=>['news','explore'].map(modeChoice=>({dataset:{modeChoice},addEventListener:(_event,handler)=>handlers.set(modeChoice,handler)}))},
    chipsEl:{addEventListener:(_event,handler)=>handlers.set('chips',handler),querySelectorAll:()=>[]},
  };
  vm.createContext(ctx);
  for(const name of ['resetSelectedFeed','selectedFeedKey','rememberSelectedFeed','restoreSelectedFeed']) {
    const helper=app.match(new RegExp('function '+name+'\\([^]*?\\n}'))?.[0];assert.ok(helper,name);vm.runInContext(helper,ctx);
  }
  return {ctx,handlers};
}
test('코스 아래를 읽다가 생활 화면을 고르면 실제 스크롤 컨테이너 두 곳이 첫 정보로 돌아온다',()=>{
  const {ctx,handlers}=setup();
  const registration=app.split('\n').find(l=>l.startsWith("document.querySelector('[data-open-utilities]').addEventListener"));
  assert.ok(registration);vm.runInContext(registration,ctx);
  handlers.get('[data-open-utilities]')();
  assert.equal(ctx.exploreLayer,'weather');assert.equal(ctx.panel.scrollTop,0);assert.equal(ctx.feedEl.scrollTop,0);
});
test('생활 분류를 직접 바꿀 때도 panel의 이전 위치를 다음 분류에 넘기지 않는다',()=>{
  const {ctx,handlers}=setup();ctx.exploreLayer='weather';
  const registration=app.match(/chipsEl.addEventListener\('click', \(e\) => {[^]*?\n}\);/)?.[0];
  assert.ok(registration);vm.runInContext(registration,ctx);
  handlers.get('chips')({target:{closest:()=>({dataset:{layer:'parking'}})}});
  assert.equal(ctx.exploreLayer,'parking');assert.equal(ctx.panel.scrollTop,0);assert.equal(ctx.feedEl.scrollTop,0);
});
test('같은 저장 화면을 다시 누르면 읽던 위치를 초기화하지 않는다',()=>{
  const {ctx,handlers}=setup();ctx.savedView=true;ctx.setSheetStage=()=>{};
  const registration=app.split('\n').find(l=>l.startsWith("document.querySelector('[data-open-saved]').addEventListener"));
  assert.ok(registration);vm.runInContext(registration,ctx);
  handlers.get('[data-open-saved]')();
  assert.equal(ctx.panel.scrollTop,230);assert.equal(ctx.feedEl.scrollTop,165);
});

test('소식과 생활을 왕복하면 각 화면의 읽던 위치를 복원하고 코스 위치와 섞지 않는다',()=>{
  const {ctx,handlers}=setup();ctx.exploreLayer='weather';
  const start=app.indexOf("document.querySelectorAll('[data-mode-choice]').forEach(b=>b.addEventListener('click'");
  const end=app.indexOf("map.on('moveend zoomend'",start);
  assert.ok(start>=0&&end>start);vm.runInContext(app.slice(start,end),ctx);
  ctx.applyMode=()=>{ctx.panel.scrollTop=0;ctx.feedEl.scrollTop=0;};
  handlers.get('news')();
  assert.equal(ctx.panel.scrollTop,0);assert.equal(ctx.feedEl.scrollTop,0);
  ctx.panel.scrollTop=340;ctx.feedEl.scrollTop=85;
  handlers.get('explore')();
  assert.equal(ctx.panel.scrollTop,230);assert.equal(ctx.feedEl.scrollTop,165);
  handlers.get('news')();
  assert.equal(ctx.panel.scrollTop,340);assert.equal(ctx.feedEl.scrollTop,85);
  // Another main screen has its own scroll, not the old shared festivalScroll slot.
  ctx.mode='explore';ctx.exploreLayer='outing';ctx.panel.scrollTop=700;ctx.feedEl.scrollTop=640;
  handlers.get('news')();ctx.exploreLayer='weather';handlers.get('explore')();
  assert.equal(ctx.panel.scrollTop,230);assert.equal(ctx.feedEl.scrollTop,165);
});

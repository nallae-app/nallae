import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const app=fs.readFileSync(new URL('../../web/app.js',import.meta.url),'utf8');
const implementation=app.match(/function setSheetStage\([^]*?\n}/)[0];
function fixture(overrides={}){
  const timers=[],moves=[],element={dataset:{},setAttribute(){},classList:{remove(){}},style:{removeProperty(){}}};
  const ctx={sheetFitTimer:null,sheetStage:1,stages:['collapsed','middle','full'],stageNames:['접힘','중간','전체'],handle:element,panel:element,chipsEl:{},feedEl:{},document:{getElementById:()=>({})},mobileSheet:{matches:true},sheetDrag:null,selection:{codes:new Set(['test'])},selectionAutoFit:true,overseasView:false,savedView:false,outingTheme:'date',atHome:false,homeBounds:{},reducedMotion:{matches:false},cancelRoutePicking(){},applySheetHeight(){},sheetHeights:()=>[],feedTouchAction(){},clearTimeout(){},setTimeout:fn=>{timers.push(fn);return timers.length;},fitHome:()=>moves.push('home'),leftPad:()=>[10,70],bottomPad:()=>[10,150],muniByCode:new Map([['test',{layer:{getBounds:()=>({})}}]]),L:{latLngBounds:()=>({extend(){}})},map:{fitBounds:()=>moves.push('selection')},...overrides};
  vm.createContext(ctx);vm.runInContext(implementation,ctx);
  return {ctx,moves,collapse:()=>ctx.setSheetStage(0,false),flush:()=>timers.forEach(fn=>fn())};
}
test('collapsing a sheet never steals an overseas, travel-saved or manually moved camera',()=>{
  for(const state of [{overseasView:true},{savedView:true,outingTheme:'travel'},{selectionAutoFit:false}]){
    const f=fixture(state);f.collapse();f.flush();assert.deepEqual(f.moves,[],JSON.stringify(state));
  }
  const pending=fixture();pending.collapse();pending.ctx.selectionAutoFit=false;pending.flush();assert.deepEqual(pending.moves,[],'a manual move before a queued fit also owns the camera');
});
test('sheet resizing still fits an automatically selected domestic region or an untouched national view',()=>{
  const selected=fixture();selected.collapse();selected.flush();assert.deepEqual(selected.moves,['selection']);
  const national=fixture({selection:null,atHome:true});national.collapse();national.flush();assert.deepEqual(national.moves,['home']);
  const moved=fixture({selection:null,atHome:false});moved.collapse();moved.flush();assert.deepEqual(moved.moves,[]);
});

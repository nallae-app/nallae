import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const app=fs.readFileSync(new URL('../../web/app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../../web/explore.html',import.meta.url),'utf8');
const setupCode=app.slice(app.indexOf('const themeButtons ='),app.indexOf('\nif (DEMO)'));
function setup({systemDark=false,storageFailure=false}={}){
  const buttons=['system','light','dark'].map(themeChoice=>({dataset:{themeChoice},attrs:{},listeners:{},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,fn){this.listeners[k]=fn;}}));
  const root={dataset:{themeMode:'dark',theme:'dark',mode:'explore',navigation:'courses'}};
  const favicon={},metas=[{},{}],writes=[];let preference=systemDark,mediaCallback;
  const untouched={selection:{code:'11440',lat:37.55,lon:126.92},camera:{lat:36,lon:128,zoom:6.5},rain:{visible:true},saved:['existing-plan']};
  const media={get matches(){return preference;},addEventListener(type,fn){mediaCallback=fn;}};
  const location={href:'https://example.test/?theme=dark&appv=88#map'};
  const ctx={root,URL,location,history:{replaceState(_state,_title,url){location.href=url;}},themeButtons:undefined,...untouched,document:{getElementById:id=>id==='app-favicon'?favicon:null,querySelectorAll:selector=>selector==='[data-theme-choice]'?buttons:metas.map(m=>({setAttribute:(k,v)=>m[k]=v}))},localStorage:{setItem(k,v){if(storageFailure)throw Error('quota');writes.push([k,v]);}},matchMedia:()=>media,applyMode:()=>{throw Error('theme must not change app mode');},updateRainScene:()=>{throw Error('theme must not recreate rain');},fetch:()=>{throw Error('theme must not fetch');}};
  vm.createContext(ctx);vm.runInContext(setupCode,ctx);
  return {ctx,buttons,root,favicon,metas,writes,untouched,click:mode=>buttons.find(b=>b.dataset.themeChoice===mode).listeners.click(),system:dark=>{preference=dark;mediaCallback();}};
}
test('explicit theme selection updates colors and controls without changing the map, weather, selection or saved data',()=>{
  const f=setup(),before=JSON.stringify(f.untouched);
  for(const mode of ['light','dark','light']){
    f.click(mode);assert.equal(f.root.dataset.theme,mode);assert.equal(f.root.dataset.themeMode,mode);
    assert.equal(f.root.dataset.mode,'explore');assert.equal(f.root.dataset.navigation,'courses');
    assert.equal(JSON.stringify(f.untouched),before);assert.equal(f.ctx.location.href,'https://example.test/?appv=88#map');assert.equal(f.favicon.href,'icons/favicon-'+mode+'-32.png');
    assert.deepEqual(f.buttons.map(b=>b.attrs['aria-pressed']),['false',String(mode==='light'),String(mode==='dark')]);
    assert.ok(f.metas.every(m=>m.content===(mode==='dark'?'#0B1B33':'#FFF7E8')));
  }
  assert.deepEqual(f.writes,[['nallae-theme','light'],['nallae-theme','dark'],['nallae-theme','light']]);
});
test('system follows the device while an explicit choice remains explicit; storage failure never blocks selection',()=>{
  const f=setup({systemDark:true});f.click('system');assert.equal(f.root.dataset.theme,'dark');
  f.system(false);assert.equal(f.root.dataset.theme,'light');assert.equal(f.root.dataset.themeMode,'system');
  f.click('dark');f.system(false);assert.equal(f.root.dataset.theme,'dark');
  const fallback=setup({storageFailure:true});assert.doesNotThrow(()=>fallback.click('light'));assert.equal(fallback.root.dataset.theme,'light');
  fallback.ctx.chooseTheme('invalid');assert.equal(fallback.root.dataset.theme,'light');
});
test('the one global settings entry belongs to the header and no longer requires a utility-mode navigation',()=>{
  assert.equal((html.match(/id="btn-settings"/g)||[]).length,1);
  assert.match(html.match(/<header[^]*?<\/header>/)[0],/id="btn-settings"/);
  assert.doesNotMatch(html.match(/<div class="utility-navigation">[^]*?<\/div>/)[0],/id="btn-settings"/);
  for(const mode of ['system','light','dark'])assert.match(html,new RegExp('data-theme-choice="'+mode+'"'));
});

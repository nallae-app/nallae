import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app=fs.readFileSync(new URL('../../web/app.js',import.meta.url),'utf8');
function setup(extra={}){
  const ctx={Math,Number,Date,Set,Map,Object,String,selection:{center:{code:'11350',name:'노원구'},origin:[37.65,127.06]},escapeHtml:s=>String(s),escapeAttr:s=>String(s),validDate:d=>Number.isFinite(d?.getTime()),label:()=> '서울 노원구',productName:()=> '휘발유',money:x=>String(x)+'원',...extra};
  vm.createContext(ctx);for(const name of ['local-scope','discovery'])vm.runInContext(fs.readFileSync(new URL('../../web/'+name+'.js',import.meta.url),'utf8'),ctx);
  return ctx;
}
function load(ctx,name){const src=app.match(new RegExp('function '+name+'\\([^]*?\\n}'))?.[0];assert.ok(src);vm.runInContext(src,ctx);}
test('주유소: 노원구 기준 30km 안 표본만, 다른 지역 전체 검색 링크 제공',()=>{
  const markers=[];
  const ctx=setup({fuelProduct:'B027',fuelData:{national:{B027:{price:1800,diff:0}},sgg:{'11350':{B027:1800}},date:'2026-10-25',stations:[{id:'near',name:'가까운 주유소',lat:37.651,lon:127.06,price:{B027:1800}},{id:'far',name:'먼 주유소',lat:36.3,lon:127.4,sgg:'11350',price:{B027:1500}}]},exploreTools:{innerHTML:''},feedEl:{innerHTML:''},sourceDisclosure:()=>'',fuelColors:[],stationText:s=>s.name,fuelMarkers:{},L:{divIcon:()=>{},marker:xy=>({bindPopup:()=>({addTo:()=>markers.push(xy)})})}});
  load(ctx,'renderFuel');ctx.renderFuel();assert.equal(markers.length,1);assert.match(ctx.feedEl.innerHTML,/가까운 주유소/);assert.doesNotMatch(ctx.feedEl.innerHTML,/먼 주유소/);assert.match(ctx.feedEl.innerHTML,/주유소 더 찾기/);
});
test('길찾기: 내 위치가 있어도 자동 전달하지 않고 출발점 선택 후 수단별 링크 생성',()=>{
  const ctx=setup({routeDestination:{name:'공원',lat:37.65,lon:127.06},routeStart:null,routeDialog:{innerHTML:''}});ctx.selection.fromLocation=true;
  load(ctx,'renderRouteDialog');ctx.renderRouteDialog();assert.match(ctx.routeDialog.innerHTML,/내 위치를 출발점으로/);assert.doesNotMatch(ctx.routeDialog.innerHTML,/link\/by/);
  ctx.routeStart={name:'지도에서 고른 출발점',lat:37.64,lon:127.05};ctx.renderRouteDialog();
  for(const travel of ['walk','traffic','car','bicycle'])assert.ok(ctx.routeDialog.innerHTML.includes('/link/by/'+travel+'/'));
});

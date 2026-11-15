import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ctx={};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('../../web/region-covers.js',import.meta.url),'utf8'),ctx);
const {validate,get,render,renderUnavailable}=ctx.JippiRegionCovers;
const item=()=>({regionCode:'11',name:'서울',cover:{src:'images/regions/seoul-cheonggyecheon.webp',width:900,height:600,year:2024,author:'lumoplank',publisher:'Wikimedia Commons',alt:'청계천 물길',placeName:'청계천',licenseName:'CC0 1.0',sourceUrl:'https://commons.wikimedia.org/wiki/File:Seoul.jpg',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/',objectPosition:'50% 65%'}});
const catalog=()=>({version:1,items:[item()]});

test('허용된 16개 시도 코드만 읽으며 중복·불명확 출처·잘못된 사진 경로는 거부한다',()=>{
 const good=catalog();good.items[0].cover.dateLabel='2024년 9월 28일 이전 촬영';assert.equal(validate(good),good);assert.equal(get(good,'11'),good.items[0]);assert.equal(get(good,'11440'),null);
 const mutations=[d=>d.items[0].regionCode='29',d=>d.items.push(item()),d=>d.items[0].cover.src='images/regions/../private.webp',d=>d.items[0].cover.src='https://example.com/x.webp',d=>d.items[0].cover.sourceUrl='javascript:alert(1)',d=>d.items[0].cover.licenseUrl='https://example.com/\" onclick=\"x',d=>d.items[0].cover.width=6001,d=>d.items[0].cover.height=0,d=>d.items[0].cover.year='2024',d=>d.items[0].cover.dateLabel='x'.repeat(601),d=>d.items[0].cover.objectPosition='50%;background:red',d=>d.items[0].cover.placeName=''];
 for(const mutate of mutations){const d=catalog();mutate(d);assert.equal(validate(d),null);assert.equal(get(d,'11'),null);}
 for(const code of ['11','26','27','28','12','30','31','36','41','51','43','44','52','47','48','50']){const d=catalog();d.items[0].regionCode=code;assert.equal(validate(d),d);}
});

test('사진은 지역 대표임을 명시하고 실제 같은 시도의 시군구만 표시하며 모든 문구를 escape한다',()=>{
 const x=item();x.name='서울 <도시>';x.cover.placeName='청계천 "풍경"';x.cover.alt="물길 '사진'";
 const before=JSON.stringify(x),districts=[{code:'11440',name:'마포 <구>'},{code:'26110',name:'다른 시도'},{code:'11440',name:'중복'},{code:'11',name:'시도'},{code:'11680',name:'강남구'}];
 const html=render({item:x,districts});assert.equal(JSON.stringify(x),before);
 assert.ok(html.startsWith('<section'));assert.ok(html.includes('서울 &lt;도시&gt; 풍경 · 청계천 &quot;풍경&quot;'));assert.ok(html.includes('물길 &#39;사진&#39;'));
 assert.ok(!html.includes('마포 <구>'));assert.ok(html.includes('마포 &lt;구&gt;'));assert.ok(!html.includes('다른 시도'));assert.ok(!html.includes('중복'));
 assert.match(html,/지역 대표 사진 · 코스 방문지 사진과 달라요/);assert.match(html,/data-region-photo-source="11"/);assert.match(html,/data-region-cover-muni="11"/);assert.match(html,/data-region-cover-home/);assert.match(html,/region-cover-fallback" hidden/);
 assert.equal((html.match(/value="11440"/g)||[]).length,1);assert.ok(!html.includes('onclick='));
});

test('시군구용 compact는 사진·출처·정합성 안내만 출력하고 지역 선택 UI를 만들지 않는다',()=>{
 const html=render({item:item(),compact:true,districts:[{code:'11440',name:'마포구'}]});
 assert.match(html,/region-cover--compact/);assert.match(html,/data-region-cover-image="11"/);assert.match(html,/사진 출처/);assert.match(html,/서울 풍경 · 청계천/);
 assert.ok(!html.includes('<h2'));assert.ok(!html.includes('<select'));assert.ok(!html.includes('data-region-cover-home'));assert.equal(render(), '');assert.equal(render({item:{}}), '');
});

test('사진 자료 지연·실패에도 요청한 시도를 유지하며 다른 시도의 선택지나 가짜 사진·출처를 만들지 않는다',()=>{
 const districts=[{code:'50110',name:'제주 <시>'},{code:'50130',name:'서귀포시'},{code:'26110',name:'부산 중구'}];
 const before=JSON.stringify(districts);
 for(const loading of [true,false]){
  const html=renderUnavailable({regionCode:'50',name:'제주 <지역>',districts,loading});
  assert.match(html,/제주 &lt;지역&gt;, 어디로 갈까요\?/);assert.match(html,/data-region-cover-muni="50"/);
  assert.match(html,/value="50110">제주 &lt;시&gt;/);assert.match(html,/value="50130"/);assert.ok(!html.includes('부산 중구'));
  assert.match(html,/role="status"/);assert.match(html,/전국 지도로 돌아가기/);
  assert.ok(!html.includes('<img'));assert.ok(!html.includes('data-region-photo-source'));assert.ok(!html.includes('코스 방문지 사진'));
  assert.equal(html.includes('data-region-photos-retry'),!loading);assert.ok(html.includes(loading?'불러오는 중':'불러오지 못'));
 }
 assert.equal(JSON.stringify(districts),before);assert.equal(renderUnavailable(), '');assert.equal(renderUnavailable({regionCode:'29',name:'잘못된 시도'}),'');
 assert.match(render({item:item()}),/전국 지도로 돌아가기/);
});

test('배포용 시도 16개 사진과 개별 이용조건이 모두 실제 자산으로 존재한다',()=>{
 const data=JSON.parse(fs.readFileSync(new URL('../../web/data/region-covers.json',import.meta.url),'utf8'));
 assert.ok(ctx.JippiRegionCovers.validate(data));assert.equal(data.items.length,16);
 for(const item of data.items){
   assert.ok(fs.existsSync(new URL('../../web/'+item.cover.src,import.meta.url)),item.regionCode);
   assert.ok(fs.existsSync(new URL('../../web/'+item.cover.src.replace(/\.webp$/,'.LICENSE.txt'),import.meta.url)),item.regionCode+' license');
 }
});

test('시도 소개를 직접 선택하면 대기 중인 GPS가 그 선택을 덮지 않도록 무효화한다',()=>{
 const app=fs.readFileSync(new URL('../../web/app.js',import.meta.url),'utf8');
 const events=[],geo={routePicking:false,overseasView:false,atHome:true,mode:'explore',exploreLayer:'outing',savedView:false,selection:null,locationRequestId:5,regionPreviewCode:'',selectionAutoFit:true,MUNI_ZOOM:8.5,map:{getZoom:()=>7},mobileSheet:{matches:false},sidos:new Map([['51',{bounds:'강원 경계'}]]),renderOutings:()=>events.push('render'),fitSheet:()=>events.push('sheet'),moveToBounds:b=>events.push(b),leftPad:()=>[0,0],bottomPad:()=>[0,0]};
 vm.createContext(geo);vm.runInContext(app.match(/function onRegionClick\([^]*?\n}/)[0],geo);geo.onRegionClick({sido:'51'});
 assert.equal(geo.locationRequestId,6);assert.equal(geo.regionPreviewCode,'51');assert.equal(geo.atHome,false);assert.equal(geo.selectionAutoFit,false);assert.ok(events.includes('강원 경계'));
});

test('넓은 도의 소개를 연 뒤에는 낮은 배율이어도 다음 지도 탭으로 시군구를 고른다',()=>{
 const app=fs.readFileSync(new URL('../../web/app.js',import.meta.url),'utf8'),events=[];
 const geo={routePicking:false,overseasView:false,atHome:false,mode:'explore',exploreLayer:'outing',savedView:false,regionPreviewCode:'47',map:{getZoom:()=>7},mobileSheet:{matches:false},select:m=>events.push(m.code),fitSheet:()=>{}};
 vm.createContext(geo);vm.runInContext(app.match(/function onRegionClick\([^]*?\n}/)[0],geo);geo.onRegionClick({sido:'47',code:'47170'});assert.deepEqual(events,['47170']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { restoreReleaseData } from '../restore-release-data.mjs';

const now=new Date('2026-11-20T04:00:00Z'), updated='2026-11-20T01:00:00Z';
function setup(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'jippi-retained-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const from=path.join(root,'old'),to=path.join(root,'new');
  const write=(name,data,base=from)=>{const target=path.join(base,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(data));};
  write('pharmacy/index.json',{updated,complete:true,total:1,counts:{11440:1}});
  write('pharmacy/11440.json',{updated,items:[{id:'pharmacy'}]});
  write('er.json',{updated,complete:true,total:1,counts:{11440:1},items:[{id:'er',sgg:'11440'}]});
  write('news.json',{updated,sources:{sms:{ok:true,at:updated}},items:[]});
  write('weather.json',{updated,base:updated,sgg:{11440:{t:7}}});
  write('forecast.json',{updated,base:updated,sgg:{11440:{today:{pop:20}}}});
  return {from,to,write,read:name=>JSON.parse(fs.readFileSync(path.join(to,name),'utf8'))};
}
test('웹만 배포할 때 이전 동적 자료와 날짜를 유지하고 새 버전·정적 카탈로그는 덮지 않는다',t=>{
  const x=setup(t);x.write('app-release.json',{version:83});x.write('regions.json',{old:true});
  x.write('app-release.json',{version:92},x.to);x.write('regions.json',{current:true},x.to);
  x.write('demo-er.json',{fixture:true});
  restoreReleaseData(x.from,x.to,now);
  assert.deepEqual(x.read('app-release.json'),{version:92});assert.deepEqual(x.read('regions.json'),{current:true});
  assert.equal(x.read('weather.json').updated,updated);assert.equal(x.read('er.json').updated,updated);
  assert.equal(fs.existsSync(path.join(x.to,'demo-er.json')),false);
});
test('실종24시간·일반소식72시간 만료만 제거하고 원본 수집·출처 시각은 갱신하지 않는다',t=>{
  const x=setup(t),item=(id,h,missing=false)=>({id,src:'sms',cat:missing?'사건':'재난',title:missing?'실종자를 찾습니다':'공식 안내',time:new Date(now-h*3600000).toISOString()});
  x.write('news.json',{updated,sources:{sms:{at:updated,ok:true}},items:[item('keep',3),item('missing-keep',23,true),{...item('missing-old',25,true),body:'공식 기관 연락 바랍니다'},item('old',73)]});
  const result=restoreReleaseData(x.from,x.to,now),data=x.read('news.json');
  assert.deepEqual(data.items.map(x=>x.id),['keep','missing-keep']);assert.equal(result.expiredNewsRemoved,2);
  assert.equal(data.updated,updated);assert.equal(data.sources.sms.at,updated);
});
test('목차에 있는 약국 지역 파일이 없으면 부분 목록을 배포하지 않는다',t=>{
  const x=setup(t);fs.unlinkSync(path.join(x.from,'pharmacy/11440.json'));
  assert.throws(()=>restoreReleaseData(x.from,x.to,now));assert.equal(fs.existsSync(x.to),false);
});
test('약국 지역 파일의 세대나 개수가 다르면 배포를 차단한다',t=>{
  const x=setup(t);x.write('pharmacy/11440.json',{updated:'2026-11-19T00:00:00Z',items:[{id:'old'}]});
  assert.throws(()=>restoreReleaseData(x.from,x.to,now),/generation/);
});
test('의료 시험자료와 응급실 지역 개수 불일치는 거부한다',t=>{
  const x=setup(t);x.write('er.json',{updated,complete:true,fixture:true,total:1,counts:{11440:1},items:[{sgg:'11440'}]});
  assert.throws(()=>restoreReleaseData(x.from,x.to,now),/medical/);
  x.write('er.json',{updated,complete:true,total:1,counts:{11440:1},items:[{sgg:'11350'}]});
  assert.throws(()=>restoreReleaseData(x.from,x.to,now),/region/);
});
test('실황·예보가 빠졌거나 빈 지역 목차이면 불완전 배포를 거부한다',t=>{
  const x=setup(t);fs.unlinkSync(path.join(x.from,'weather.json'));
  assert.throws(()=>restoreReleaseData(x.from,x.to,now));
  x.write('weather.json',{updated,base:updated,sgg:{11440:{t:7}}});
  x.write('forecast.json',{updated,base:updated,sgg:{}});
  assert.throws(()=>restoreReleaseData(x.from,x.to,now),/weather/);
});

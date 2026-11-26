import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { restoreReleaseData } from '../restore-release-data.mjs';
import {CONTENT_SCOPE} from '../lib/published-scope.mjs';

const now=new Date('2026-11-20T04:00:00Z'), updated='2026-11-20T01:00:00Z';
function setup(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'jippi-retained-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const from=path.join(root,'old'),to=path.join(root,'new');
  const write=(name,data,base=from)=>{const target=path.join(base,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(data));};
  write('pharmacy/index.json',{updated,complete:true,total:1,counts:{11440:1}});
  write('pharmacy/11440.json',{updated,items:[{id:'pharmacy'}]});
  write('er.json',{updated,complete:true,total:1,counts:{11440:1},items:[{id:'er',sgg:'11440'}]});
  write('news.json',{updated,contentScope:CONTENT_SCOPE,sources:{brief:{ok:true,at:updated}},items:[]});
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
  assert.equal(x.read('weather.json').updated,updated);assert.equal(fs.existsSync(path.join(x.to,'er.json')),false);assert.equal(fs.existsSync(path.join(x.to,'pharmacy')),false);
  assert.equal(fs.existsSync(path.join(x.to,'demo-er.json')),false);
});
test('과거 artifact의 의료·재난·미검증 소식은 복원하지 않고 새 생활 소식·시각만 보존한다',t=>{
  const x=setup(t),item=(id,src,title,scope=CONTENT_SCOPE,h=1)=>({id,src,cat:'생활',title,contentScope:scope,time:new Date(now-h*3600000).toISOString()});
  x.write('news.json',{updated,contentScope:CONTENT_SCOPE,sources:{brief:{ok:true,at:updated},sms:{ok:true}},items:[item('keep','brief','서울 도서관 개관'),item('old','brief','서울 버스 증편',undefined,73),item('sms','sms','안내'),item('care','brief','서울 응급실 안내'),item('legacy','brief','서울 도서관 개관','old')]});
  const result=restoreReleaseData(x.from,x.to,now),data=x.read('news.json');
  assert.deepEqual(data.items.map(x=>x.id),['keep']);assert.equal(result.excludedNewsRemoved,4);
  assert.equal(data.updated,updated);assert.equal(data.sources.brief.at,updated);assert.equal(data.sources.sms,undefined);
});
test('의료 자료가 없거나 깨진 이전 배포도 의료 파일을 읽거나 복원하지 않는다',t=>{
  const x=setup(t);x.write('er.json',{fixture:true});fs.unlinkSync(path.join(x.from,'pharmacy/11440.json'));
  restoreReleaseData(x.from,x.to,now);
  assert.equal(fs.existsSync(path.join(x.to,'er.json')),false);assert.equal(fs.existsSync(path.join(x.to,'pharmacy')),false);
});
test('실황·예보가 빠졌거나 빈 지역 목차이면 불완전 배포를 거부한다',t=>{
  const x=setup(t);fs.unlinkSync(path.join(x.from,'weather.json'));
  assert.throws(()=>restoreReleaseData(x.from,x.to,now));
  x.write('weather.json',{updated,base:updated,sgg:{11440:{t:7}}});
  x.write('forecast.json',{updated,base:updated,sgg:{}});
  assert.throws(()=>restoreReleaseData(x.from,x.to,now),/weather/);
});

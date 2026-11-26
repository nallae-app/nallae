import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {CONTENT_SCOPE,isAllowedNewsItem,scopedNews,sanitizePublishedData} from '../lib/published-scope.mjs';
import {parse} from '../sources/policy-news.mjs';

const now=new Date('2026-11-26T12:00:00Z');
const item=(title,extra={})=>({id:'brief-1',src:'brief',cat:'생활',title,time:now.toISOString(),contentScope:CONTENT_SCOPE,...extra});
function directory(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'jippi-scope-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
test('브라우저와 Node가 동일 predicate로 검증 표식 있는 생활 소식만 허용한다',()=>{
 assert.equal(isAllowedNewsItem,globalThis.JippiReleaseScope.isAllowedNewsItem);
 for(const title of ['서울 도서관 개관','부산 교통안전 시설 개선','제주 식품안심업소 위생등급 안내']) assert.equal(isAllowedNewsItem(item(title)),true);
 for(const extra of [{src:'sms'},{src:'wrn'},{src:'eqk'},{src:'unknown'},{cat:'사건'},{cat:'재난'},{cat:'기상'},{contentScope:undefined}]) assert.equal(isAllowedNewsItem(item('서울 소식',extra)),false);
 for(const extra of [{title:'서울 건강 지원'},{body:'감염병 대응'},{summary:'의료기관 연락처'},{source:'보건복지부'},{content:'재난 대피 안내'},{description:'119 연락 안내'},{providerText:'Emergency first aid resources'}]) assert.equal(isAllowedNewsItem(item('서울 공원 개장 안내',extra)),false);
});
test('질환명·중립 행정 문구는 기본 제외하고 제목에서 확인되는 생활 분야만 허용한다',()=>{
 for(const title of ['서울 결핵 퇴치 지원 확대','서울 독감 확산 대응 안내','서울 백일해 확산 대응','서울 지원 확대','서울 일반 행정 안내','서울 사업 활성화']) assert.equal(isAllowedNewsItem(item(title)),false,title);
 for(const title of ['서울 공원 개장','서울 도서관 운영 확대','서울 도시개발 계획','서울 철도 정책','서울 주택 공급 계획','서울 도로 개통 안내','서울 산업단지 조성','서울 BRT 노선 개선']) assert.equal(isAllowedNewsItem(item(title)),true,title);
});
test('공원·문화 등 허용 분야와 의료·재난이 섞이면 제목·본문·공급처 중 어디든 제외한다',()=>{
 for(const title of ['서울 공원 결핵 검진 행사','서울 문화 독감 예방 행사','서울 박물관 백일해 확산 대응','서울 관광 의료 지원']) assert.equal(isAllowedNewsItem(item(title)),false,title);
 for(const topic of ['결핵','독감','백일해','인플루엔자','수두','홍역','폐렴','코로나','감기','방역','의학','의사','약사','수술','119','화재','산불','폭발','붕괴','산사태','폭설','홍수','범람','침수']) {
  assert.equal(isAllowedNewsItem(item('서울 공원 개장',{body:topic+' 대응 안내'})),false,topic);
 }
 assert.equal(isAllowedNewsItem(item('서울 공원 개장',{source:'보건 담당 부처'})),false);
});
test('생활 분야를 포함해도 질환 예방·관리와 보건정책 프로그램은 제공하지 않는다',()=>{
 for(const title of ['서울 공원 심장병 예방 교육','서울 공원 당뇨 관리 프로그램','서울 문화센터 재활 운동 교육']) assert.equal(isAllowedNewsItem(item(title)),false,title);
 for(const body of ['심장병 예방','당뇨 관리','암 예방 교육','재활 운동','정신 지원','영양 교육','식이 요법','비만 관리','운동 처방','혈당 관리','건강 관리','건강 증진','금연 지원']) {
  assert.equal(isAllowedNewsItem(item('서울 공원 프로그램',{body})),false,body);
 }
 for(const title of ['서울 공원 산책로 개장','서울 문화센터 공연 안내','서울 도서관 독서 프로그램']) assert.equal(isAllowedNewsItem(item(title)),true,title);
});
test('의료·생활 위험 대응이 문화/공원 기사에 섞여도 제공 범위에서 제외한다',()=>{
 const excluded=['식중독','치과','한의','한방','간호','요양','헌혈','난임','임신','산후','중독','마약','열사병','온열','저체온','진드기','모기','말라리아','뇌염','폭우','가뭄','낙뢰','우박','정전','단수','누출','유출','방사능','원전','싱크홀','땅꺼짐','지반침하','실종','수색'];
 for(const term of excluded) {
  assert.equal(isAllowedNewsItem(item('서울 공원 '+term+' 안내')),false,term+' title');
  assert.equal(isAllowedNewsItem(item('서울 문화 행사',{body:term+' 대응 정보'})),false,term+' body');
 }
});
test('도서관·공원 제목에 섞인 응급처치 교육과 천식 관리는 제공하지 않는다',()=>{
 for(const title of ['도서관에서 배우는 자동심장충격기 사용법','공원에서 배우는 심정지 대처법','공원에서 만나는 천식 관리 교육']) assert.equal(isAllowedNewsItem(item(title)),false,title);
 for(const body of ['자동심장충격기','제세동','AED','심정지','구조호흡','인공호흡','천식','심장','뇌졸중','뇌경색','기도폐쇄','하임리히','중풍']) assert.equal(isAllowedNewsItem(item('서울 공원 안내',{body})),false,body);
});
test('정책 공급처 제목이 일반 생활이어도 원문 본문이 의료·재난이면 수집하지 않는다',()=>{
 const article=body=>`<NewsItem><NewsItemId>1</NewsItemId><Title>수원시 영통구 도서관 개관</Title><KoglType>1</KoglType><ApproveDate>20261126120000</ApproveDate><Contents><![CDATA[${body}]]></Contents></NewsItem>`;
 assert.deepEqual(parse(article('감염병 대응과 응급처치 교육')),[]);
 const [accepted]=parse(article('도서 대출 공간 확충'));
 assert.equal(accepted.contentScope,CONTENT_SCOPE);assert.equal(isAllowedNewsItem(accepted),true);
 assert.equal(accepted.body,undefined);assert.equal(accepted.providerText,undefined);
});
test('공급처의 escaped 꺾쇠 일반 문구는 태그로 지우지 않고 범위 판정에 포함한다',()=>{
 const article=body=>`<NewsItem><NewsItemId>1</NewsItemId><Title>수원시 영통구 공원 개장</Title><KoglType>1</KoglType><ApproveDate>20261126120000</ApproveDate><Contents>${body}</Contents></NewsItem>`;
 assert.deepEqual(parse(article('&lt;치료 안내&gt;')),[]);
 assert.deepEqual(parse(article('<![CDATA[&lt;헌혈 안내&gt;]]>')),[]);
 assert.equal(parse(article('&lt;문화 안내&gt;')).length,1);
});
test('구 데이터·서버 news는 미검증 항목과 응급 출처 상태를 버리며 수집 날짜를 바꾸지 않는다',()=>{
 const data=scopedNews({updated:now.toISOString(),sources:{sms:{ok:true},brief:{ok:true}},items:[item('서울 생활 소식',{contentScope:undefined}),item('서울 지진 안내',{src:'eqk'})]},{now});
 assert.deepEqual(data.items,[]);assert.deepEqual(data.sources,{});assert.equal(data.updated,now.toISOString());
});
test('마지막 산출물 정리는 실제·가상 의료 파일과 구 marker를 제거하고 일반 날씨·정적 코스를 보존한다',t=>{
 const root=directory(t);
 for(const name of ['pharmacy','demo-pharmacy']){fs.mkdirSync(path.join(root,name));fs.writeFileSync(path.join(root,name,'11440.json'),'{}');}
 for(const name of ['er.json','demo-er.json','earthquake.json','warnings.json','sms.json','disaster-test.json'])fs.writeFileSync(path.join(root,name),'{}');
 const weather='{ "base": "original", "sgg": {} }';fs.writeFileSync(path.join(root,'weather.json'),weather);fs.writeFileSync(path.join(root,'outings.json'),'{"keep":true}');
 fs.writeFileSync(path.join(root,'collection-health.json'),'{"coreFresh":true,"sources":{"sms":true}}');
 for(const name of ['news.json','demo-news.json'])fs.writeFileSync(path.join(root,name),JSON.stringify({updated:now.toISOString(),contentScope:CONTENT_SCOPE,sources:{brief:{ok:true},wrn:{ok:true}},items:[item('서울 책 축제'),item('서울 재난 대응')]}));
 sanitizePublishedData(root,{now});sanitizePublishedData(root,{now});
 for(const name of ['er.json','pharmacy','demo-er.json','demo-pharmacy','earthquake.json','warnings.json','sms.json','disaster-test.json','collection-health.json'])assert.equal(fs.existsSync(path.join(root,name)),false,name);
 assert.equal(fs.readFileSync(path.join(root,'weather.json'),'utf8'),weather);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'outings.json'))),{keep:true});
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'demo-news.json'))).items.map(x=>x.title),['서울 책 축제']);
});
test('데모는 며칠 뒤 재배포해도 유지하되 동일 범위 검사를 통과해야 한다',t=>{
 const root=directory(t),later=new Date(+now+10*86400000);
 const data={updated:now.toISOString(),contentScope:CONTENT_SCOPE,sources:{brief:{ok:true}},items:[item('서울 공원 개장'),item('서울 공원 헌혈 행사'),item('서울 공원 안내',{contentScope:undefined})]};
 for(const name of ['news.json','demo-news.json'])fs.writeFileSync(path.join(root,name),JSON.stringify(data));
 sanitizePublishedData(root,{now:later});
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'news.json'))).items,[]);
 const demo=JSON.parse(fs.readFileSync(path.join(root,'demo-news.json')));
 assert.deepEqual(demo.items.map(x=>x.title),['서울 공원 개장']);assert.equal(demo.updated,data.updated);
});
test('실제 collector 실행은 응급 API를 호출하지 않고 과거 자료 병합도 같은 범위로 제한한다',t=>{
 const root=directory(t),log=path.join(root,'calls.json'),hook=path.join(root,'hook.mjs');
 const date=new Date(Date.now()+9*3600e3).toISOString().replace(/\D/g,'').slice(0,14);
 const xml='<response><resultCode>00</resultCode><NewsItem><NewsItemId>1</NewsItemId><Title>수원시 영통구 도서관 개관</Title><KoglType>1</KoglType><ApproveDate>'+date+'</ApproveDate></NewsItem><NewsItem><NewsItemId>2</NewsItemId><Title>수원시 영통구 생활 공간 확충</Title><KoglType>1</KoglType><ApproveDate>'+date+'</ApproveDate><Contents>감염병 응급 대응</Contents></NewsItem></response>';
 fs.writeFileSync(hook,`import fs from 'node:fs';const calls=[];process.on('exit',()=>fs.writeFileSync(${JSON.stringify(log)},JSON.stringify(calls)));globalThis.fetch=async input=>{const u=new URL(input);calls.push(u.pathname);if(u.hostname==='previous.invalid')return new Response(JSON.stringify({updated:new Date().toISOString(),sources:{sms:{ok:true}},items:[{src:'sms',id:'old',title:'과거 재난',time:new Date().toISOString()}]}));if(u.pathname.includes('policyNewsList2'))return new Response(${JSON.stringify(xml)});return new Response('{}');};`);
 const collector=fileURLToPath(new URL('../collect.mjs',import.meta.url));
 const result=spawnSync(process.execPath,['--import',hook,collector],{cwd:root,env:{PATH:process.env.PATH,DATA_GO_KR_KEY:'test-placeholder',PREV_URL:'https://previous.invalid/data/news.json'},encoding:'utf8',timeout:10000});
 assert.equal(result.status,0,result.stderr);
 const calls=JSON.parse(fs.readFileSync(log));assert.equal(calls.some(x=>/DSSP|wrn_|eqk_|Ermct|HsptlAsemby|hosp|pharm/i.test(x)),false);
 const data=JSON.parse(fs.readFileSync(path.join(root,'web/data/news.json')));
 assert.equal(data.contentScope,CONTENT_SCOPE);assert.equal(data.items.length,1);assert.equal(data.items[0].id,'brief-1');assert.equal(data.items.some(x=>x.id==='old'||x.id==='brief-2'),false);assert.ok(data.items.every(isAllowedNewsItem));
});

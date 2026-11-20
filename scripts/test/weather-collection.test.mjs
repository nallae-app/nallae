import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchItems as fetchWarnings, checkedRows } from '../sources/weather-warning.mjs';
import { fetchTemperature, toObs, sggGrids } from '../sources/temperature.mjs';
import { fetchForecast, toDays } from '../sources/forecast.mjs';

const key = 'test-placeholder';
const now = new Date('2026-11-20T04:00:00Z');
const grids = Array.from({length:5},(_,i)=>({code:String(11000+i),nx:60+i,ny:127}));
const base = {date:'20261120',time:'0500',iso:'2026-11-20T05:00:00+09:00'};
const response = items => ({ok:true,text:async()=>JSON.stringify({response:{header:{resultCode:'00'},body:{items:{item:items}}}})});
const obs = [{category:'T1H',obsrValue:'7'}];
const forecast = [{category:'POP',fcstDate:'20261120',fcstTime:'1200',fcstValue:'0'}];
// help=1 공식 CSV 출력열에 근거한 구성 표본. 실측 무특보 응답이라고 주장하지 않는다.
const emptyWarning = '#START7777\n# REG_UP, REG_UP_KO, REG_ID, REG_KO, TM_FC, TM_EF, WRN, LVL, CMD\n#7777END';
const warningResponse = text => ({ok:true,arrayBuffer:async()=>new TextEncoder().encode(text).buffer});

test('공식 출력열을 갖춘 0행 특보 CSV만 정상 빈 목록으로 교체한다',async()=>{
  assert.deepEqual(await fetchWarnings({key,fetchImpl:async()=>warningResponse(emptyWarning)}),{items:[],replaceSource:true});
});
test('공식 9열 특보와 선택 확장열이 있는 특보 모두 기존 경보를 정상 갱신한다',async()=>{
  const row='L1100000, 서울, L1100400, 서울서북권, 202611201000, 202611201100, R, 2, 1';
  for(const [columns,extra] of [['', ''],[', ED_TM', ','],[', ED_TM, EXTRA', ',, value']]) {
    const text=emptyWarning.replace('CMD\n','CMD'+columns+'\n').replace('#7777END',row+extra+'\n#7777END');
    const result=await fetchWarnings({key,fetchImpl:async()=>warningResponse(text)});
    assert.equal(result.replaceSource,true);assert.equal(result.items.length,1);
    assert.match(result.items[0].title,/호우주의보/);
    assert.deepEqual(result.items[0].sido,['11']);
  }
});
test('HTTP 200 오류 HTML·오류 텍스트·끊긴 특보 행을 무특보로 바꾸지 않는다',async()=>{
  for(const text of ['<html>Service unavailable</html>','ERROR: authentication failed','',emptyWarning+'\n# ERROR: server unavailable',emptyWarning+'\nL1100000, 서울, L1100400, 서울서북권, 202611201000']) {
    await assert.rejects(fetchWarnings({key,fetchImpl:async()=>warningResponse(text)}),/기상특보/);
  }
});
test('정상 특보 행·해상 전용 응답은 계속 읽고 HTTP 실패는 거부한다',async()=>{
  const header=emptyWarning.replace('\n#7777END','');
  assert.equal(checkedRows(header+'\nL1100000, 서울, L1100400, 서울서북권, 202611201000, 202611201100, R, 2, 1, ,=\n#7777END').length,1);
  const marine=await fetchWarnings({key,fetchImpl:async()=>warningResponse(header+'\nS1100000, 서해, S1131100, 앞바다, 202611201000, 202611201100, V, 2, 1, ,=\n#7777END')});
  assert.deepEqual(marine,{items:[],replaceSource:true});
  await assert.rejects(fetchWarnings({key,fetchImpl:async()=>({ok:false,status:503})}),/HTTP 503/);
});
test('기온 결측·빈 문자열·null을 실제 0도로 만들지 않는다',()=>{
  for(const value of ['',null,false,[],{},'-999','not-a-number']) assert.equal(toObs([{category:'T1H',obsrValue:value}]),null);
  assert.equal(toObs([]),null);assert.equal(toObs({}),null);
  assert.equal(toObs([{category:'T1H',obsrValue:'0'}]).t,0);
});
test('실황 빈 성공 응답·HTTP 실패를 실패로 계수한다',async()=>{
  await assert.rejects(fetchTemperature({key,base,grids,fetchImpl:async()=>response([])}),/5\/5곳 실패/);
  await assert.rejects(fetchTemperature({key,base,grids,fetchImpl:async()=>({ok:false,status:503,text:async()=>{throw Error('must not parse');}})}),/HTTP 503/);
});
test('실황은 정확히 80% 유효하면 보존하고 그 미만이면 갱신을 거부한다',async()=>{
  const fetchImpl=async url=>response(new URL(url).searchParams.get('nx')==='60'?[]:obs);
  const data=await fetchTemperature({key,base,grids,fetchImpl});assert.equal(Object.keys(data.sgg).length,4);assert.equal(data.base,base.iso);
  await assert.rejects(fetchTemperature({key,base,grids,fetchImpl:async url=>response(Number(new URL(url).searchParams.get('nx'))<62?[]:obs)}),/실패/);
});
test('공유 격자 하나의 실패가 여러 지역을 잃으면 지역 커버리지로도 거부한다',async()=>{
  const shared=[...grids,{code:'12000',nx:60,ny:127},{code:'12001',nx:60,ny:127}];
  for(const collector of [fetchTemperature,fetchForecast]) {
    await assert.rejects(collector({key,now,base,grids:shared,fetchImpl:async url=>response(new URL(url).searchParams.get('nx')==='60'?[]:collector===fetchTemperature?obs:forecast)}),/유효 지역 4\/7/);
  }
});
test('예보의 미사용 항목·결측·범위 밖 값·지난 날짜는 유효한 오늘 예보가 아니다',()=>{
  const item={...forecast[0]};
  for(const items of [[],[{...item,category:'TMP'}],[{...item,fcstValue:''}],[{...item,fcstValue:null}],[{...item,fcstValue:false}],[{...item,fcstValue:[]}],[{...item,fcstValue:'-999'}],[{...item,fcstValue:'101'}],[{...item,fcstDate:'20261119'}]]) assert.deepEqual(toDays(items,'2026-11-20'),{});
  assert.deepEqual(toDays(forecast,'2026-11-20'),{'2026-11-20':{pop:0}});
});
test('예보의 빈 성공 응답·HTTP 실패를 거부하고 80% 실제 예보는 유지한다',async()=>{
  await assert.rejects(fetchForecast({key,now,base,grids,fetchImpl:async()=>response([])}),/5\/5곳 실패/);
  await assert.rejects(fetchForecast({key,now,base,grids,fetchImpl:async()=>({ok:false,status:503})}),/HTTP 503/);
  const data=await fetchForecast({key,now,base,grids,fetchImpl:async url=>response(new URL(url).searchParams.get('nx')==='60'?[]:forecast)});
  assert.equal(Object.keys(data.sgg).length,4);assert.equal(data.base,base.iso);
});
test('기본 격자는 기존 256개 행정구역을 유지한다',()=>{
  const actual=sggGrids();assert.equal(actual.length,256);assert.equal(new Set(actual.map(x=>x.code)).size,256);
});
test('빈 응답·HTTP 200 HTML·본문 실패가 허용치를 넘으면 다음 격자 배치를 호출하지 않는다',async()=>{
  const many=Array.from({length:40},(_,i)=>({code:String(11000+i),nx:60+i,ny:127}));
  for(const collector of [fetchTemperature,fetchForecast]) {
    for(const kind of ['empty','html','body']) {
      let calls=0;
      const fetchImpl=async()=>{calls++;return kind==='empty'?response([]):{ok:true,text:async()=>{if(kind==='body')throw new DOMException('본문 제한시간','TimeoutError');return '<html>Service unavailable</html>';}};};
      await assert.rejects(collector({key,now,base,grids:many,fetchImpl}),/격자 16\/40곳 실패/);
      assert.equal(calls,16,kind+' must stop after exceeding 8 allowed failures');
    }
  }
});

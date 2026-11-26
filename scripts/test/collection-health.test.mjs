import test from 'node:test';
import assert from 'node:assert/strict';
import {currentWeather,currentForecast,collectionHealth,skipRecovery} from '../collection-health.mjs';
import {latestBase} from '../sources/temperature.mjs';
import {forecastBase} from '../sources/forecast.mjs';
import {CONTENT_SCOPE} from '../lib/published-scope.mjs';
const now=new Date('2026-11-20T03:00:00Z'), weatherBase=latestBase(now).iso, forecast=forecastBase(now).iso;
const weather={base:weatherBase,sgg:{11110:{t:0},11140:{t:12}}};
const prediction={base:forecast,sgg:{11110:{'2026-11-20':{pty:0}},11140:{'2026-11-20':{pop:20}}}};
test('같은 발표라도 비어 있거나 유효 지역이 부족하면 재사용하지 않는다',()=>{
 assert.equal(currentWeather(weather,weatherBase,2),true);
 assert.equal(currentWeather({...weather,sgg:{}},weatherBase,2),false);
 assert.equal(currentWeather({...weather,sgg:{11110:{t:-999},11140:{t:null}}},weatherBase,2),false);
 assert.equal(currentWeather(weather,'old',2),false);
 assert.equal(currentForecast(prediction,forecast,2),true);
 assert.equal(currentForecast({...prediction,sgg:{11110:{'2026-11-20':{pop:999}}}},forecast,1),false);
 assert.equal(currentForecast({...prediction,sgg:[{'2026-11-20':{pop:20}}]},forecast,1),false);
});
test('허용 생활 소식과 일반 실황·예보만 핵심 최신으로 판정한다',()=>{
 const input={news:{contentScope:CONTENT_SCOPE,items:[],sources:{brief:{ok:true}}},weather,forecast:prediction,weatherBase,forecastBase:forecast,minimumRegions:2,now,commit:'abc'};
 assert.equal(collectionHealth(input).coreFresh,true);
 assert.deepEqual(Object.keys(collectionHealth(input).sources),['localNews','weather','forecast']);
 input.news.sources.brief.ok=false;
 assert.equal(collectionHealth(input).coreFresh,false);
});
test('복구 생략은 같은 커밋의 5분 이내 현재 발표 자료만 허용한다',()=>{
 const health={commit:'abc',contentScope:CONTENT_SCOPE,checkedAt:now.toISOString(),coreFresh:true,weatherBase,forecastBase:forecast};
 const options={commit:'abc',now:now.getTime()};
 assert.equal(skipRecovery(health,options),true);
 for(const changed of [{contentScope:undefined},{commit:'old'},{coreFresh:false},{checkedAt:'invalid'},{checkedAt:new Date(+now+1).toISOString()},{checkedAt:new Date(+now-300000).toISOString()},{weatherBase:'old'},{forecastBase:'old'}]) assert.equal(skipRecovery({...health,...changed},options),false);
});

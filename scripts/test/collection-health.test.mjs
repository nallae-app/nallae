import test from 'node:test';
import assert from 'node:assert/strict';
import {currentWeather,currentForecast,collectionHealth,skipRecovery} from '../collection-health.mjs';
import {latestBase} from '../sources/temperature.mjs';
import {forecastBase} from '../sources/forecast.mjs';
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
test('문자·특보·지진·실황·예보가 모두 성공해야 핵심 최신으로 판정한다',()=>{
 const input={news:{sources:{sms:{ok:true},wrn:{ok:true},eqk:{ok:true}}},weather,forecast:prediction,weatherBase,forecastBase:forecast,minimumRegions:2,now,commit:'abc'};
 assert.equal(collectionHealth(input).coreFresh,true);
 input.news.sources.sms.ok=false;
 assert.equal(collectionHealth(input).coreFresh,false);
});
test('복구 생략은 같은 커밋의 5분 이내 현재 발표 자료만 허용한다',()=>{
 const health={commit:'abc',checkedAt:now.toISOString(),coreFresh:true,weatherBase,forecastBase:forecast};
 const options={commit:'abc',now:now.getTime()};
 assert.equal(skipRecovery(health,options),true);
 for(const changed of [{commit:'old'},{coreFresh:false},{checkedAt:'invalid'},{checkedAt:new Date(+now+1).toISOString()},{checkedAt:new Date(+now-300000).toISOString()},{weatherBase:'old'},{forecastBase:'old'}]) assert.equal(skipRecovery({...health,...changed},options),false);
});

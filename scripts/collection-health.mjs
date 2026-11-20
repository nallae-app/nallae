import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { latestBase } from './sources/temperature.mjs';
import { forecastBase } from './sources/forecast.mjs';

const regions = data => data?.sgg && !Array.isArray(data.sgg) ? Object.entries(data.sgg).filter(([code]) => /^\d{5}$/.test(code)).map(([,value]) => value) : [];
const validDay = day => day && !Array.isArray(day) && (['tmn','tmx'].some(key => Number.isFinite(day[key]) && day[key]>=-60 && day[key]<=60) || (Number.isFinite(day.pop) && day.pop>=0 && day.pop<=100) || [1,3,4].includes(day.sky) || [0,1,2,3,4,5,6,7].includes(day.pty));
export function currentWeather(data, base, minimumRegions) {
  return data?.base === base && regions(data).filter(v => Number.isFinite(v?.t) && v.t >= -60 && v.t <= 60).length >= minimumRegions;
}
export function currentForecast(data, base, minimumRegions) {
  return data?.base === base && regions(data).filter(days => days && !Array.isArray(days) && Object.entries(days).some(([date,day]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && validDay(day))).length >= minimumRegions;
}
export function collectionHealth({news,weather,forecast,weatherBase,forecastBase,minimumRegions,now=new Date(),commit=null}) {
  const sources = {
    sms: news?.sources?.sms?.ok === true,
    warning: news?.sources?.wrn?.ok === true,
    earthquake: news?.sources?.eqk?.ok === true,
    weather: currentWeather(weather,weatherBase,minimumRegions),
    forecast: currentForecast(forecast,forecastBase,minimumRegions),
  };
  return {commit,checkedAt:now.toISOString(),coreFresh:Object.values(sources).every(Boolean),sources,weatherBase:weather?.base||null,forecastBase:forecast?.base||null};
}
export function skipRecovery(health,{commit,now=Date.now()}={}) {
  const age=now-Date.parse(health?.checkedAt);
  return !!commit && health?.commit===commit && health?.coreFresh===true && health?.weatherBase===latestBase(new Date(now)).iso && health?.forecastBase===forecastBase(new Date(now)).iso && Number.isFinite(age) && age>=0 && age<5*60000;
}
if (process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href && process.argv[2]==='plan') {
  let run=true;
  if(process.env.RECOVERY_ATTEMPT==='true'){
    try{
      const url=new URL('data/collection-health.json',process.env.PAGES_BASE);
      url.searchParams.set('check',String(Date.now()));
      const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(5000)});
      run=!response.ok||!skipRecovery(await response.json(),{commit:process.env.GITHUB_SHA});
    }catch(_){run=true;}
  }
  fs.appendFileSync(process.env.GITHUB_OUTPUT,`run=${run}\n`);
  console.log(run?'공공 자료 수집 실행':'동일 코드의 최신 핵심 자료 확인: 복구 수집 생략');
}

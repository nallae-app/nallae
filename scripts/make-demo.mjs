import fs from 'node:fs';
import { findPlacesInText } from './lib/regions.mjs';
const now=Date.now();
const briefTitles = [
  [12, '국토부, 수원시 영통구 신분당선 연장 기본계획 고시'],
  [37, '서울 성동구 성수동 준공업지역 정비계획 발표'],
  [62, '분당신도시 선도지구 재건축 특별정비계획 수립'],
  [90, '전주시 한옥마을 야간 개장 연장 운영'],
  [150, '창원시 성산구 S-BRT 2단계 개통'],
  [200, '아산시 탕정 산업단지 2단계 분양 공고'],
].map(([m, title], i) => ({
  id: `demo-brief-${i}`, src: 'brief', cat: '정책', onMap: false, contentScope:'local-life-v1', title,
  time: new Date(now - m * 60000).toISOString(), ...findPlacesInText(title),
  source: '데모 데이터', url: 'https://www.korea.kr/',
}));


const items=briefTitles;
fs.writeFileSync('web/data/demo-news.json',JSON.stringify({updated:new Date(now).toISOString(),contentScope:'local-life-v1',demo:true,sources:{brief:{ok:true,count:items.length,at:new Date(now).toISOString()}},items},null,1));
console.log(`demo items: ${items.length}`);

// 예보 데모는 실제 자료와 분리한다.
const forecastDay=d=>new Date(now+9*3600000+d*86400000).toISOString().slice(0,10);
const weather=JSON.parse(fs.readFileSync('web/data/demo-weather.json','utf8'));
const forecast={updated:new Date(now).toISOString(),base:forecastDay(0)+'T05:00:00+09:00',source:'기상청 단기예보 (데모)',sgg:{}};
Object.keys(weather.sgg).forEach((code,i)=>{forecast.sgg[code]={[forecastDay(0)]:{tmx:16,pop:60,pty:1,sky:3},[forecastDay(1)]:{tmn:4,tmx:16,pop:i%3?0:70,pty:i%3?0:1,sky:1}};});
fs.writeFileSync('web/data/demo-forecast.json',JSON.stringify(forecast,null,1));

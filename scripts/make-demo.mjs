// 화면 확인용 데모 소식(web/data/demo-news.json)을 만든다. 실제 데이터가 아니다.
// 앱을 ?demo 로 열면 이 파일을 읽는다.
import fs from 'node:fs';
import * as sms from './sources/disaster-sms.mjs';
import * as wrn from './sources/weather-warning.mjs';
import { findPlacesInText } from './lib/regions.mjs';

const now = Date.now();
const kst = (minAgo) => {
  const d = new Date(now - minAgo * 60000 + 9 * 3600e3).toISOString();
  return `${d.slice(0, 4)}/${d.slice(5, 7)}/${d.slice(8, 10)} ${d.slice(11, 19)}`;
};
const tmfc = (minAgo) => new Date(now - minAgo * 60000 + 9 * 3600e3).toISOString().replace(/\D/g, '').slice(0, 12);

const smsRows = [
  [3, '서울특별시 마포구', '화재', '[마포구청] 합정동 상가 화재 발생. 인근 주민은 창문을 닫고 연기 흡입에 주의 바랍니다.'],
  [9, '경기도 화성시', '화재', '[화성시청] 공장 화재로 다량의 연기 발생. 주민은 외출을 자제하시기 바랍니다.'],
  [14, '강원특별자치도 강릉시', '산불', '[강릉시청] 산불 발생. 인근 주민은 마을회관으로 대피 바랍니다.'],
  [22, '부산광역시 해운대구', '기타', '[해운대구청] 이안류 발생 우려로 해수욕장 입수를 통제합니다.'],
  [27, '서울특별시 송파구', '교통', '[송파구청] 잠실대교 남단 교통사고로 2개 차로 통제 중. 우회 바랍니다.'],
  [33, '경상북도 포항시', '지진', '[기상청] 경북 포항시 북구 북쪽 9km 지역 규모 2.4 지진 발생. 낙하물 주의.'],
  [41, '대구광역시 수성구', '실종', '[수성구청] 실종자를 찾습니다. 70세 남성, 165cm, 회색 점퍼.'],
  [48, '제주특별자치도 제주시', '호우', '[제주시청] 호우로 하천 범람 우려. 하천 산책로 출입을 금지합니다.'],
  [55, '광주광역시 북구', '정전', '[북구청] 용봉동 일대 정전 발생. 복구 중입니다.'],
  [130, '충청남도 아산시', '기타', '[아산시청] 탕정면 일대 단수 예정 안내 (14:00~18:00).'],
  [300, '인천광역시 전체', '미세먼지', '[인천광역시] 초미세먼지 주의보 발령. 실외 활동을 자제하세요.'],
].map(([m, rg, kind, msg], i) => ({ SN: `demo${i}`, CRT_DT: kst(m), RCPTN_RGN_NM: rg, DST_SE_NM: kind, MSG_CN: msg, EMRG_STEP_NM: '안전안내' }));

const wrnText = [
  '# REG_UP, REG_UP_KO, REG_ID, REG_KO, TM_FC, TM_EF, WRN, LVL, CMD, ED_TM',
  `L1090000, 제주도, L1091320, 제주시북부, ${tmfc(50)}, ${tmfc(40)}, R, 2, 1, ,=`,
  `L1090000, 제주도, L1091420, 서귀포시남부, ${tmfc(50)}, ${tmfc(40)}, R, 2, 1, ,=`,
  `L1020000, 강원도, L1022510, 강릉평지, ${tmfc(18)}, ${tmfc(18)}, D, 3, 1, ,=`,
  `L1020000, 강원도, L1022110, 속초평지, ${tmfc(18)}, ${tmfc(18)}, D, 3, 1, ,=`,
].join('\n');

const briefTitles = [
  [12, '국토부, 수원시 영통구 신분당선 연장 기본계획 고시'],
  [37, '서울 성동구 성수동 준공업지역 정비계획 발표'],
  [62, '분당신도시 선도지구 재건축 특별정비계획 수립'],
  [90, '전주시 한옥마을 야간 개장 연장 운영'],
  [150, '창원시 성산구 S-BRT 2단계 개통'],
  [200, '아산시 탕정 산업단지 2단계 분양 공고'],
].map(([m, title], i) => ({
  id: `demo-brief-${i}`, src: 'brief', cat: '정책', onMap: false, title,
  time: new Date(now - m * 60000).toISOString(), ...findPlacesInText(title),
  source: '데모 데이터', url: 'https://www.korea.kr/',
}));

const items = [...sms.parse(smsRows), ...wrn.toItems(wrn.parseText(wrnText)), ...briefTitles]
  .filter((it) => it.sgg.length || it.sido.length)
  .map((it) => ({ ...it, source: `${it.source} (데모)` }))
  .sort((a, b) => new Date(b.time) - new Date(a.time));

fs.writeFileSync('web/data/demo-news.json', JSON.stringify({ updated: new Date(now).toISOString(), demo: true, items }, null, 1));
console.log(`demo items: ${items.length}`);

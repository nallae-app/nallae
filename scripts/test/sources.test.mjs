// 응답 형식은 공식 문서의 필드 이름을 따른 예시다. 실제 키로 받은 응답과 다르면 여기와 파서를 함께 고친다.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as sms from '../sources/disaster-sms.mjs';
import * as wrn from '../sources/weather-warning.mjs';
import * as brief from '../sources/policy-news.mjs';
import { resolvePlace, findPlacesInText } from '../lib/regions.mjs';

test('지역 표현 → 코드', () => {
  assert.deepEqual(resolvePlace('서울특별시 마포구'), { sgg: ['11440'], sido: [] });
  assert.deepEqual(resolvePlace('경기도 수원시 장안구').sgg, ['41111']);
  assert.equal(resolvePlace('경기도 수원시').sgg.length, 4);
  assert.deepEqual(resolvePlace('부산광역시 전체'), { sgg: [], sido: ['26'] });
  assert.deepEqual(resolvePlace('광주광역시 북구').sgg, ['12300']);     // 통합 전 이름
  assert.deepEqual(resolvePlace('전라남도 여수시').sgg, ['12130']);
  assert.notDeepEqual(resolvePlace('강원도 고성군').sgg, resolvePlace('경상남도 고성군').sgg);
  assert.deepEqual(resolvePlace('인천광역시 중구'), { sgg: [], sido: ['28'] }); // 폐지된 구 → 시·도
});

test('문장 속 지명', () => {
  assert.deepEqual(findPlacesInText('수원시 영통구 신분당선 공청회').sgg, ['41117']);
  assert.deepEqual(findPlacesInText('중구 화재').sgg, []);             // 전국에 여럿
  assert.deepEqual(findPlacesInText('고성군 산불').sgg, []);           // 강원·경남
  assert.deepEqual(findPlacesInText('서울 마포구 모아타운').sgg, ['11440']);
  // 접미사 없는 이름 (실제 정책브리핑 제목)
  assert.equal(findPlacesInText('부천 화재 순직 소방위, 현충원 안장').sgg.length, 3); // 부천 3개 구
  assert.equal(findPlacesInText('과천 경마장 이전 협의').sgg.length, 1);
  assert.equal(findPlacesInText('강남 3구 집값 상승 둔화').sgg.length, 1);
  // 일반 단어와 겹치는 지명은 잡지 않는다
  assert.deepEqual(findPlacesInText('화성 탐사 예산 진도 점검').sgg, []);
  assert.deepEqual(findPlacesInText('해외 한식당 1000곳 확대').sgg, []);
  assert.deepEqual(findPlacesInText('반도체 장비 기업 한국 거점 확대').sgg, []);
});

test('긴급재난문자 파싱', () => {
  const items = sms.parse([
    { SN: '230001', CRT_DT: '2026/10/20 14:03:11', MSG_CN: '[마포구청] 오늘 14:00 합정동 화재 발생. 인근 주민은 창문을 닫고 안전에 유의 바랍니다.', RCPTN_RGN_NM: '서울특별시 마포구', EMRG_STEP_NM: '안전안내', DST_SE_NM: '화재' },
    { SN: '230002', CRT_DT: '2026/10/20 13:10:00', MSG_CN: '[행정안전부] 호우경보 발효 중. 하천변 접근 금지', RCPTN_RGN_NM: '경기도 고양시, 경기도 파주시', EMRG_STEP_NM: '긴급재난', DST_SE_NM: '호우' },
    { SN: '230003', CRT_DT: '2026/10/20 12:00:00', MSG_CN: '[부산광역시] 시민 여러분…', RCPTN_RGN_NM: '부산광역시 전체', EMRG_STEP_NM: '안전안내', DST_SE_NM: '기타' },
    { SN: '230004', CRT_DT: '2026/10/20 12:00:00', MSG_CN: '알 수 없는 지역', RCPTN_RGN_NM: '어딘가', DST_SE_NM: '기타' },
  ]);
  assert.equal(items.length, 3);
  assert.equal(items[0].id, 'sms-230001');
  assert.equal(items[0].cat, '재난');
  assert.deepEqual(items[0].sgg, ['11440']);
  assert.equal(items[0].time, '2026-10-20T05:03:11.000Z');
  assert.ok(!items[0].title.startsWith('['));
  assert.equal(items[1].cat, '기상');
  assert.equal(items[1].sgg.length, 4); // 고양 3구 + 파주
  assert.deepEqual(items[2].sido, ['26']);
});

test('기상특보 파싱·묶기', () => {
  const text = [
    '#START7777',
    '# REG_UP, REG_UP_KO, REG_ID, REG_KO, TM_FC, TM_EF, WRN, LVL, CMD, ED_TM',
    'L1010000, 경기도, L1011500, 고양, 202610201000, 202610201100, R, 3, 1, ,=',
    'L1010000, 경기도, L1013710, 파주동북부, 202610201000, 202610201100, R, 3, 1, ,=',
    'L1100000, 서울, L1100400, 서울서북권, 202610201000, 202610201100, R, 2, 1, ,=',
    'S1100000, 서해중부앞바다, S1131100, 인천.경기북부앞바다, 202610201000, 202610201100, V, 2, 1, ,=',
    '#7777END',
  ].join('\n');
  const rows = wrn.parseText(text);
  assert.equal(rows.length, 4);
  const items = wrn.toItems(rows);
  assert.equal(items.length, 2); // 호우경보 묶음 + 호우주의보 (해상 제외)
  const warn = items.find((i) => i.title.startsWith('호우경보'));
  assert.equal(warn.sgg.length, 4); // 고양 3구 + 파주
  const adv = items.find((i) => i.title.startsWith('호우주의보'));
  assert.deepEqual(adv.sido, ['11']);
  assert.equal(warn.time, '2026-10-20T01:00:00.000Z');
});

test('정책브리핑 파싱: 공공누리 1유형 + 지명 있는 것만', () => {
  const xml = `<response><header><resultCode>0</resultCode></header><body>
    <NewsItem><NewsItemId>1001</NewsItemId><Title><![CDATA[국토부, 수원시 영통구 신분당선 연장 기본계획 고시]]></Title><MinisterCode>국토교통부</MinisterCode><OriginalUrl>https://www.korea.kr/briefing/pressReleaseView.do?newsId=1001</OriginalUrl><ApproveDate>10/20/2026 09:00:00</ApproveDate><KoglType>1</KoglType></NewsItem>
    <NewsItem><NewsItemId>1002</NewsItemId><Title>전국 단위 정책 발표</Title><KoglType>1</KoglType><ApproveDate>20261020090000</ApproveDate></NewsItem>
    <NewsItem><NewsItemId>1003</NewsItemId><Title>해운대구 해변 정비</Title><KoglType>4</KoglType><ApproveDate>20261020090000</ApproveDate></NewsItem>
  </body></response>`;
  const items = brief.parse(xml);
  assert.equal(items.length, 1);
  assert.equal(items[0].cat, '정책');
  assert.equal(items[0].onMap, false); // 지명 언급만으로 지도에 찍지 않는다
  assert.deepEqual(items[0].sgg, ['41117']);
  assert.ok(items[0].url.startsWith('https://'));
});

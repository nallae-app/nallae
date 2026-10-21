// 기름값·식품안심업소 파서 시험. 원자료 필드는 실제 응답(2026-10-21 probe)과 같은 이름.
import test from 'node:test';
import assert from 'node:assert/strict';
import { katecToWgs84 } from '../lib/katec.mjs';
import { sigunToSgg, toStation } from '../sources/fuel.mjs';
import { toFoodBySgg, parseCsv } from '../sources/food-safety.mjs';

test('CSV 읽기', () => {
  const rows = parseCsv('﻿BSSH_NM,ADDR,TELNO\r\n"가게, 본점","서울 ""중구""\n2층",\r\n나,다,02\r\n');
  assert.deepEqual(rows, [{ BSSH_NM: '가게, 본점', ADDR: '서울 "중구"\n2층', TELNO: '' }, { BSSH_NM: '나', ADDR: '다', TELNO: '02' }]);
});

test('KATEC → 위경도', () => {
  const p = katecToWgs84(298014.58083, 547054.30697); // 서울 양천구 신월로 193
  assert.ok(Math.abs(p.lat - 37.52) < 0.003 && Math.abs(p.lon - 126.844) < 0.003, JSON.stringify(p));
});

test('시·군·구 평균 이름 → 코드', () => {
  const { prices, unmatched } = sigunToSgg([
    { SIGUNNM: '서울 종로구', PRICE: 2102.57 },
    { SIGUNNM: '광주 없는구', PRICE: 1900 },
    { SIGUNNM: '서울 성북구', PRICE: 0 },
    { SIGUNNM: '세종시', PRICE: 1850 },
  ]);
  assert.deepEqual(prices, { 11110: 2102.57, 36110: 1850 });
  assert.deepEqual(unmatched, ['광주 없는구']); // 광주 구 전체로 번지지 않는다
});

test('최저가 주유소 점', () => {
  const s = toStation({ UNI_ID: 'A0000992', PRICE: 1804, POLL_DIV_CD: 'GSC', OS_NM: '신월주유소', NEW_ADR: '서울 양천구 신월로 193', GIS_X_COOR: 298014.58083, GIS_Y_COOR: 547054.30697 }, 'B027');
  assert.equal(s.sgg, '11470');
  assert.deepEqual(s.price, { B027: 1804 });
  assert.equal(toStation({ UNI_ID: 'x', GIS_X_COOR: 0, GIS_Y_COOR: 0 }, 'B027'), null);
});

test('식품안심업소 거르기', () => {
  const row = (o) => ({ BSSH_NM: '업소', INDUTY_NM: '일반음식점', ADDR: '경기도 오산시 외삼미로 162-48', INSTT_CD_NM: '경기도 오산시', HG_ASGN_LV: '매우우수', ASGN_FROM: '20250330', ASGN_TO: '20270329', CLSBIZ_DVS_CD_NM: '정상', CLSBIZ_DT: '', ASGN_CANCEL_YMD: '', LCNS_NO: '1', HG_ASGN_NO: 'a', PRSDNT_NM: '홍길동', WRKR_REG_NO: '123', ...o });
  const { by } = toFoodBySgg([
    row({ BSSH_NM: '유효' }),
    row({ BSSH_NM: '만료', ASGN_TO: '20261001', LCNS_NO: '2' }),
    row({ BSSH_NM: '폐업', CLSBIZ_DVS_CD_NM: '폐업', LCNS_NO: '3' }),
    row({ BSSH_NM: '취소', ASGN_CANCEL_YMD: '20260101', LCNS_NO: '4' }),
    row({ BSSH_NM: '기관이 시·도', INSTT_CD_NM: '경기도', LCNS_NO: '5' }), // 주소로 찾는다
    row({ BSSH_NM: '유효' }), // 중복
  ], '2026-10-21');
  const codes = Object.keys(by);
  assert.equal(codes.length, 1);
  assert.deepEqual(by[codes[0]].map((i) => i.name), ['기관이 시·도', '유효']);
  assert.equal(by[codes[0]][1].to, '2027-03-29');
  assert.ok(!JSON.stringify(by).includes('홍길동') && !JSON.stringify(by).includes('"123"'));
});

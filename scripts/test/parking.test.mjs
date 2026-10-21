// 주차장 파서 시험. 필드는 실제 응답(2026-10-21 probe)과 같은 이름.
import test from 'node:test';
import assert from 'node:assert/strict';
import { toParkingBySgg, toSeoulLive, normName } from '../sources/parking.mjs';

const std = (o) => ({ prkplceNo: '1', prkplceNm: '세종로 공영주차장', prkplceSe: '공영', prkplceType: '노외', rdnmadr: '', lnmadr: '서울특별시 종로구 세종로 80-1', prkcmprt: '1260', operDay: '평일+토요일+공휴일', weekdayOperOpenHhmm: '00:00', weekdayOperColseHhmm: '23:59', satOperOperOpenHhmm: '00:00', satOperCloseHhmm: '23:59', holidayOperOpenHhmm: '', holidayCloseOpenHhmm: '', parkingchrgeInfo: '유료', basicTime: '5', basicCharge: '430', addUnitTime: '5', addUnitCharge: '430', dayCmmtkt: '', latitude: '37.5735', longitude: '126.9769', referenceDate: '2026-04-20', ...o });

test('표준데이터 → 시·군·구별, 좌표 없는 곳 제외', () => {
  const { by, dropped } = toParkingBySgg([std(), std({ prkplceNo: '2', latitude: '', longitude: '' }), std()]);
  assert.equal(dropped, 1);
  assert.deepEqual(Object.keys(by), ['11110']); // 종로구
  const p = by['11110'][0];
  assert.equal(by['11110'].length, 1); // 같은 번호 중복 제거
  assert.deepEqual(p.basic, { min: 5, won: 430 });
  assert.equal(p.weekday, '00:00-23:59');
  assert.equal(p.holiday, undefined);
});

test('서울 실시간 → 같은 구·같은 이름 하나일 때만 지도 점과 연결', () => {
  assert.equal(normName('세종로 공영주차장(시)'), normName('세종로 공영주차장'));
  const { by } = toParkingBySgg([std()]);
  const live = toSeoulLive([
    { PKLT_CD: '171721', PKLT_NM: '세종로 공영주차장(시)', ADDR: '종로구 세종로 80-1', PRK_STTS_YN: '1', TPKCT: 1260.0, NOW_PRK_VHCL_CNT: 761.0, NOW_PRK_VHCL_UPDT_TM: '2026-10-21 16:00:43', PAY_YN_NM: '유료', BSC_PRK_HR: 5.0, BSC_PRK_CRG: 430.0 },
    { PKLT_CD: '9', PKLT_NM: '없는 주차장', ADDR: '종로구 어딘가', PRK_STTS_YN: '2', TPKCT: 10, NOW_PRK_VHCL_CNT: 3 },
  ], by);
  assert.equal(live[0].matchId, '1');
  assert.equal(live[0].now, 761);
  assert.equal(live[1].matchId, undefined);
  assert.equal(live[1].now, undefined); // 20분 넘은 자료는 '현재'로 쓰지 않는다
});

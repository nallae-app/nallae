// 지진정보 파서 시험. 줄 모양은 실제 응답(2026-10-21 probe)과 같다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuakes, toItems } from '../sources/earthquake.mjs';

const TEXT = `#START7777
#TP        TM_FC SEQ         TM_EQK.MSC  MT       LAT       LON LOC,INT,REM,COR,=
  2 202610201335 1235 20261020132038.000 6.3  -14.0300  165.4800 바누아투 포트올리 서북서쪽 204km 해역,,국내영향없음. 발생시각, 규모는 USGS 분석결과임.,,=
  14 202610210747 1237 20261021074514.000 2.8   35.5500  125.3300 전북 군산시 어청도 남서쪽 85km 해역,,,,=
  3 202610210750 1238 20261021074514.000 2.6   35.5600  125.3400 전북 군산시 어청도 남서쪽 85km 해역,최대진도 Ⅰ,지진피해 없을 것으로 예상됨,,=
  11 202610211201 1240 20261021120055.000 4.1   36.0000  129.3600 경북 포항시 북구 북쪽 9km 지역,최대진도 Ⅴ,,,=
#7777END`;

test('지진정보 파싱·묶기', () => {
  const rows = parseQuakes(TEXT);
  assert.equal(rows.length, 4);
  assert.equal(rows[2].LOC, '전북 군산시 어청도 남서쪽 85km 해역');
  assert.equal(rows[2].INT, '최대진도 Ⅰ');
  const items = toItems(rows);
  assert.equal(items.length, 2); // 국외 '국내영향없음' 빠짐, 같은 지진의 속보→통보는 통보 하나
  const sea = items.find((i) => i.id === 'eqk-20261021074514');
  assert.equal(sea.mag, 2.6);
  assert.equal(sea.kind, '국내지진통보');
  assert.deepEqual(sea.sgg, []); // 바다 위 → 점만
  assert.equal(sea.time, '2026-10-20T22:45:14.000Z');
  const land = items.find((i) => i.id === 'eqk-20261021120055');
  assert.equal(land.urgency, 'urgent'); // 조기경보
  assert.equal(land.sgg.length, 1);
  assert.equal(land.sgg[0].slice(0, 2), '47'); // 경북
});

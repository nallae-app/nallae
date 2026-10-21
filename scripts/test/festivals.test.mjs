// 축제 파서 시험. 원자료 필드는 실제 응답(2026-10-21 probe)과 같은 이름.
import test from 'node:test';
import assert from 'node:assert/strict';
import { toFestivals, sggAt } from '../sources/festivals.mjs';

test('좌표 → 시·군·구', () => {
  assert.equal(sggAt(126.9161135, 35.14935078), '12210'); // 광주 동구 금남로
  assert.equal(sggAt(126.9024, 37.5554), '11440');        // 서울 마포구
  assert.equal(sggAt(130.3, 36.0), null);                  // 동해 바다 위
});

test('기간·위치로 거르기', () => {
  const row = (o) => ({ fstvlNm: '축제', opar: 'A+B 일원', rdnmadr: '주소', latitude: '37.5554', longitude: '126.9024', mnnstNm: '마포구+재단', homepageUrl: 'http://example.com', ...o });
  const items = toFestivals([
    row({ fstvlNm: '진행 중', fstvlStartDate: '2026-10-19', fstvlEndDate: '2026-10-23' }),
    row({ fstvlNm: '곧 시작', fstvlStartDate: '2026-11-10', fstvlEndDate: '2026-11-12' }),
    row({ fstvlNm: '끝남', fstvlStartDate: '2026-10-01', fstvlEndDate: '2026-10-05' }),
    row({ fstvlNm: '너무 먼 미래', fstvlStartDate: '2027-03-01', fstvlEndDate: '2027-03-02' }),
    row({ fstvlNm: '좌표 없음', fstvlStartDate: '2026-10-21', fstvlEndDate: '2026-10-22', latitude: '', longitude: '' }),
    row({ fstvlNm: '진행 중', fstvlStartDate: '2026-10-19', fstvlEndDate: '2026-10-23' }), // 중복
  ], '2026-10-21');
  assert.deepEqual(items.map((i) => i.name), ['진행 중', '곧 시작']);
  assert.equal(items[0].sgg, '11440');
  assert.equal(items[0].place, 'A, B 일원'); // '+' 구분자 정리
  assert.equal(items[0].host, '마포구, 재단');
});

// 약국·응급실 파서·완전성·갱신 규칙 시험.
// 필드 이름은 공공데이터포털 15000563 공식 명세(swagger)의 getEgytBassInfoInqire 응답과 같다.
// 약국(15000576)은 포털에 응답 표가 비어 있어, 같은 제공기관의 같은 이름 필드(dutyName·dutyAddr·dutyTel1·
// dutyTime1s~8c·wgs84Lat/Lon·hpid)로 가정했다 — 실제 응답 확인 전까지 시험용 가정이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  parseXmlPage, hhmm, dayHours, placeOf, toPharmacyBySgg, toEmergency, assessComplete, fullCounts,
  fetchAllPages, fetchEmergency, isDue, updatePharmacy, updateEmergency, BASS_BUDGET, PHARMACY_URL,
} from '../sources/medical.mjs';

const xml = (items, { total = items.length, code = '00' } = {}) =>
  `<?xml version="1.0" encoding="UTF-8"?><response><header><resultCode>${code}</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header><body><items>${items
    .map((o) => `<item>${Object.entries(o).map(([k, v]) => `<${k}>${v}</${k}>`).join('')}</item>`).join('')}</items><numOfRows>10</numOfRows><pageNo>1</pageNo><totalCount>${total}</totalCount></body></response>`;
const gw = (code, msg) => `<?xml version="1.0" encoding="UTF-8"?><OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>${msg}</errMsg><returnAuthMsg>${msg}</returnAuthMsg><returnReasonCode>${code}</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>`;

// 서울 마포구(11440) 안 좌표
const ph = (o) => ({ hpid: 'C1', dutyName: '하늘약국', dutyAddr: '서울특별시 마포구 월드컵로 1 (망원동)', dutyTel1: '02-000-0000', wgs84Lat: '37.556', wgs84Lon: '126.905', dutyTime1s: '0900', dutyTime1c: '1800', ...o });

test('XML 정상 응답: 항목·totalCount·엔티티', () => {
  const r = parseXmlPage(xml([{ hpid: 'A', dutyName: '가 &amp; 나' }], { total: 7 }));
  assert.equal(r.totalCount, 7);
  assert.deepEqual(r.items, [{ hpid: 'A', dutyName: '가 & 나' }]);
  assert.deepEqual(parseXmlPage(xml([], { total: 0 })), { items: [], totalCount: 0 });
});

test('오류 응답은 빈 목록이 아니라 예외, 제공자 원문(키 반사)은 메시지에 넣지 않음', () => {
  const secret = 'SECRETKEY123%2B%3D%3D';
  for (const body of [gw('30', `SERVICE_KEY_IS_NOT_REGISTERED_ERROR serviceKey=${secret}`), gw('<b>x</b>', secret)]) {
    assert.throws(() => parseXmlPage(body), (e) => { assert.ok(!e.message.includes(secret) && !e.message.includes('SECRET')); return /^포털 오류 /.test(e.message); });
  }
  assert.throws(() => parseXmlPage(gw('30', 'x')), /등록되지 않은 키/);
  const bad = xml([], { code: '99' }).replace('NORMAL SERVICE.', `bad key ${secret}`);
  assert.throws(() => parseXmlPage(bad), (e) => e.message === '결과 오류 99');
  assert.throws(() => parseXmlPage('<html>점검 중</html>'), /응답 형식/);
  assert.throws(() => parseXmlPage(''), /응답 형식/);
});

test('시간 표기: 원문 범위만, 같은 시작·종료와 2400 초과는 미확인', () => {
  assert.equal(hhmm('900'), '0900');
  assert.equal(hhmm('2400'), '2400');
  assert.equal(hhmm('2430'), null);
  assert.equal(hhmm('2600'), null);
  assert.equal(hhmm('1260'), null);
  assert.equal(hhmm('09:00'), null);
  assert.deepEqual(dayHours({ dutyTime1s: '0900', dutyTime1c: '2400' }, 1), { v: ['0900', '2400'], odd: false });
  assert.deepEqual(dayHours({ dutyTime1s: '2200', dutyTime1c: '0200' }, 1), { v: ['2200', '0200'], odd: false }); // 원문 그대로, 해석 안 함
  assert.deepEqual(dayHours({ dutyTime1s: '0000', dutyTime1c: '0000' }, 1), { v: null, odd: true }); // 24시간이라 단정 안 함
  assert.deepEqual(dayHours({ dutyTime1s: '0900', dutyTime1c: '0900' }, 1), { v: null, odd: true });
  assert.deepEqual(dayHours({ dutyTime1s: '2400', dutyTime1c: '0100' }, 1), { v: null, odd: true });
  assert.deepEqual(dayHours({ dutyTime8s: '0900' }, 8), { v: null, odd: true });
  assert.deepEqual(dayHours({}, 7), { v: null, odd: false }); // 시간 없음 ≠ 휴무
});

test('좌표·주소 → 시·군·구: 범위 밖·빈 좌표는 점 없음, 주소와 다른 좌표는 버림', () => {
  assert.deepEqual(placeOf(ph()), { sgg: '11440', lat: 37.556, lon: 126.905 });
  assert.deepEqual(placeOf(ph({ wgs84Lat: '', wgs84Lon: '' })), { sgg: '11440' });
  assert.deepEqual(placeOf(ph({ wgs84Lat: '0', wgs84Lon: '0' })), { sgg: '11440' });
  assert.deepEqual(placeOf(ph({ wgs84Lat: 'abc', wgs84Lon: '126.9' })), { sgg: '11440' });
  assert.deepEqual(placeOf(ph({ wgs84Lat: '37.5735', wgs84Lon: '126.9769' })), { sgg: '11440', conflict: true }); // 종로 좌표
  assert.deepEqual(placeOf(ph({ dutyAddr: '어딘가 1', wgs84Lat: '', wgs84Lon: '' })), { sgg: null });
  assert.equal(placeOf(ph({ dutyAddr: '주소 불명' })).sgg, '11440'); // 주소를 못 풀면 좌표의 시·군·구
});

test('약국 변환: 필수값 누락·중복·지역 미확정 집계, 요일 8칸', () => {
  const r = toPharmacyBySgg([
    ph(), ph(), ph({ hpid: '' }), ph({ hpid: 'C2', dutyName: '' }),
    ph({ hpid: 'C3', dutyAddr: '해외 1', wgs84Lat: '', wgs84Lon: '' }),
    ph({ hpid: 'C4', dutyName: '가나약국', dutyTime8s: '1000', dutyTime8c: '1500', dutyTime2s: '0000', dutyTime2c: '0000' }),
  ]);
  assert.equal(r.invalid, 2);
  assert.equal(r.unplaced, 1);
  assert.equal(r.oddTimes, 1);
  assert.deepEqual(r.by['11440'].map((x) => x.id), ['C4', 'C1']); // 이름순
  const c4 = r.by['11440'][0];
  assert.equal(c4.hours.length, 8);
  assert.deepEqual(c4.hours[7], ['1000', '1500']);
  assert.equal(c4.hours[1], null);
});

test('응급실: dutyEryn=1만, 2·빈 값은 제외(병상·장비 필드로 판정하지 않음)', () => {
  const base = { dutyName: '한빛병원', dutyAddr: '서울특별시 마포구 독막로 1', wgs84Lat: '37.556', wgs84Lon: '126.905' };
  const list = [
    { hpid: 'A1', ...base, dutyEmclsName: '지역응급의료기관' },
    { hpid: 'A2', ...base },
    { hpid: 'A3', ...base },
    { hpid: 'A4', ...base, hvec: '10' }, // 병상 값만 있고 운영 여부 없음
    { hpid: 'A1', ...base },
  ];
  const bass = { A1: { hpid: 'A1', dutyEryn: '1', dutyTel3: '02-111-1111', dutyTel1: '02-222-2222' }, A2: { hpid: 'A2', dutyEryn: '2' }, A3: { hpid: 'A3', dutyEryn: '' } };
  const r = toEmergency(list, bass);
  assert.deepEqual(r.items.map((x) => x.id), ['A1']);
  assert.equal(r.items[0].erPhone, '02-111-1111');
  assert.equal(r.items[0].cls, '지역응급의료기관');
  assert.equal(r.notOperating, 1);
  assert.equal(r.unknown, 2);
  // 목록에 dutyEryn이 있으면 그대로
  assert.deepEqual(toEmergency([{ hpid: 'B', ...base, dutyEryn: '1' }]).items.map((x) => x.id), ['B']);
});

test('완전성: 일부·0건·중복·totalCount 변동·급감은 전국 갱신으로 인정하지 않음', () => {
  assert.deepEqual(assessComplete({ totalCount: 10, received: 10 }), { ok: true });
  assert.equal(assessComplete({ totalCount: 10, received: 9 }).ok, false);
  assert.equal(assessComplete({ totalCount: 0, received: 0 }).ok, false);
  assert.equal(assessComplete({ totalCount: undefined, received: 5 }).ok, false);
  assert.equal(assessComplete({ totalCount: 10, received: 10, unique: 9 }).ok, false);
  assert.equal(assessComplete({ totalCount: 10, received: 10, totalChanged: true }).ok, false);
  assert.equal(assessComplete({ totalCount: 10, received: 10, failedPages: 1 }).ok, false);
  assert.equal(assessComplete({ totalCount: 70, received: 70, prevTotal: 100 }).ok, false);
  assert.equal(assessComplete({ totalCount: 85, received: 85, prevTotal: 100 }).ok, true);
});

test('전국 개수는 모든 시·군·구에 0 포함', () => {
  const c = fullCounts({ 11440: [1, 2] });
  assert.equal(c['11440'], 2);
  assert.equal(c['11110'], 0);
  assert.ok(Object.keys(c).length >= 250);
});

// 가짜 fetch: 쪽 번호별 응답
const fakeFetch = (pages, seen = []) => async (url) => {
  seen.push(url);
  const u = new URL(url);
  const body = pages(Number(u.searchParams.get('pageNo')), u);
  if (body instanceof Error) throw body;
  return { ok: true, status: 200, text: async () => body };
};

test('게이트웨이 오류는 HTTP 403이어도 코드(활용신청 필요)로, 그 밖의 HTTP 오류는 상태 코드로', async () => {
  const f403 = async () => ({ ok: false, status: 403, text: async () => gw('30', 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR') });
  await assert.rejects(fetchAllPages(PHARMACY_URL, 'K', { fetchImpl: f403 }), (e) => e.message === '포털 오류 30 등록되지 않은 키(활용신청 필요)');
  const f500 = async () => ({ ok: false, status: 500, text: async () => '<html>K</html>' });
  await assert.rejects(fetchAllPages(PHARMACY_URL, 'K', { fetchImpl: f500 }), (e) => e.message === 'HTTP 500');
});
const rowsOf = (from, n) => Array.from({ length: n }, (_, i) => ph({ hpid: `P${from + i}` }));

test('페이징: 끝까지 받으면 성공, 겹친 쪽·한 쪽 실패·도중 totalCount 변동은 실패', async () => {
  const ok = await fetchAllPages(PHARMACY_URL, 'K', { rows: 2, fetchImpl: fakeFetch((p) => xml(rowsOf((p - 1) * 2, p === 3 ? 1 : 2), { total: 5 })) });
  assert.equal(ok.rows.length, 5);
  await assert.rejects(fetchAllPages(PHARMACY_URL, 'K', { rows: 2, fetchImpl: fakeFetch((p) => xml(rowsOf(p === 2 ? 0 : (p - 1) * 2, p === 3 ? 1 : 2), { total: 5 })) }), /중복/);
  await assert.rejects(fetchAllPages(PHARMACY_URL, 'K', { rows: 2, fetchImpl: fakeFetch((p) => (p === 2 ? gw('22', 'LIMITED') : xml(rowsOf((p - 1) * 2, 2), { total: 5 }))) }), /한도 초과/);
  await assert.rejects(fetchAllPages(PHARMACY_URL, 'K', { rows: 2, fetchImpl: fakeFetch((p) => xml(rowsOf((p - 1) * 2, p === 3 ? 1 : 2), { total: p === 1 ? 5 : 6 })) }), /totalCount/);
  await assert.rejects(fetchAllPages(PHARMACY_URL, 'K', { rows: 2, fetchImpl: fakeFetch(() => xml([], { total: 0 })) }), /0건/);
  await assert.rejects(fetchAllPages(PHARMACY_URL, 'K', { rows: 2, fetchImpl: fakeFetch((p) => (p === 1 ? xml(rowsOf(0, 2), { total: 5 }) : xml([], { total: 5 }))) }), /일부만/);
});

test('응급실 상세: 기관ID 다르면 실패, 예산 초과면 상세를 부르지 않음', async () => {
  const base = { dutyName: '한빛병원', dutyAddr: '서울특별시 마포구 독막로 1' };
  const make = (bassId) => fakeFetch((p, u) => (u.pathname.endsWith('getEgytBassInfoInqire') ? xml([{ hpid: bassId(u.searchParams.get('HPID')), dutyEryn: '1' }]) : xml([{ hpid: 'E1', ...base }, { hpid: 'E2', ...base }])));
  const good = await fetchEmergency({ key: 'K', fetchImpl: make((id) => id) });
  assert.equal(good.items.length, 2);
  await assert.rejects(fetchEmergency({ key: 'K', fetchImpl: make(() => 'OTHER') }), /기관ID/);
  const seen = [];
  const many = Array.from({ length: BASS_BUDGET + 1 }, (_, i) => ({ hpid: `M${i}`, ...base }));
  await assert.rejects(fetchEmergency({ key: 'K', fetchImpl: fakeFetch((p) => (p === 1 ? xml(many) : xml([], { total: many.length })), seen) }), /예산/);
  assert.ok(seen.every((u) => !u.includes('getEgytBassInfoInqire')));
});

// ---------- 갱신·유지 규칙 ----------
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nallae-med-'));
const NOW = new Date('2026-10-22T03:00:00Z');
const quiet = async (fn) => { const log = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = log; } };
const prevSet = () => {
  const counts = fullCounts({ 11440: [1, 2] });
  return {
    'pharmacy/index.json': { updated: '2026-10-21T00:00:00Z', checkedAt: '2026-10-21T00:00:00Z', complete: true, total: 2, sourceTotal: 2, counts },
    'pharmacy/11440.json': { updated: '2026-10-21T00:00:00Z', items: [{ id: 'C1' }, { id: 'C2' }] },
  };
};
const reader = (files) => async (p) => (p in files ? structuredClone(files[p]) : null);
const readOut = (dir, f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));

test('간격: 성공 뒤 24시간, 실패 뒤 실패 간격, 강제는 항상', () => {
  assert.equal(isDue(null, NOW, 24, 3), true);
  assert.equal(isDue({ updated: '2026-10-22T00:00:00Z' }, NOW, 24, 3), false);
  assert.equal(isDue({ updated: '2026-10-21T02:00:00Z' }, NOW, 24, 3), true);
  assert.equal(isDue({ updated: '2026-10-20T00:00:00Z', lastFailure: { at: '2026-10-22T01:00:00Z' } }, NOW, 24, 3), false);
  assert.equal(isDue({ updated: '2026-10-20T00:00:00Z', lastFailure: { at: '2026-10-21T23:00:00Z' } }, NOW, 24, 3), true);
  assert.equal(isDue({ complete: false, lastFailure: { at: '2026-10-22T01:00:00Z' } }, NOW, 24, 24), false);
  assert.equal(isDue({ updated: '2026-10-22T02:00:00Z' }, NOW, 24, 3, true), true);
});

test('약국: 부분 실패·0건은 직전 정상 자료를 덮지 않고 실패만 기록', async () => {
  for (const fetcher of [async () => { throw new Error('일부만 받음 400/500'); }, async () => ({ by: {}, count: 0, totalCount: 0 })]) {
    const dir = tmp();
    const r = await quiet(() => updatePharmacy({ dir, prevJson: reader(prevSet()), now: NOW, fetcher }));
    assert.equal(r, 'kept');
    const idx = readOut(dir, 'index.json');
    assert.equal(idx.updated, '2026-10-21T00:00:00Z');
    assert.equal(idx.counts['11440'], 2);
    assert.ok(idx.lastFailure?.at);
    assert.equal(readOut(dir, '11440.json').items.length, 2);
  }
});

test('약국: 직전 파일 하나라도 못 받으면 개수 없이 실패 기록(0곳으로 만들지 않음)', async () => {
  const dir = tmp();
  const files = prevSet();
  delete files['pharmacy/11440.json'];
  const r = await quiet(() => updatePharmacy({ dir, prevJson: reader(files), now: NOW, fetcher: async () => { throw new Error('x'); } }));
  assert.equal(r, 'failed');
  const idx = readOut(dir, 'index.json');
  assert.equal(idx.complete, false);
  assert.equal(idx.counts, undefined);
  assert.ok(!fs.existsSync(path.join(dir, '11440.json')));
});

test('약국: 직전 자료 없이 실패해도 실패 기록만, 다음 실행은 간격을 지킴', async () => {
  const dir = tmp();
  await quiet(() => updatePharmacy({ dir, prevJson: reader({}), now: NOW, fetcher: async () => { throw new Error('포털 오류 30 등록되지 않은 키(활용신청 필요)'); } }));
  const idx = readOut(dir, 'index.json');
  assert.equal(idx.counts, undefined);
  let called = false;
  const later = new Date(NOW.getTime() + 3600e3);
  await quiet(() => updatePharmacy({ dir, prevJson: reader({ 'pharmacy/index.json': idx }), now: later, fetcher: async () => { called = true; return {}; } }));
  assert.equal(called, false);
  assert.ok(readOut(dir, 'index.json').lastFailure.error.includes('활용신청'));
});

test('약국: 완전한 새 자료는 전체 교체, 0곳 지역도 명시', async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'old.json'), '{}');
  const by = { 11110: [{ id: 'N1' }] };
  const r = await quiet(() => updatePharmacy({ dir, prevJson: reader(prevSet()), now: NOW, force: true, fetcher: async (prevTotal) => { assert.equal(prevTotal, 2); return { by, count: 1, totalCount: 1, unplaced: 0, invalid: 0, oddTimes: 0 }; } }));
  assert.equal(r, 'updated');
  const idx = readOut(dir, 'index.json');
  assert.equal(idx.complete, true);
  assert.equal(idx.counts['11440'], 0);
  assert.ok(!fs.existsSync(path.join(dir, 'old.json')));
  assert.ok(!fs.existsSync(path.join(dir, '11440.json')));
});

test('응급실: 실패·0곳은 직전 자료 유지, 직전 없으면 items 없이 실패 기록', async () => {
  const dir = tmp(), out = path.join(dir, 'er.json');
  const prev = { 'er.json': { updated: '2026-10-21T00:00:00Z', complete: true, sourceTotal: 3, items: [{ id: 'A1', sgg: '11440' }], counts: { 11440: 1 } } };
  for (const fetcher of [async () => { throw new Error('기본정보 기관ID가 요청과 다름'); }, async () => ({ items: [], totalCount: 3 })]) {
    assert.equal(await quiet(() => updateEmergency({ out, prevJson: reader(prev), now: NOW, fetcher })), 'kept');
    const j = readOut(dir, 'er.json');
    assert.equal(j.items.length, 1);
    assert.equal(j.updated, '2026-10-21T00:00:00Z');
    assert.ok(j.lastFailure);
  }
  assert.equal(await quiet(() => updateEmergency({ out, prevJson: reader({}), now: NOW, fetcher: async () => { throw new Error('x'); } })), 'failed');
  const j = readOut(dir, 'er.json');
  assert.equal(j.items, undefined);
  assert.equal(j.complete, false);
});

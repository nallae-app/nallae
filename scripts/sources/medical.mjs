// 약국·응급실 — 국립중앙의료원 공공데이터포털 API (필요: DATA_GO_KR_KEY, 서비스별 활용신청)
//   약국: 국립중앙의료원_전국 약국 정보 조회 서비스 (data.go.kr 15000576)
//         https://apis.data.go.kr/B552657/ErmctInsttInfoInqireService/getParmacyListInfoInqire
//   응급실: 국립중앙의료원_전국 응급의료기관 정보 조회 서비스 (data.go.kr 15000563)
//         목록 getEgytListInfoInqire + 기본정보 getEgytBassInfoInqire (dutyEryn: 응급실운영여부 1/2)
// 응답은 XML. 키는 주소에만 넣고 오류 문구·로그에는 넣지 않는다(제공자 원문 메시지도 넣지 않는다).
//
// 완전성 원칙 (기존 perSggDaily의 95% 허용과 다르다)
//  - 모든 페이지 성공 + 받은 행 수 = totalCount + 기관ID 중복 없음 + 쪽마다 totalCount 같음 일 때만 '전국 갱신'.
//  - 하나라도 어긋나면 이번 결과를 버리고 직전 정상 자료를 그대로 둔다(collect.mjs).
//  - 지역별 0건은 전국 자료가 완전할 때만 '자료상 0곳'으로 적는다. 실패를 '시설 없음'으로 만들지 않는다.
//  - 응급실은 공식 필드 dutyEryn === '1'(응급실운영여부)인 기관만. 값이 없거나 2면 넣지 않는다.
//  - 실시간 가용병상(getEmrrmRltmUsefulSckbdInfoInqire)은 필드 설명('hvec: 응급실')만으로 수용 가능 여부를
//    알 수 없어 쓰지 않는다.
import { sggAt } from './festivals.mjs';
import { resolvePlace, regionIndex } from '../lib/regions.mjs';

const BASE = 'https://apis.data.go.kr/B552657';
export const PHARMACY_URL = `${BASE}/ErmctInsttInfoInqireService/getParmacyListInfoInqire`;
export const ER_LIST_URL = `${BASE}/ErmctInfoInqireService/getEgytListInfoInqire`;
export const ER_BASS_URL = `${BASE}/ErmctInfoInqireService/getEgytBassInfoInqire`;
// 개발계정 하루 1,000건 안에서 상세 조회 상한(목록 쪽 수·재시도 몫을 남긴다)
export const BASS_BUDGET = 780;
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// 포털 게이트웨이 오류 코드 → 고정 문구
const GATEWAY = {
  '12': '서비스 없음·폐기', '20': '서비스 접근 거부(활용신청 필요)', '22': '일일 호출 한도 초과', '23': '초당 호출 한도 초과',
  '30': '등록되지 않은 키(활용신청 필요)', '31': '키 사용 기한 만료', '32': '등록되지 않은 IP', '99': '기타 오류',
};
const decode = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`)); return m ? decode(m[1]).trim() : undefined; };
const safeCode = (c) => (/^\d{1,3}$/.test(String(c ?? '')) ? String(c) : '?');

/**
 * 응답 XML 한 쪽 → { items, totalCount }. 오류 응답이면 던진다(빈 목록으로 바꾸지 않는다).
 * 오류 문구에는 숫자 코드와 고정 문구만 넣는다(errMsg·resultMsg 원문은 요청 주소·키를 되돌려 줄 수 있다).
 */
export function parseXmlPage(xml) {
  const text = String(xml || '');
  if (/<OpenAPI_ServiceResponse>/.test(text)) {
    const code = safeCode(tag(text, 'returnReasonCode'));
    throw Object.assign(new Error(`포털 오류 ${code} ${GATEWAY[code] || '알 수 없는 오류'}`), { code: `gw${code}` });
  }
  const resultCode = tag(text, 'resultCode');
  if (resultCode === undefined) throw Object.assign(new Error('응답 형식이 다름(resultCode 없음)'), { code: 'format' });
  if (resultCode !== '00') { const c = safeCode(resultCode); throw Object.assign(new Error(`결과 오류 ${c}`), { code: `r${c}` }); }
  const totalTag = tag(text, 'totalCount');
  const items = [...text.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, body]) => {
    const o = {};
    for (const [, k, v] of body.matchAll(/<([A-Za-z0-9_]+)>([\s\S]*?)<\/\1>/g)) o[k] = decode(v).trim();
    return o;
  });
  const totalCount = totalTag === undefined || totalTag === '' ? NaN : Number(totalTag);
  return { items, totalCount: Number.isFinite(totalCount) ? totalCount : undefined };
}

/** 'HHMM'(3~4자리) → 'HHMM'. 00:00~23:59와 2400만. 2400 초과 등 근거 없는 표기는 null */
export function hhmm(s) {
  const t = clean(s);
  if (!/^\d{3,4}$/.test(t)) return null;
  const v = t.padStart(4, '0'), h = Number(v.slice(0, 2)), m = Number(v.slice(2));
  return m < 60 && (h < 24 || v === '2400') ? v : null;
}

/**
 * 요일 n(1=월 … 7=일, 8=공휴일)의 ['시작','종료'] 원문. 자정 넘김·24시간 운영 같은 해석은 하지 않는다.
 * 둘 다 비면 null(자료에 시간 없음 — 휴무라고 단정하지 않는다). 하나만 있거나 표기가 이상하면 null + odd.
 * 종료가 시작보다 이른 값(예: 2200-0200)은 원문 그대로 두고 앱에서도 '다음 날'로 해석해 쓰지 않는다.
 */
export function dayHours(r, n) {
  const rs = clean(r[`dutyTime${n}s`]), rc = clean(r[`dutyTime${n}c`]);
  if (!rs && !rc) return { v: null, odd: false };
  const s = hhmm(rs), c = hhmm(rc);
  // 시작=종료(0000/0000 등)는 24시간 운영인지 표기 오류인지 공식 근거가 없어 미확인으로 둔다
  if (!s || !c || s === '2400' || s === c) return { v: null, odd: true };
  return { v: [s, c], odd: false };
}

/** 주소 → 시·군·구(하나로 풀릴 때만), 좌표 → 시·군·구. 둘이 다르면 주소를 따르고 좌표는 버린다(지도 점 없음) */
export function placeOf(r) {
  const rawLat = clean(r.wgs84Lat), rawLon = clean(r.wgs84Lon);
  const lat = Number(rawLat), lon = Number(rawLon);
  const inKorea = rawLat !== '' && rawLon !== '' && lat > 32.9 && lat < 38.7 && lon > 124.5 && lon < 132;
  const bySgg = inKorea ? sggAt(lon, lat) : null;
  const res = resolvePlace(clean(r.dutyAddr), { strict: true }).sgg;
  const byAddr = res.length === 1 ? res[0] : null;
  if (byAddr && bySgg && byAddr !== bySgg) return { sgg: byAddr, conflict: true };
  const sgg = byAddr || bySgg;
  if (!sgg) return { sgg: null };
  return bySgg === sgg ? { sgg, lat: +lat.toFixed(6), lon: +lon.toFixed(6) } : { sgg };
}

/**
 * 약국 원자료 행 → { by: {sgg: [약국]}, unplaced, invalid, conflicts, oddTimes }
 * hours: [월,화,수,목,금,토,일,공휴일] 각각 ['HHMM','HHMM'] 원문 또는 null(시간 없음·표기 이상)
 */
export function toPharmacyBySgg(rows) {
  const by = {}, seen = new Set();
  let unplaced = 0, invalid = 0, conflicts = 0, oddTimes = 0;
  for (const r of rows) {
    const id = clean(r.hpid), name = clean(r.dutyName), address = clean(r.dutyAddr);
    if (!id || !name || !address) { invalid++; continue; }
    if (seen.has(id)) continue;
    seen.add(id);
    const p = placeOf(r);
    if (p.conflict) conflicts++;
    if (!p.sgg) { unplaced++; continue; }
    const days = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => dayHours(r, n));
    oddTimes += days.filter((d) => d.odd).length;
    (by[p.sgg] ??= []).push({
      id, name, address,
      phone: clean(r.dutyTel1) || undefined,
      ...(p.lat !== undefined ? { lat: p.lat, lon: p.lon } : {}),
      hours: days.map((d) => d.v),
    });
  }
  for (const list of Object.values(by)) list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return { by, unplaced, invalid, conflicts, oddTimes };
}

/**
 * 응급의료기관 목록 행 + 기본정보(hpid별) → 응급실 운영 기관만.
 * 운영 판정은 dutyEryn(기본정보, 목록에 같은 필드가 있으면 그것)만 쓴다. 병상·장비 필드는 쓰지 않는다.
 */
export function toEmergency(listRows, bassById = {}) {
  const items = [], seen = new Set();
  let notOperating = 0, unknown = 0, unplaced = 0, invalid = 0;
  for (const l of listRows) {
    const id = clean(l.hpid);
    if (!id) { invalid++; continue; }
    if (seen.has(id)) continue;
    seen.add(id);
    const b = bassById[id] || {};
    const r = { ...l, ...Object.fromEntries(Object.entries(b).filter(([, v]) => clean(v) !== '')) };
    const eryn = clean(r.dutyEryn);
    if (eryn === '2') { notOperating++; continue; }
    if (eryn !== '1') { unknown++; continue; } // 운영 여부를 공식 필드로 확인 못 하면 넣지 않는다
    const name = clean(r.dutyName), address = clean(r.dutyAddr);
    if (!name || !address) { invalid++; continue; }
    const p = placeOf(r);
    if (!p.sgg) { unplaced++; continue; }
    items.push({
      id, name, address, sgg: p.sgg,
      cls: clean(r.dutyEmclsName) || undefined, // 공식 기관 분류명 그대로(예: 지역응급의료기관)
      erPhone: clean(r.dutyTel3) || undefined,   // 응급실전화
      phone: clean(r.dutyTel1) || undefined,     // 대표전화
      ...(p.lat !== undefined ? { lat: p.lat, lon: p.lon } : {}),
    });
  }
  items.sort((a, b) => a.sgg.localeCompare(b.sgg) || a.name.localeCompare(b.name, 'ko'));
  return { items, notOperating, unknown, unplaced, invalid };
}

/**
 * 전국 갱신으로 인정할지. 모든 페이지 성공 + 받은 행 = totalCount + 기관ID 중복 없음 + 쪽마다 totalCount 같음
 * + 직전보다 급감(80% 미만)하지 않음.
 * @returns {{ ok: boolean, reason?: string }}
 */
export function assessComplete({ totalCount, received, unique = received, totalChanged = false, failedPages = 0, prevTotal }) {
  if (failedPages > 0) return { ok: false, reason: `페이지 ${failedPages}개 실패` };
  if (totalChanged) return { ok: false, reason: '받는 도중 totalCount가 바뀜' };
  if (!Number.isFinite(totalCount)) return { ok: false, reason: 'totalCount 없음' };
  if (totalCount <= 0 || received <= 0) return { ok: false, reason: '0건 응답' };
  if (received !== totalCount) return { ok: false, reason: `일부만 받음 ${received}/${totalCount}` };
  if (unique !== received) return { ok: false, reason: `중복 기관ID ${received - unique}건(쪽 겹침 의심)` };
  if (Number.isFinite(prevTotal) && prevTotal > 0 && totalCount < prevTotal * 0.8) return { ok: false, reason: `직전 ${prevTotal}건보다 급감 ${totalCount}건` };
  return { ok: true };
}

/** 전국 시·군·구 모두에 대한 개수(없는 곳은 0). 전국 자료가 완전할 때만 부른다 */
export function fullCounts(by) {
  const counts = {};
  for (const r of regionIndex.sgg) counts[r.code] = by[r.code]?.length || 0;
  for (const [c, l] of Object.entries(by)) counts[c] = l.length;
  return counts;
}

async function getPage(url, params, key, fetchImpl = fetch) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetchImpl(`${url}?serviceKey=${encodeURIComponent(key)}&${qs}`, { signal: AbortSignal.timeout(45000) });
  const text = await res.text();
  // 포털 게이트웨이 오류(키 미등록 등)는 HTTP 403 등과 함께 오므로 본문 코드를 먼저 본다
  if (!res.ok && !/<OpenAPI_ServiceResponse>/.test(text)) throw Object.assign(new Error(`HTTP ${res.status}`), { code: `http${res.status}` });
  return parseXmlPage(text);
}

/** 전국을 쪽 단위로 끝까지. 한 쪽이라도 실패하거나 완전성 검사에 걸리면 이유를 담아 던진다 */
export async function fetchAllPages(url, key, { rows = 500, maxPages = 120, prevTotal, fetchImpl } = {}) {
  const all = [];
  let totalCount, totalChanged = false;
  for (let page = 1; page <= maxPages; page++) {
    const r = await getPage(url, { pageNo: page, numOfRows: rows }, key, fetchImpl);
    if (page === 1) totalCount = r.totalCount; else if (r.totalCount !== totalCount) totalChanged = true;
    all.push(...r.items);
    if (!r.items.length || all.length >= (totalCount ?? 0)) break;
  }
  const unique = new Set(all.map((x) => clean(x.hpid)).filter(Boolean)).size;
  const a = assessComplete({ totalCount, received: all.length, unique, totalChanged, prevTotal });
  if (!a.ok) throw Object.assign(new Error(a.reason), { code: 'incomplete' });
  return { rows: all, totalCount };
}

export async function fetchPharmacies({ key, prevTotal, fetchImpl }) {
  if (!key) return { skipped: 'DATA_GO_KR_KEY 없음' };
  const { rows, totalCount } = await fetchAllPages(PHARMACY_URL, key, { prevTotal, fetchImpl });
  const r = toPharmacyBySgg(rows);
  const count = Object.values(r.by).reduce((a, l) => a + l.length, 0);
  console.log(`  약국 원자료 ${rows.length}/${totalCount} → ${count}곳 (지역 미확정 ${r.unplaced}, 필수값 없음 ${r.invalid}, 주소·좌표 지역 불일치 ${r.conflicts}는 좌표 제외, 시간 표기 이상 ${r.oddTimes}칸)`);
  return { by: r.by, count, totalCount, unplaced: r.unplaced, invalid: r.invalid, oddTimes: r.oddTimes };
}

/** 응급실: 목록 전체 → 목록에 dutyEryn이 없는 기관만 기본정보 조회(동시 4개). 하나라도 실패하면 전체 실패 */
export async function fetchEmergency({ key, prevTotal, fetchImpl }) {
  if (!key) return { skipped: 'DATA_GO_KR_KEY 없음' };
  const { rows, totalCount } = await fetchAllPages(ER_LIST_URL, key, { rows: 300, maxPages: 20, prevTotal, fetchImpl });
  const need = [...new Set(rows.filter((r) => clean(r.dutyEryn) === '' && clean(r.hpid)).map((r) => clean(r.hpid)))];
  if (need.length > BASS_BUDGET) throw Object.assign(new Error(`상세 조회 ${need.length}건 — 하루 예산 ${BASS_BUDGET}건 초과`), { code: 'budget' });
  const bass = {};
  for (let i = 0; i < need.length; i += 4) {
    await Promise.all(need.slice(i, i + 4).map(async (id) => {
      const r = await getPage(ER_BASS_URL, { HPID: id, pageNo: 1, numOfRows: 1 }, key, fetchImpl);
      if (r.items.length !== 1) throw Object.assign(new Error(`기본정보 ${r.items.length}건`), { code: 'bass' });
      if (clean(r.items[0].hpid) !== id) throw Object.assign(new Error('기본정보 기관ID가 요청과 다름'), { code: 'bass-id' });
      bass[id] = r.items[0];
    }));
  }
  const e = toEmergency(rows, bass);
  console.log(`  응급의료기관 목록 ${rows.length}/${totalCount}(기본정보 조회 ${need.length}) → 응급실 운영 ${e.items.length}곳 (미운영 ${e.notOperating}, 운영여부 미확인 ${e.unknown}, 지역 미확정 ${e.unplaced})`);
  return { ...e, totalCount, bassCalls: need.length };
}

// ---------- 갱신·유지 규칙 (collect.mjs가 부른다) ----------
// 시도 기록(checkedAt·lastFailure)으로 간격을 지켜 일일 호출 한도(개발계정 1,000)를 넘지 않는다.
//   약국: 성공 24시간·실패 3시간 간격(한 번 약 50쪽 → 하루 최대 약 400건)
//   응급실: 성공·실패 모두 24시간(목록 2쪽 + 상세 최대 BASS_BUDGET건)
// 직전 정상 자료를 온전히 다시 쓸 수 없으면 개수(counts) 없이 실패 기록만 남긴다
//   → 앱은 '자료를 받지 못했어요'로 안내하고 지역을 0곳으로 보이지 않는다.
export function isDue(prev, now, okHours, failHours, force = false) {
  if (force || !prev) return true;
  const fail = prev.lastFailure?.at && (!prev.updated || new Date(prev.lastFailure.at) > new Date(prev.updated));
  const last = new Date(fail ? prev.lastFailure.at : prev.updated || prev.checkedAt || 0);
  return !(now - last < (fail ? failHours : okHours) * 3600e3 - 5 * 60e3);
}
const failure = (now, e) => ({ at: now.toISOString(), error: String(e?.message || e).slice(0, 120) });
const logFail = (label, e) => console.log(`- ${label}: 실패 — ${e?.message || e}${e?.cause?.code ? ` (${e.cause.code})` : ''}`);

/**
 * 약국 시·군·구별 파일 갱신. prevJson(path)는 직전 배포 파일(JSON 또는 null).
 * @returns {'updated'|'kept'|'failed'|'skipped'}
 */
export async function updatePharmacy({ dir, prevJson, now, force = false, fetcher, fsImpl }) {
  const fs = fsImpl || (await import('node:fs')).default;
  const label = '약국';
  const prevIdx = await prevJson('pharmacy/index.json');
  const writeSet = (idx, by) => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    for (const [code, items] of Object.entries(by)) fs.writeFileSync(`${dir}/${code}.json`, JSON.stringify({ updated: idx.updated, items }));
    fs.writeFileSync(`${dir}/index.json`, JSON.stringify(idx));
  };
  const writeFailOnly = (meta) => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${dir}/index.json`, JSON.stringify({ complete: false, ...meta }));
  };
  // 직전 정상 자료를 빠짐없이 다시 쓴다. 한 파일이라도 못 받거나 개수가 다르면 실패(부분 재사용 안 함)
  const keepPrev = async (extra = {}) => {
    if (!prevIdx?.complete || !prevIdx.counts) { writeFailOnly({ checkedAt: prevIdx?.checkedAt || now.toISOString(), lastFailure: prevIdx?.lastFailure, ...extra }); return false; }
    const codes = Object.entries(prevIdx.counts).filter(([, n]) => n > 0).map(([c]) => c), by = {};
    for (let i = 0; i < codes.length; i += 16) {
      await Promise.all(codes.slice(i, i + 16).map(async (c) => {
        const f = await prevJson(`pharmacy/${c}.json`);
        if (Array.isArray(f?.items) && f.items.length === prevIdx.counts[c]) by[c] = f.items;
      }));
    }
    if (Object.keys(by).length !== codes.length) {
      const lost = failure(now, `직전 파일 ${Object.keys(by).length}/${codes.length}개만 받음`);
      writeFailOnly({ checkedAt: now.toISOString(), lastFailure: extra.lastFailure || lost, reuseFailure: lost });
      return false;
    }
    writeSet({ ...prevIdx, ...extra }, by);
    return true;
  };
  try {
    if (!isDue(prevIdx, now, 24, 3, force)) {
      const ok = await keepPrev();
      console.log(`- ${label}: 간격 안 — ${ok ? '직전 자료 유지' : '직전 정상 자료 없음·불완전'}`);
      return ok ? 'kept' : 'failed';
    }
    const r = await fetcher(prevIdx?.sourceTotal);
    if (r.skipped) { console.log(`- ${label}: 건너뜀 (${r.skipped})`); if (prevIdx) await keepPrev(); return 'skipped'; }
    if (!r.count) throw new Error('약국 0곳 — 자료 이상으로 보고 버림');
    writeSet({ updated: now.toISOString(), checkedAt: now.toISOString(), complete: true, source: '국립중앙의료원 전국 약국 정보 조회 서비스 (공공데이터포털)', total: r.count, sourceTotal: r.totalCount, unplaced: r.unplaced, invalid: r.invalid, oddTimes: r.oddTimes, counts: fullCounts(r.by) }, r.by);
    console.log(`- ${label}: ${r.count}곳 → ${dir}/`);
    return 'updated';
  } catch (e) {
    logFail(label, e);
    const ok = await keepPrev({ lastFailure: failure(now, e) });
    console.log(`  ${ok ? '직전 정상 자료 유지(실패 기록)' : '직전 정상 자료 없음 — 실패만 기록'}`);
    return ok ? 'kept' : 'failed';
  }
}

/** 응급실 전국 한 파일 갱신. @returns {'updated'|'kept'|'failed'|'skipped'} */
export async function updateEmergency({ out, prevJson, now, force = false, fetcher, fsImpl }) {
  const fs = fsImpl || (await import('node:fs')).default;
  const label = '응급실';
  const prevEr = await prevJson('er.json');
  const keepPrev = (extra = {}) => {
    const ok = !!(prevEr?.complete && Array.isArray(prevEr.items) && prevEr.items.length);
    fs.writeFileSync(out, JSON.stringify(ok ? { ...prevEr, ...extra } : { complete: false, checkedAt: prevEr?.checkedAt || now.toISOString(), lastFailure: prevEr?.lastFailure, ...extra }));
    return ok;
  };
  try {
    if (!isDue(prevEr, now, 24, 24, force)) {
      const ok = keepPrev();
      console.log(`- ${label}: 간격 안 — ${ok ? '직전 자료 유지' : '직전 정상 자료 없음·불완전'}`);
      return ok ? 'kept' : 'failed';
    }
    const r = await fetcher(prevEr?.sourceTotal);
    if (r.skipped) { console.log(`- ${label}: 건너뜀 (${r.skipped})`); if (prevEr) keepPrev(); return 'skipped'; }
    if (!r.items.length) throw new Error('응급실 운영 기관 0곳 — 자료 이상으로 보고 버림');
    const by = {};
    for (const x of r.items) (by[x.sgg] ??= []).push(x);
    fs.writeFileSync(out, JSON.stringify({ updated: now.toISOString(), checkedAt: now.toISOString(), complete: true, source: '국립중앙의료원 전국 응급의료기관 정보 조회 서비스 (공공데이터포털)', total: r.items.length, sourceTotal: r.totalCount, excluded: { notOperating: r.notOperating, unknown: r.unknown, unplaced: r.unplaced, invalid: r.invalid }, counts: fullCounts(by), items: r.items }));
    console.log(`- ${label}: ${r.items.length}곳 → ${out}`);
    return 'updated';
  } catch (e) {
    logFail(label, e);
    const ok = keepPrev({ lastFailure: failure(now, e) });
    console.log(`  ${ok ? '직전 정상 자료 유지(실패 기록)' : '직전 정상 자료 없음 — 실패만 기록'}`);
    return ok ? 'kept' : 'failed';
  }
}

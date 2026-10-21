// 주유소 기름값 — 오피넷(한국석유공사) Open API  https://www.opinet.co.kr/user/custapi/openApiInfo.do
// 필요: OPINET_KEY. 소식이 아니라 '상태' 데이터라 web/data/fuel.json으로 따로 낸다.
//  - 전국 평균(avgAllPrice)
//  - 시·군·구 평균(avgSigunPrice, 시·도별) → 앱 시·군·구 코드
//  - 시·도별 최저가 10곳(lowTop10) → 좌표(KATEC)를 위경도로 바꿔 지도 점으로
// 호출 수: 1 + 17개 시·도 × (평균 1(품목 생략=모든 제품) + 최저가 2) = 52회. 3시간마다 → 하루 약 420회.
// 실패 시 재시도가 더해진다. 2026-10-21 저녁: 키가 모든 요청에 빈 OIL을 돌려줌(한도 초과/정지 추정) → 수집 실패 후 3시간 쉰다(collect.mjs).
import { resolvePlace, regionIndex } from '../lib/regions.mjs';
import { katecToWgs84 } from '../lib/katec.mjs';
import { sggAt } from './festivals.mjs';

const API = 'https://www.opinet.co.kr/api';
export const PRODUCTS = { B027: '휘발유', D047: '경유' };
// 오피넷 시·도 코드. 공식 '지역코드 조회'(apiId 5, areaCode.do) 응답 예시는 2026-07 통합 뒤 전남·광주를 '20 전남광주' 하나로 준다.
// 예전 코드 07(전남)·16(광주)은 수집 첫날부터 매번 빈 OIL이었다(2026-10-21 정상 수집에도 전남광주 0곳, 10-22 로그 kind=empty).
export const OPINET_SIDO = { '01': '서울', '02': '경기', '03': '강원', '04': '충북', '05': '충남', '06': '전북', '08': '경북', '09': '경남', '10': '부산', '11': '제주', '14': '대구', '15': '인천', '17': '대전', '18': '울산', '19': '세종', '20': '전남광주' };

// 객체 키 '10'~'19'는 정수 키라 먼저 순회된다 → 호출 순서를 배열로 고정한다
export const SIDO_ORDER = Object.keys(OPINET_SIDO).sort();
const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? +Number(v).toFixed(2) : null);
const PACE_MS = 400, RETRY_MS = [2000, 6000];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 응답 본문 → OIL 배열. 오피넷은 연속 호출 중 HTTP 200에 빈 OIL이나 JSON 아닌 안내를 돌려줄 수 있다(2026-10-21 수집에서
 * 부산 휘발유 뒤 모든 요청이 빈 OIL). 빈 배열·구조 불량은 '자료 없음'이 아니라 실패로 본다.
 */
export function parseOil(text) {
  let j;
  try { j = JSON.parse(text); } catch { throw Object.assign(new Error('비JSON 응답'), { kind: 'not-json' }); }
  const rows = j?.RESULT?.OIL;
  if (!Array.isArray(rows)) throw Object.assign(new Error('RESULT.OIL 없음'), { kind: 'bad-shape' });
  if (!rows.length) throw Object.assign(new Error('빈 OIL'), { kind: 'empty' });
  return rows;
}

/** avgSigunPrice 행들 → { sgg코드: 가격 }. '서울 종로구', '경기 수원시'(구 전체) 등. 못 찾은 이름은 unmatched로 */
export function sigunToSgg(rows) {
  const out = {}, unmatched = [];
  for (const r of rows) {
    const price = num(r.PRICE);
    if (!price) continue;
    const res = resolvePlace(r.SIGUNNM, { strict: true });
    // '세종시'처럼 시·군·구가 하나뿐인 시·도는 시·도 이름으로 온다
    const only = res.sido.length === 1 ? regionIndex.sgg.filter((s) => s.sido === res.sido[0]) : [];
    const sgg = res.sgg.length ? res.sgg : only.length === 1 ? [only[0].code] : [];
    if (!sgg.length) { unmatched.push(r.SIGUNNM); continue; }
    for (const c of sgg) out[c] ??= price; // 같은 구가 두 번 나오면 먼저 온 값
  }
  return { prices: out, unmatched };
}

/** lowTop10 행 → 주유소 점. 좌표가 없거나 국내 밖이면 뺀다 */
export function toStation(r, prod) {
  const x = Number(r.GIS_X_COOR), y = Number(r.GIS_Y_COOR);
  if (!(x > 0 && y > 0)) return null;
  const { lat, lon } = katecToWgs84(x, y);
  const sgg = sggAt(lon, lat);
  if (!sgg) return null;
  return {
    id: String(r.UNI_ID),
    name: String(r.OS_NM || '').trim(),
    brand: r.POLL_DIV_CD || undefined,
    address: String(r.NEW_ADR || r.VAN_ADR || '').trim() || undefined,
    lat, lon, sgg,
    price: { [prod]: num(r.PRICE) },
  };
}

// 직렬 호출 + 간격. 실패(빈 OIL·비JSON·HTTP 오류·시간 초과)는 두 번까지 기다렸다 다시 묻는다. 키·URL은 기록하지 않는다.
let lastCall = 0;
async function get(path, key, params) {
  let err;
  for (let attempt = 0; attempt <= RETRY_MS.length; attempt++) {
    const wait = lastCall + (attempt ? RETRY_MS[attempt - 1] : PACE_MS) - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    try {
      const qs = new URLSearchParams({ out: 'json', code: key, ...params });
      const res = await fetch(`${API}/${path}?${qs}`, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { kind: 'http' });
      return parseOil(await res.text());
    } catch (e) { err = e; }
  }
  throw Object.assign(new Error(`오피넷 ${path} ${err.message}`), { kind: err.kind || (err.name === 'TimeoutError' ? 'timeout' : 'network') });
}

/**
 * 실패한 시·도×유종은 직전 파일의 값을 그 기준 시각과 함께 유지한다(새 시각으로 포장하지 않는다).
 * 직전 파일의 areas(시·군·구 → 오피넷 시·도)로 어느 값이 그 시·도 것인지 안다. 시 전체·최저가 평균으로 대체하지 않는다.
 */
export function mergeFuel(cur, prev) {
  const sgg = structuredClone(cur.sgg), asOf = {}, areas = { ...cur.areas };
  const kept = [];
  for (const { sido, prod } of cur.failed.filter((x) => x.what === 'avg')) {
    let n = 0;
    for (const [code, area] of Object.entries(prev?.areas || {})) {
      if (area !== sido) continue;
      const old = prev.sgg?.[code]?.[prod];
      if (!Number.isFinite(old) || Number.isFinite(sgg[code]?.[prod])) continue;
      (sgg[code] ??= {})[prod] = old;
      (asOf[code] ??= {})[prod] = prev.asOf?.[code]?.[prod] || prev.updated;
      areas[code] = sido; n++;
    }
    kept.push({ sido, prod, kept: n });
  }
  return { sgg, asOf, areas, kept };
}

export async function fetchFuel({ key }) {
  if (!key) return { skipped: 'OPINET_KEY 없음' };
  const all = await get('avgAllPrice.do', key, {});
  const national = {};
  let tradeDate;
  for (const r of all) if (PRODUCTS[r.PRODCD]) {
    national[r.PRODCD] = { price: num(r.PRICE), diff: Number(r.DIFF) || 0 };
    tradeDate ??= r.TRADE_DT;
  }
  if (!national.B027) throw new Error('오피넷 전국 평균 없음');

  const sgg = {}, areas = {}, stations = new Map(), unmatched = new Set(), failed = [];
  for (const sido of SIDO_ORDER) {
    // 시군구 평균: 품목을 생략해 한 번에 받고 PRODCD로 나눈다. 받은 행에 그 유종이 없으면 그 유종만 실패로 본다.
    let rows = null;
    try { rows = await get('avgSigunPrice.do', key, { sido }); } catch (e) { for (const prod of Object.keys(PRODUCTS)) failed.push({ what: 'avg', sido, prod, kind: e.kind }); }
    if (rows) for (const prod of Object.keys(PRODUCTS)) {
      const avg = sigunToSgg(rows.filter((r) => r.PRODCD === prod));
      avg.unmatched.forEach((n) => unmatched.add(n));
      if (!Object.keys(avg.prices).length) { failed.push({ what: 'avg', sido, prod, kind: 'no-product' }); continue; }
      for (const [c, p] of Object.entries(avg.prices)) { (sgg[c] ??= {})[prod] = p; areas[c] = sido; }
    }
    for (const prod of Object.keys(PRODUCTS)) {
      try {
        for (const r of await get('lowTop10.do', key, { area: sido, prodcd: prod, cnt: 10 })) {
          const s = toStation(r, prod);
          if (!s) continue;
          const prev = stations.get(s.id);
          if (prev) Object.assign(prev.price, s.price);
          else stations.set(s.id, s);
        }
      } catch (e) { failed.push({ what: 'low', sido, prod, kind: e.kind }); }
    }
  }
  if (unmatched.size) console.log(`  기름값: 지역 이름 못 찾음 ${[...unmatched].join(', ')}`);
  if (failed.length) console.log(`  기름값: 실패 ${failed.length}건 — ${failed.map((x) => `${OPINET_SIDO[x.sido]} ${PRODUCTS[x.prod]} ${x.what === 'avg' ? '평균' : '최저가'}(${x.kind || '?'})`).join(', ')}`);
  const date = /^\d{8}$/.test(tradeDate || '') ? `${tradeDate.slice(0, 4)}-${tradeDate.slice(4, 6)}-${tradeDate.slice(6)}` : undefined;
  return { national, sgg, areas, stations: [...stations.values()], date, failed };
}

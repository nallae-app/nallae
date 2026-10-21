// 주유소 기름값 — 오피넷(한국석유공사) Open API  https://www.opinet.co.kr/user/custapi/openApiInfo.do
// 필요: OPINET_KEY. 소식이 아니라 '상태' 데이터라 web/data/fuel.json으로 따로 낸다.
//  - 전국 평균(avgAllPrice)
//  - 시·군·구 평균(avgSigunPrice, 시·도별) → 앱 시·군·구 코드
//  - 시·도별 최저가 10곳(lowTop10) → 좌표(KATEC)를 위경도로 바꿔 지도 점으로
// 호출 수: 1 + 17개 시·도 × (평균 2 + 최저가 2) = 69회. 3시간마다 → 하루 약 550회.
import { resolvePlace, regionIndex } from '../lib/regions.mjs';
import { katecToWgs84 } from '../lib/katec.mjs';
import { sggAt } from './festivals.mjs';

const API = 'https://www.opinet.co.kr/api';
export const PRODUCTS = { B027: '휘발유', D047: '경유' };
// 오피넷 시·도 코드 (2026-07 통합 뒤에도 광주 16 / 전남 07로 따로 온다)
export const OPINET_SIDO = { '01': '서울', '02': '경기', '03': '강원', '04': '충북', '05': '충남', '06': '전북', '07': '전남', '08': '경북', '09': '경남', '10': '부산', '11': '제주', '14': '대구', '15': '인천', '16': '광주', '17': '대전', '18': '울산', '19': '세종' };

const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? +Number(v).toFixed(2) : null);
const oil = (j) => j?.RESULT?.OIL || [];

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

async function get(path, key, params) {
  const qs = new URLSearchParams({ out: 'json', code: key, ...params });
  const res = await fetch(`${API}/${path}?${qs}`, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`오피넷 ${path} HTTP ${res.status}`);
  return res.json();
}

export async function fetchFuel({ key }) {
  if (!key) return { skipped: 'OPINET_KEY 없음' };
  const all = oil(await get('avgAllPrice.do', key, {}));
  const national = {};
  let tradeDate;
  for (const r of all) if (PRODUCTS[r.PRODCD]) {
    national[r.PRODCD] = { price: num(r.PRICE), diff: Number(r.DIFF) || 0 };
    tradeDate ??= r.TRADE_DT;
  }
  if (!national.B027) throw new Error('오피넷 전국 평균 없음');

  const sgg = {}, stations = new Map(), unmatched = new Set();
  for (const sido of Object.keys(OPINET_SIDO)) {
    for (const prod of Object.keys(PRODUCTS)) {
      const avg = sigunToSgg(oil(await get('avgSigunPrice.do', key, { sido, prodcd: prod })));
      avg.unmatched.forEach((n) => unmatched.add(n));
      for (const [c, p] of Object.entries(avg.prices)) (sgg[c] ??= {})[prod] = p;
      for (const r of oil(await get('lowTop10.do', key, { area: sido, prodcd: prod, cnt: 10 }))) {
        const s = toStation(r, prod);
        if (!s) continue;
        const prev = stations.get(s.id);
        if (prev) Object.assign(prev.price, s.price);
        else stations.set(s.id, s);
      }
    }
  }
  if (unmatched.size) console.log(`  기름값: 지역 이름 못 찾음 ${[...unmatched].join(', ')}`);
  const date = /^\d{8}$/.test(tradeDate || '') ? `${tradeDate.slice(0, 4)}-${tradeDate.slice(4, 6)}-${tradeDate.slice(6)}` : undefined;
  return { national, sgg, stations: [...stations.values()], date };
}

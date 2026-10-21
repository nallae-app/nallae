// 주차장 — 전국주차장정보표준데이터(공공데이터포털 15012896) + 서울 시영주차장 실시간(서울열린데이터광장 OA-21709)
// 필요: DATA_GO_KR_KEY, SEOUL_KEY(서울만, 없으면 실시간 생략)
// 표준데이터는 좌표가 있는 곳만 시·군·구별 파일(web/data/parking/<코드>.json)로, 하루 한 번.
// 서울 실시간은 좌표가 없어 같은 구 안에서 이름이 하나로 맞는 표준데이터 주차장에만 붙인다(위치를 추측하지 않는다).
import { sggAt } from './festivals.mjs';
import { resolvePlace } from '../lib/regions.mjs';

const STD = 'https://api.data.go.kr/openapi/tn_pubr_prkplce_info_api';
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const hhmm = (s) => (/^\d{2}:?\d{2}$/.test(clean(s)) ? clean(s).replace(/^(\d{2}):?(\d{2})$/, '$1:$2') : null);
const n = (v) => (clean(v) !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);

/** 이름 비교용: 공백·괄호 꼬리·'공영주차장' 등을 뗀다 */
export const normName = (s) => clean(s).replace(/\((?:시|구|공영|민영)\)/g, '').replace(/공영|민영|주차장|\s+/g, '');
/** 지번 비교용: '…종로구 훈정동 2-0' → '훈정동2' (동·리 + 번지, '-0' 꼬리 제거) */
export const normLot = (s) => {
  const m = clean(s).match(/([가-힣0-9]+(?:동|리|가))\s*(?:산\s*)?(\d+)(?:-(\d+))?/);
  return m ? `${m[1]}${m[2]}${m[3] && m[3] !== '0' ? '-' + m[3] : ''}` : '';
};

/** 표준데이터 행 → 시·군·구별 주차장. 좌표가 국내 육지 시·군·구 안에 있는 것만 */
export function toParkingBySgg(rows) {
  const by = {};
  let dropped = 0;
  const seen = new Set();
  for (const r of rows) {
    const lat = Number(r.latitude), lon = Number(r.longitude);
    const sgg = lat > 32 && lat < 39.5 && lon > 124 && lon < 132.5 ? sggAt(lon, lat) : null;
    if (!sgg) { dropped++; continue; }
    const id = clean(r.prkplceNo) || `${sgg}-${lat}-${lon}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const hours = (o, c) => (hhmm(o) && hhmm(c) ? `${hhmm(o)}-${hhmm(c)}` : undefined);
    (by[sgg] ??= []).push({
      id,
      name: clean(r.prkplceNm),
      kind: clean(r.prkplceSe) || undefined,          // 공영 / 민영
      type: clean(r.prkplceType) || undefined,        // 노외 / 노상 / 부설
      address: clean(r.rdnmadr || r.lnmadr) || undefined,
      lot: normLot(r.lnmadr) || undefined, // 서울 실시간과 맞추는 용도
      lat: +lat.toFixed(6), lon: +lon.toFixed(6),
      spaces: n(r.prkcmprt) || undefined,
      fee: clean(r.parkingchrgeInfo) || undefined,    // 무료 / 유료 / 혼합
      basic: n(r.basicTime) && n(r.basicCharge) !== undefined ? { min: n(r.basicTime), won: n(r.basicCharge) } : undefined,
      add: n(r.addUnitTime) && n(r.addUnitCharge) !== undefined ? { min: n(r.addUnitTime), won: n(r.addUnitCharge) } : undefined,
      dayMax: n(r.dayCmmtkt) || undefined,
      days: clean(r.operDay) || undefined,
      weekday: hours(r.weekdayOperOpenHhmm, r.weekdayOperColseHhmm),
      sat: hours(r.satOperOperOpenHhmm, r.satOperCloseHhmm),
      holiday: hours(r.holidayOperOpenHhmm, r.holidayCloseOpenHhmm),
      phone: clean(r.phoneNumber) || undefined,
      ref: clean(r.referenceDate) || undefined,
    });
  }
  for (const list of Object.values(by)) list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return { by, dropped };
}

/** 서울 실시간 행 → 실시간 항목. by(표준데이터)에서 같은 구·같은 이름이 하나뿐이면 matchId */
export function toSeoulLive(rows, by) {
  const out = [];
  for (const r of rows) {
    const gu = clean(r.ADDR).split(' ')[0];
    const { sgg } = resolvePlace(`서울 ${gu}`, { strict: true });
    if (sgg.length !== 1) continue;
    // 이름이 하나로 맞으면 그것, 아니면 지번 주소가 하나로 맞는 것
    const list = by?.[sgg[0]] || [];
    const key = normName(r.PKLT_NM), lot = normLot(r.ADDR);
    let cands = list.filter((p) => normName(p.name) === key);
    if (cands.length !== 1 && lot) cands = list.filter((p) => p.lot === lot);
    const live = String(r.PRK_STTS_YN) === '1'; // 20분 안 연계자료가 있을 때만 '현재 대수'로 쓴다
    out.push({
      code: clean(r.PKLT_CD),
      name: clean(r.PKLT_NM),
      address: `서울 ${clean(r.ADDR)}`,
      sgg: sgg[0],
      total: n(r.TPKCT),
      now: live ? n(r.NOW_PRK_VHCL_CNT) : undefined,
      at: live ? clean(r.NOW_PRK_VHCL_UPDT_TM) || undefined : undefined,
      fee: clean(r.PAY_YN_NM) || undefined,
      basic: n(r.BSC_PRK_HR) && n(r.BSC_PRK_CRG) !== undefined ? { min: n(r.BSC_PRK_HR), won: n(r.BSC_PRK_CRG) } : undefined,
      matchId: cands.length === 1 ? cands[0].id : undefined,
    });
  }
  return out;
}

export async function fetchParking({ key }) {
  if (!key) return { skipped: 'DATA_GO_KR_KEY 없음' };
  const rows = [];
  let total = Infinity;
  for (let page = 1; rows.length < total && page <= 60; page++) {
    const res = await fetch(`${STD}?serviceKey=${encodeURIComponent(key)}&pageNo=${page}&numOfRows=500&type=json`, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`주차장 HTTP ${res.status}`);
    const j = await res.json();
    const head = j.response?.header || j.header || {};
    if (head.resultCode && head.resultCode !== '00') throw new Error(`주차장 오류 ${head.resultCode} ${head.resultMsg || ''}`);
    const body = j.response?.body || j.body || {};
    total = Number(body.totalCount || 0);
    const list = body.items?.item || body.items || [];
    if (!list.length) break;
    rows.push(...list);
  }
  if (rows.length < total * 0.95) throw new Error(`주차장 일부만 받음 ${rows.length}/${total}`);
  const { by, dropped } = toParkingBySgg(rows);
  const count = Object.values(by).reduce((a, l) => a + l.length, 0);
  console.log(`  주차장 원자료 ${rows.length}건 → 좌표 있는 ${count}곳, ${Object.keys(by).length}개 시·군·구 (좌표 없음·범위 밖 ${dropped})`);
  return { by, count };
}

export async function fetchSeoulLive({ key, by }) {
  if (!key) return { skipped: 'SEOUL_KEY 없음' };
  const res = await fetch(`http://openapi.seoul.go.kr:8088/${encodeURIComponent(key)}/json/GetParkingInfo/1/1000/`, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`서울 주차 HTTP ${res.status}`);
  const j = (await res.json()).GetParkingInfo || {};
  if (j.RESULT?.CODE !== 'INFO-000') throw new Error(`서울 주차 오류 ${j.RESULT?.CODE} ${j.RESULT?.MESSAGE || ''}`);
  const items = toSeoulLive(j.row || [], by);
  console.log(`  서울 실시간 ${items.length}곳 (현재 대수 있음 ${items.filter((i) => i.now !== undefined).length}, 지도 점과 연결 ${items.filter((i) => i.matchId).length})`);
  return { items };
}

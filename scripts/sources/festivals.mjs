// 전국문화축제 표준데이터 — 공공데이터포털 15013104 (한국관광공사 등 지자체 등록)
// https://www.data.go.kr/data/15013104/standard.do  필요: DATA_GO_KR_KEY
// 소식(사건)이 아니라 '장소·일정' 데이터라 news.json에 섞지 않고 web/data/festivals.json으로 따로 낸다.
// 진행 중이거나 앞으로 FUTURE_DAYS 안에 시작하는 축제만 남긴다.
import fs from 'node:fs';
import * as topojson from 'topojson-client';

const ENDPOINT = 'https://api.data.go.kr/openapi/tn_pubr_public_cltur_fstvl_api';
const FUTURE_DAYS = 30;

// 좌표 → 시·군·구 판별용 경계 (앱과 같은 regions.json)
let MUNIS = null;
function munis() {
  if (MUNIS) return MUNIS;
  const topo = JSON.parse(fs.readFileSync(new URL('../../web/data/regions.json', import.meta.url), 'utf8'));
  MUNIS = topojson.feature(topo, topo.objects.sgg).features.map((f) => {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of polys) for (const [x, y] of p[0]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    return { code: f.properties.code, polys, box: [minX, minY, maxX, maxY] };
  });
  return MUNIS;
}

function inPolys(polys, x, y) {
  return polys.some((poly) => {
    let inside = false;
    for (const ring of poly) {
      for (let k = 0, j = ring.length - 1; k < ring.length; j = k++) {
        const [xi, yi] = ring[k], [xj, yj] = ring[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
    return inside;
  });
}

export function sggAt(lon, lat) {
  for (const m of munis()) {
    const [a, b, c, d] = m.box;
    if (lon < a || lon > c || lat < b || lat > d) continue;
    if (inPolys(m.polys, lon, lat)) return m.code;
  }
  return null;
}

const clean = (s) => String(s ?? '').replace(/\+/g, ', ').replace(/\s+/g, ' ').trim();
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

/** 원자료 행 → 앱 항목. today는 'YYYY-MM-DD'(KST) */
export function toFestivals(rows, today) {
  const until = new Date(new Date(`${today}T00:00:00+09:00`).getTime() + FUTURE_DAYS * 86400e3).toISOString().slice(0, 10);
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const start = r.fstvlStartDate, end = r.fstvlEndDate || r.fstvlStartDate;
    if (!isDate(start) || !isDate(end)) continue;
    if (end < today || start > until) continue; // 끝났거나 30일 넘게 남음
    const lat = Number(r.latitude), lon = Number(r.longitude);
    const hasPoint = Number.isFinite(lat) && Number.isFinite(lon) && lat > 32 && lat < 39.5 && lon > 124 && lon < 132.5;
    const sgg = hasPoint ? sggAt(lon, lat) : null;
    if (!sgg) continue; // 위치를 지도에 놓을 수 없으면 뺀다 (추측하지 않는다)
    const key = `${clean(r.fstvlNm)}|${start}|${sgg}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `fest-${sgg}-${start}-${hash(key)}`,
      name: clean(r.fstvlNm),
      start, end,
      place: clean(r.opar) || undefined,
      address: clean(r.rdnmadr || r.lnmadr) || undefined,
      lat: +lat.toFixed(5), lon: +lon.toFixed(5),
      sgg,
      host: clean(r.mnnstNm || r.auspcInsttNm) || undefined,
      content: clean(r.fstvlCo) || undefined,
      phone: clean(r.phoneNumber) || undefined,
      url: /^https?:\/\//.test(r.homepageUrl || '') ? r.homepageUrl.trim() : undefined,
      referenceDate: isDate(r.referenceDate) ? r.referenceDate : undefined,
    });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name, 'ko'));
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

export async function fetchFestivals({ key }) {
  if (!key) return { skipped: 'DATA_GO_KR_KEY 없음' };
  const rows = [];
  let total = Infinity;
  for (let page = 1; rows.length < total && page <= 10; page++) {
    const url = `${ENDPOINT}?serviceKey=${encodeURIComponent(key)}&pageNo=${page}&numOfRows=1000&type=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(40000) });
    if (!res.ok) throw new Error(`축제 HTTP ${res.status}`);
    const j = await res.json();
    const code = j.response?.header?.resultCode;
    if (code && code !== '00') throw new Error(`축제 오류 ${code} ${j.response?.header?.resultMsg || ''}`);
    const body = j.response?.body || {};
    total = Number(body.totalCount || 0);
    const list = body.items || [];
    rows.push(...(Array.isArray(list) ? list : list.item || []));
    if (!list.length) break;
  }
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const items = toFestivals(rows, today);
  console.log(`  축제 원자료 ${rows.length}건 → 진행 중·${FUTURE_DAYS}일 안 시작 ${items.length}건`);
  return { items };
}

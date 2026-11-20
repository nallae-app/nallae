// 오늘·내일 예보 — 기상청 단기예보 조회서비스 단기예보(getVilageFcst), 공공데이터포털 15084084
// 필요: DATA_GO_KR_KEY. 시·군·구 대표 지점 격자(temperature.mjs와 같은 격자)마다 한 번씩.
// 발표는 하루 8번이지만 최저·최고 기온이 다 들어오는 05시·17시 발표만 받는다(하루 2번, 약 500회).
import { sggGrids } from './temperature.mjs';

const ENDPOINT = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst';

/** 지금 받을 수 있는 05·17시 발표 (자료는 약 10분 뒤 올라온다 → 15분 여유) */
export function forecastBase(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 3600e3 - 15 * 60e3);
  const h = kst.getUTCHours();
  if (h < 5) kst.setUTCDate(kst.getUTCDate() - 1);
  const hour = h >= 5 && h < 17 ? '05' : '17';
  const d = kst.toISOString().slice(0, 10);
  return { date: d.replace(/-/g, ''), time: `${hour}00`, iso: `${d}T${hour}:00:00+09:00` };
}

/** 예보 항목들 → { 'YYYY-MM-DD': { tmn, tmx, pop, sky, pty } } (오늘·내일만) */
export function toDays(items, today) {
  const tomorrow = new Date(new Date(`${today}T12:00:00Z`).getTime() + 86400e3).toISOString().slice(0, 10);
  const days = {};
  for (const i of Array.isArray(items) ? items : []) {
    if (!i || typeof i.fcstDate !== 'string' || !/^\d{8}$/.test(i.fcstDate) || !['string','number'].includes(typeof i.fcstValue) || String(i.fcstValue).trim() === '') continue;
    const date = `${i.fcstDate.slice(0, 4)}-${i.fcstDate.slice(4, 6)}-${i.fcstDate.slice(6)}`;
    if (date !== today && date !== tomorrow) continue;
    const v = Number(i.fcstValue);
    if (!Number.isFinite(v)) continue;
    const valid = ['TMN','TMX'].includes(i.category) ? v >= -60 && v <= 60
      : i.category === 'POP' ? v >= 0 && v <= 100
      : i.category === 'SKY' ? i.fcstTime === '1200' && [1,3,4].includes(v)
      : i.category === 'PTY' && [0,1,2,3,4,5,6,7].includes(v);
    if (!valid) continue;
    const d = (days[date] ??= {});
    if (i.category === 'TMN') d.tmn = v;
    else if (i.category === 'TMX') d.tmx = v;
    else if (i.category === 'POP') d.pop = Math.max(d.pop ?? 0, v); // 하루 중 가장 높은 강수확률
    else if (i.category === 'PTY' && v > 0) d.pty = d.pty || v;     // 비·눈이 한 번이라도 예보되면
    else if (i.category === 'PTY') d.pty ??= 0;
    else if (i.category === 'SKY' && i.fcstTime === '1200') d.sky = v; // 낮 12시 하늘(1 맑음, 3 구름많음, 4 흐림)
  }
  return days;
}

export async function fetchForecast({ key, now = new Date(), base = forecastBase(now), grids = sggGrids(), fetchImpl = globalThis.fetch }) {
  if (!key) return { skipped: 'DATA_GO_KR_KEY 없음' };
  const today = new Date(now.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
  const cells = new Map();
  for (const g of grids) cells.set(`${g.nx},${g.ny}`, null);
  let failed = 0, lastErr = '';
  const keys = [...cells.keys()];
  for (let i = 0; i < keys.length; i += 8) {
    await Promise.all(keys.slice(i, i + 8).map(async (cell) => {
      const [nx, ny] = cell.split(',');
      const url = `${ENDPOINT}?serviceKey=${encodeURIComponent(key)}&pageNo=1&numOfRows=1000&dataType=JSON&base_date=${base.date}&base_time=${base.time}&nx=${nx}&ny=${ny}`;
      try {
        const res = await fetchImpl(url, { signal: AbortSignal.timeout(20000) });
        if (!res.ok) throw new Error(`예보 HTTP ${res.status}`);
        const j = JSON.parse(await res.text());
        const head = j.response?.header;
        if (head?.resultCode !== '00') throw new Error(`${head?.resultCode} ${head?.resultMsg}`);
        const days = toDays(j.response?.body?.items?.item, today);
        if (!Object.keys(days).length) throw new Error('유효한 오늘·내일 예보 없음');
        cells.set(cell, days);
      } catch (e) {
        failed++;
        lastErr = String(e.message || e).replaceAll(key, '***').slice(0, 120);
      }
    }));
    // 본문 지연/빈 응답도 포함해, 이미 최종 허용치를 넘었으면 다음 배치를 생략한다.
    if (failed > keys.length * 0.2) throw new Error(`예보 격자 ${failed}/${keys.length}곳 실패 (${lastErr})`);
  }
  if (failed > keys.length * 0.2) throw new Error(`예보 격자 ${failed}/${keys.length}곳 실패 (${lastErr})`);
  const sgg = {};
  for (const g of grids) { const d = cells.get(`${g.nx},${g.ny}`); if (d && Object.keys(d).length) sgg[g.code] = d; }
  if (!grids.length || Object.keys(sgg).length < grids.length * 0.8) throw new Error(`예보 유효 지역 ${Object.keys(sgg).length}/${grids.length}곳으로 부족`);
  console.log(`  예보: 격자 ${keys.length}곳 호출, 실패 ${failed}${failed ? ` (${lastErr})` : ''}`);
  return { sgg, base: base.iso };
}

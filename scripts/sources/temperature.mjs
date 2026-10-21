// 현재 기온 — 기상청 단기예보 조회서비스 초단기실황(getUltraSrtNcst), 공공데이터포털 15084084
// 필요: DATA_GO_KR_KEY. 5km 격자 분석값이라 시·군·구마다 '대표 지점'(지도 지명 표시 위치 lx, ly)의 격자 값을 쓴다.
// 매시 정각 자료가 약 40분 뒤 올라오므로, 45분 전이면 한 시간 전 정각을 받는다.
// 호출 수: 격자가 겹치는 곳을 빼면 시·군·구 약 250곳 → 1시간에 한 번이면 하루 약 6,000회(개발계정 한도 1만).
import fs from 'node:fs';

const ENDPOINT = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst';

/** 위경도 → 기상청 격자(nx, ny). 기상청 Lambert 정각원추 변환(동네예보 격자 문서 공식) */
export function toGrid(lat, lon) {
  const RE = 6371.00877 / 5.0, DEG = Math.PI / 180;
  const slat1 = 30 * DEG, slat2 = 60 * DEG, olon = 126 * DEG, olat = 38 * DEG;
  let sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(Math.tan(Math.PI / 4 + slat2 / 2) / Math.tan(Math.PI / 4 + slat1 / 2));
  const sf = (Math.tan(Math.PI / 4 + slat1 / 2) ** sn * Math.cos(slat1)) / sn;
  const ro = (RE * sf) / Math.tan(Math.PI / 4 + olat / 2) ** sn;
  const ra = (RE * sf) / Math.tan(Math.PI / 4 + lat * DEG / 2) ** sn;
  let theta = lon * DEG - olon;
  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;
  theta *= sn;
  return { nx: Math.floor(ra * Math.sin(theta) + 43 + 0.5), ny: Math.floor(ro - ra * Math.cos(theta) + 136 + 0.5) };
}

/** 지금 받을 수 있는 가장 최근 발표 시각 (KST) → { date: 'YYYYMMDD', time: 'HH00', iso } */
export function latestBase(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 3600e3);
  if (kst.getUTCMinutes() < 45) kst.setUTCHours(kst.getUTCHours() - 1);
  const s = kst.toISOString();
  return { date: s.slice(0, 10).replace(/-/g, ''), time: s.slice(11, 13) + '00', iso: `${s.slice(0, 13)}:00:00+09:00` };
}

/** 시·군·구 → 대표 지점 격자 */
export function sggGrids() {
  const topo = JSON.parse(fs.readFileSync(new URL('../../web/data/regions.json', import.meta.url), 'utf8'));
  return topo.objects.sgg.geometries.map((g) => ({ code: g.properties.code, ...toGrid(g.properties.ly, g.properties.lx) }));
}

/** 초단기실황 항목들 → { t, rn, reh, wsd, pty } */
export function toObs(items) {
  const v = Object.fromEntries(items.map((i) => [i.category, Number(i.obsrValue)]));
  if (!Number.isFinite(v.T1H) || v.T1H < -60 || v.T1H > 60) return null; // 결측(-999 등)
  const ok = (x) => (Number.isFinite(x) && x > -900 ? x : undefined);
  return { t: v.T1H, rn: ok(v.RN1), reh: ok(v.REH), wsd: ok(v.WSD), pty: ok(v.PTY) };
}

export async function fetchTemperature({ key, base = latestBase() }) {
  if (!key) return { skipped: 'DATA_GO_KR_KEY 없음' };
  const grids = sggGrids();
  const cells = new Map(); // 'nx,ny' → 관측값 (격자가 겹치는 시·군·구는 한 번만 부른다)
  for (const g of grids) cells.set(`${g.nx},${g.ny}`, null);
  let failed = 0, lastErr = '';
  const keys = [...cells.keys()];
  for (let i = 0; i < keys.length; i += 8) {
    await Promise.all(keys.slice(i, i + 8).map(async (cell) => {
      const [nx, ny] = cell.split(',');
      const url = `${ENDPOINT}?serviceKey=${encodeURIComponent(key)}&pageNo=1&numOfRows=10&dataType=JSON&base_date=${base.date}&base_time=${base.time}&nx=${nx}&ny=${ny}`;
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        const text = await res.text();
        const j = JSON.parse(text); // 키 오류 등은 XML로 와서 여기서 실패한다
        const head = j.response?.header;
        if (head?.resultCode !== '00') throw new Error(`${head?.resultCode} ${head?.resultMsg}`);
        cells.set(cell, toObs(j.response.body.items.item || []));
      } catch (e) {
        failed++;
        lastErr = String(e.message || e).replaceAll(key, '***').slice(0, 120);
      }
    }));
  }
  if (failed > keys.length * 0.2) throw new Error(`기온 격자 ${failed}/${keys.length}곳 실패 (${lastErr})`);
  const sgg = {};
  for (const g of grids) { const o = cells.get(`${g.nx},${g.ny}`); if (o) sgg[g.code] = o; }
  console.log(`  기온: 격자 ${keys.length}곳 호출, 실패 ${failed}${failed ? ` (${lastErr})` : ''}`);
  return { sgg, base: base.iso };
}

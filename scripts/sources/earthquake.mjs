// 지진정보 — 기상청 API허브 (eqk_now.php, 최근의 지진정보)
// 필요: KMA_APIHUB_KEY (API허브 '지진정보(최근의 지진정보) 조회' 활용신청)
// 진앙 좌표가 오므로 지도에는 '점'으로 찍는다. 육지면 그 시·군·구, 바다면 시·군·구 없이 점만.
// 국외 지진은 기상청이 '국내영향없음'이라고 한 것은 뺀다.
import { sggAt } from './festivals.mjs';

const ENDPOINT = 'https://apihub.kma.go.kr/api/typ01/url/eqk_now.php';
const TP = { 2: '국외지진정보', 3: '국내지진통보', 5: '지진정보(재통보)', 10: '지진현장경보', 11: '지진조기경보', 12: '국외지진조기경보', 14: '지진속보' };
const FOREIGN = new Set(['2', '12']);

const tmToIso = (tm) => {
  const m = String(tm || '').match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?/);
  return m ? new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || '00'}+09:00`).toISOString() : null;
};

/** 텍스트 응답 → 행. '  3 202610210750 1238 20261021074514.000 2.6 35.56 125.34 위치,진도,참고,수정,=' */
export function parseQuakes(text) {
  const rows = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(\d+)\s+(\d{12})\s+(\d+)\s+(\d{14})(?:\.\d+)?\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+(.*)$/);
    if (!m) continue;
    const [loc = '', int = '', rem = '', cor = ''] = m[8].replace(/,?\s*=\s*$/, '').split(',').map((s) => s.trim());
    rows.push({ TP: m[1], TM_FC: m[2], SEQ: m[3], TM_EQK: m[4], MT: Number(m[5]), LAT: Number(m[6]), LON: Number(m[7]), LOC: loc, INT: int, REM: rem, COR: cor });
  }
  return rows;
}

/** 조기경보·현장경보만 '긴급'. 규모로 올리지 않는다(출처 구분만 옮긴다). */
function quakeUrgency(tp) {
  const name = TP[tp] || `구분 ${tp}`;
  return { urgency: tp === '10' || tp === '11' ? 'urgent' : 'normal', urgencyBasis: `지진 발표 구분: ${name}` };
}

/** 같은 지진(진앙시)은 가장 나중 발표 하나만 */
export function toItems(rows) {
  const latest = new Map();
  for (const r of rows) {
    if (!Number.isFinite(r.LAT) || !Number.isFinite(r.LON) || !r.TM_EQK) continue;
    if (FOREIGN.has(r.TP) && /영향\s*없음/.test(r.REM)) continue;
    const prev = latest.get(r.TM_EQK);
    if (!prev || r.TM_FC > prev.TM_FC) latest.set(r.TM_EQK, r);
  }
  return [...latest.values()].map((r) => {
    const domestic = !FOREIGN.has(r.TP);
    const sgg = domestic ? sggAt(r.LON, r.LAT) : null;
    return {
      id: `eqk-${r.TM_EQK}`,
      src: 'eqk',
      cat: '재난',
      kind: TP[r.TP],
      ...quakeUrgency(r.TP),
      title: `규모 ${r.MT.toFixed(1)} 지진 — ${r.LOC}`,
      body: [r.INT, r.REM, r.COR].filter(Boolean).join(' · ') || undefined,
      time: tmToIso(r.TM_EQK),
      lat: r.LAT, lon: r.LON, mag: r.MT,
      sgg: sgg ? [sgg] : [], sido: [],
      source: `기상청 ${TP[r.TP] || '지진정보'}`,
      license: '공공누리 1유형',
      url: domestic ? 'https://www.weather.go.kr/w/eqk-vol/search/korea.do' : 'https://www.weather.go.kr/w/eqk-vol/search/worldwide.do',
    };
  });
}

export async function fetchItems({ key }) {
  if (!key) return { skipped: 'KMA_APIHUB_KEY 없음' };
  const tm = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace(/[-T:]/g, '');
  const url = new URL(ENDPOINT);
  url.search = new URLSearchParams({ tm, disp: '0', help: '0', authKey: key });
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`지진정보 HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  let text = buf.toString('utf8');
  if (text.includes('�')) text = new TextDecoder('euc-kr').decode(buf);
  return { items: toItems(parseQuakes(text)) };
}

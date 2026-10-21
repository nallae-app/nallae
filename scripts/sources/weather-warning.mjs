// 기상특보 현황 — 기상청 API허브 (wrn_now_data.php)
// https://apihub.kma.go.kr/apiList.do?seqApi=10&seqApiSub=288
// 필요: KMA_APIHUB_KEY (apihub.kma.go.kr 회원가입 + API 활용신청)
// 현재 발효 중인 특보만 돌려준다. 해제된 특보는 다음 수집 때 목록에서 빠진다.
import fs from 'node:fs';
import { warningUrgency } from '../lib/urgency.mjs';

const ENDPOINT = 'https://apihub.kma.go.kr/api/typ01/url/wrn_now_data.php';
const ZONES = JSON.parse(fs.readFileSync(new URL('../data/kma-zones.json', import.meta.url), 'utf8'));
const INDEX = JSON.parse(fs.readFileSync(new URL('../data/regions-index.json', import.meta.url), 'utf8'));

const WRN = { W: '강풍', R: '호우', C: '한파', D: '건조', O: '폭풍해일', N: '지진해일', V: '풍랑', T: '태풍', S: '대설', Y: '황사', H: '폭염', F: '안개' };
const LVL = { 1: '예비특보', 2: '주의보', 3: '경보', 예비: '예비특보', 주의: '주의보', 경보: '경보' };
const COLUMNS = ['REG_UP', 'REG_UP_KO', 'REG_ID', 'REG_KO', 'TM_FC', 'TM_EF', 'WRN', 'LVL', 'CMD', 'ED_TM'];

/** API허브 typ01 텍스트 응답 → 행 객체. '#' 줄에 열 이름이 있으면 그걸 쓴다. */
export function parseText(text) {
  let cols = COLUMNS;
  const rows = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      const names = line.replace(/^#\s*/, '').split(/[,\s]+/).filter(Boolean);
      if (names.includes('REG_ID') && names.includes('WRN')) cols = names;
      continue;
    }
    const cells = line.replace(/,?\s*=\s*$/, '').split(',').map((c) => c.trim());
    if (cells.length < 5) continue;
    rows.push(Object.fromEntries(cols.map((c, i) => [c, cells[i]])));
  }
  return rows;
}

// 발표 시각 YYYYMMDDHHMM(한국 시간) → ISO. 형식이 다르거나 불가능한 날짜(13월·32일·25시 등)면 null.
// (예전에는 불가능한 날짜에서 toISOString()이 RangeError를 던져 수집 전체가 멈출 수 있었다)
export const tmToIso = (tm) => {
  const m = String(tm || '').match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const t = Date.UTC(y, mo - 1, d, h - 9, mi);
  const k = new Date(t + 9 * 3600000); // 한국 시간으로 되돌려 원값과 비교
  if (!Number.isFinite(t) || k.getUTCFullYear() !== y || k.getUTCMonth() !== mo - 1 || k.getUTCDate() !== d || k.getUTCHours() !== h || k.getUTCMinutes() !== mi) return null;
  return new Date(t).toISOString();
};

const sggName = new Map(INDEX.sgg.map((r) => [r.code, `${r.short} ${r.name}`]));
const sidoName = new Map(INDEX.sidos.map((s) => [s.code, s.short]));

/** 같은 특보(종류·수준·발표시각)끼리 구역을 묶어 소식 하나로 만든다 */
export function toItems(rows, collectedAt = new Date()) {
  const groups = new Map();
  for (const r of rows) {
    if (!r.REG_ID?.startsWith('L')) continue; // 육상 특보만 (해상 구역은 지도에 없음)
    const kind = WRN[r.WRN] || r.WRN;
    const level = LVL[r.LVL] || r.LVL || '';
    if (!kind || /해제/.test(r.CMD || '')) continue;
    const key = `${r.WRN}|${r.LVL}|${r.TM_FC}`;
    if (!groups.has(key)) groups.set(key, { kind, level, tmFc: r.TM_FC, zones: [] });
    groups.get(key).zones.push(r);
  }
  const items = [];
  for (const g of groups.values()) {
    const sgg = new Set(), sido = new Set(), names = [];
    for (const z of g.zones) {
      const m = ZONES[z.REG_ID];
      if (!m) continue;
      m.sgg.forEach((c) => sgg.add(c));
      m.sido.forEach((c) => sido.add(c));
      names.push(z.REG_KO || m.name);
    }
    for (const c of [...sgg]) if (sido.has(c.slice(0, 2))) sgg.delete(c);
    if (!sgg.size && !sido.size) continue;
    const places = [...[...sido].map((c) => sidoName.get(c)), ...[...sgg].map((c) => sggName.get(c))].filter(Boolean);
    const where = places.length > 3 ? `${places.slice(0, 3).join(', ')} 외 ${places.length - 3}곳` : places.join(', ');
    const zoneIds = g.zones.map((z) => z.REG_ID).sort().join('');
    items.push({
      id: `wrn-${g.kind}${g.level}-${g.tmFc}-${hash(zoneIds)}`,
      src: 'wrn',
      level: g.level || undefined,
      ...warningUrgency(g.level),
      cat: '기상',
      title: `${g.kind}${g.level} ${g.level === '예비특보' ? '발표' : '발효'} — ${where}`,
      body: `특보 구역: ${[...new Set(names)].join(', ')}`,
      // time은 정렬·보관 기준이라 비우지 않는다. 발표 시각이 없으면 수집 확인 시각을 쓰되 timeBasis로 구분한다(화면에서 '발표'라 부르지 않게)
      time: tmToIso(g.tmFc) || collectedAt.toISOString(),
      timeBasis: tmToIso(g.tmFc) ? 'issued' : 'collected',
      sgg: [...sgg], sido: [...sido],
      source: '기상청 기상특보',
      license: '공공누리 1유형',
      url: 'https://www.weather.go.kr/w/special-report/overall.do',
    });
  }
  return items;
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

export async function fetchItems({ key }) {
  if (!key) return { skipped: 'KMA_APIHUB_KEY 없음' };
  const url = new URL(ENDPOINT);
  url.search = new URLSearchParams({ fe: 'f', tm: '', disp: '0', help: '1', authKey: key });
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`기상특보 HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // API허브 텍스트는 EUC-KR인 경우가 있다
  let text = buf.toString('utf8');
  if (text.includes('�')) text = new TextDecoder('euc-kr').decode(buf);
  return { items: toItems(parseText(text)), replaceSource: true };
}

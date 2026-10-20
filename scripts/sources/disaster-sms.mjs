// 긴급재난문자 — 행정안전부 재난안전데이터공유플랫폼 (DSSP-IF-00247)
// https://www.safetydata.go.kr/disaster-data/view?dataSn=228
// 필요: SAFETYDATA_KEY (safetydata.go.kr 회원가입 + 활용신청)
import { resolvePlaces } from '../lib/regions.mjs';

const ENDPOINT = 'https://www.safetydata.go.kr/V2/api/DSSP-IF-00247';

// 재해구분(DST_SE_NM) → 앱 분류
const CATEGORY = [
  [/지진|해일|화재|산불|붕괴|폭발|가스|정전|단수|감염병|방사능|화학|환경오염|민방공|이안류|입수/, '재난'],
  [/호우|태풍|대설|폭염|한파|강풍|풍랑|황사|미세먼지|가뭄|건조|안개|홍수|낙뢰|폭풍해일/, '기상'],
  [/실종|범죄|테러|수배/, '사건'],
  [/교통|도로|통제|철도|항공/, '교통'],
];
// 재해구분을 먼저 보고, '기타' 등으로 애매하면 본문으로 판단한다 (본문의 '[기상청]' 같은 발신기관 표시는 뺀다)
const categorize = (kind, text) => {
  const body = String(text || '').replace(/^\s*\[[^\]]{1,20}\]/, '');
  return CATEGORY.find(([re]) => re.test(kind || ''))?.[1] || CATEGORY.find(([re]) => re.test(body))?.[1] || '재난';
};

/** "2026/10/20 14:03:11" → ISO (KST) */
function kstToIso(s) {
  const m = String(s || '').match(/(\d{4})\D?(\d{2})\D?(\d{2})\D*(\d{2})?\D?(\d{2})?\D?(\d{2})?/);
  if (!m) return null;
  const [, y, mo, d, h = '00', mi = '00', se = '00'] = m;
  return new Date(`${y}-${mo}-${d}T${h}:${mi}:${se}+09:00`).toISOString();
}

/** 메시지 본문에서 앞쪽 [발신기관] 표시를 떼고 한 줄 제목으로 */
function titleOf(msg) {
  const t = String(msg || '').replace(/^\s*\[[^\]]{1,20}\]\s*/, '').replace(/\s+/g, ' ').trim();
  return t.length > 60 ? t.slice(0, 58) + '…' : t;
}

export function parse(rows) {
  return rows.map((r) => {
    const places = String(r.RCPTN_RGN_NM || '').split(/[,·]/).map((s) => s.trim()).filter(Boolean);
    const { sgg, sido } = resolvePlaces(places);
    const kind = r.DST_SE_NM || '';
    return {
      id: `sms-${r.SN}`,
      src: 'sms',
      cat: categorize(kind, r.MSG_CN),
      title: titleOf(r.MSG_CN),
      body: String(r.MSG_CN || '').trim(),
      level: r.EMRG_STEP_NM || undefined,
      kind: kind || undefined,
      time: kstToIso(r.CRT_DT),
      sgg, sido,
      source: '행정안전부 긴급재난문자',
    };
  }).filter((it) => it.time && it.title && (it.sgg.length || it.sido.length));
}

export async function fetchItems({ key, since }) {
  if (!key) return { skipped: 'SAFETYDATA_KEY 없음' };
  const ymd = (d) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
  const rows = [];
  for (let page = 1; page <= 5; page++) {
    const url = new URL(ENDPOINT);
    url.search = new URLSearchParams({ serviceKey: key, pageNo: page, numOfRows: 100, returnType: 'json', crtDt: ymd(since) });
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`재난문자 HTTP ${res.status}`);
    const data = await res.json();
    const code = data?.header?.resultCode;
    if (code && code !== '00') throw new Error(`재난문자 오류 ${code} ${data?.header?.resultMsg || ''}`);
    const body = data?.body || [];
    const list = Array.isArray(body) ? body : body.items || [];
    rows.push(...list);
    const total = Number(data?.totalCount ?? data?.body?.totalCount ?? 0);
    if (list.length < 100 || rows.length >= total) break;
  }
  return { items: parse(rows) };
}

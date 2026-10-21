// 식품접객업소 식품안심업소(위생등급) 지정 현황 — 식품안전나라 Open API C004 (식품의약품안전처)
// https://www.foodsafetykorea.go.kr/api/openApiInfo.do?svc_no=C004  필요: FOODSAFETY_KEY
// 맛 평가가 아니라 '위생등급 지정' 정보다. 앱에서도 맛집·추천이라고 부르지 않는다.
// 좌표가 없어 지도에 찍지 않고, 시·군·구별 목록 파일(web/data/food/<코드>.json)로만 낸다.
// 대표자명·사업자등록번호는 담지 않는다.
import { resolvePlace } from '../lib/regions.mjs';

const PAGE = 1000;

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const ymd = (s) => (/^\d{8}$/.test(String(s || '')) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : null);

/** 한 곳으로만 풀리는 지명이면 그 시·군·구 코드 */
function oneSgg(text) {
  const { sgg } = resolvePlace(text, { strict: true });
  return sgg.length === 1 ? sgg[0] : null;
}

/** 원자료 행 → { sgg: [업소] }. today는 'YYYY-MM-DD'(KST). 영업 중·지정 유효·취소 안 된 곳만 */
export function toFoodBySgg(rows, today) {
  const by = {};
  let dropped = 0;
  const seen = new Set();
  for (const r of rows) {
    const to = ymd(r.ASGN_TO);
    if (clean(r.CLSBIZ_DVS_CD_NM) !== '정상' || clean(r.ASGN_CANCEL_YMD) || clean(r.CLSBIZ_DT) || !to || to < today) continue;
    // 인허가 관할기관('경기도 화성시 만세구')을 먼저 보고, 시·도 단위면 주소로
    const sgg = oneSgg(r.INSTT_CD_NM) || oneSgg(r.ADDR);
    if (!sgg) { dropped++; continue; }
    const key = `${r.LCNS_NO}|${r.HG_ASGN_NO}`;
    if (seen.has(key)) continue;
    seen.add(key);
    (by[sgg] ??= []).push({
      name: clean(r.BSSH_NM),
      kind: clean(r.INDUTY_NM) || undefined,
      address: clean(r.ADDR) || undefined,
      level: clean(r.HG_ASGN_LV) || undefined,
      from: ymd(r.ASGN_FROM) || undefined,
      to,
      tel: clean(r.TELNO) || undefined,
    });
  }
  for (const list of Object.values(by)) list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return { by, dropped };
}

export async function fetchFood({ key }) {
  if (!key) return { skipped: 'FOODSAFETY_KEY 없음' };
  const rows = [];
  let total = Infinity;
  for (let start = 1; start <= total && start < 200000; start += PAGE) {
    const url = `http://openapi.foodsafetykorea.go.kr/api/${encodeURIComponent(key)}/C004/json/${start}/${start + PAGE - 1}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`식품안심업소 HTTP ${res.status}`);
    const j = (await res.json()).C004 || {};
    const code = j.RESULT?.CODE;
    if (code && code !== 'INFO-000') throw new Error(`식품안심업소 오류 ${code} ${j.RESULT?.MSG || ''}`);
    total = Number(j.total_count || 0);
    const page = j.row || [];
    rows.push(...page);
    if (!page.length) break;
  }
  if (rows.length < total * 0.95) throw new Error(`식품안심업소 일부만 받음 ${rows.length}/${total}`);
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const { by, dropped } = toFoodBySgg(rows, today);
  const count = Object.values(by).reduce((n, l) => n + l.length, 0);
  console.log(`  식품안심업소 원자료 ${rows.length}건 → 유효 ${count}건, ${Object.keys(by).length}개 시·군·구 (지역 못 찾음 ${dropped})`);
  return { by, count };
}

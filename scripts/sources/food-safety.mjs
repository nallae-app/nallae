// 식품접객업소 식품안심업소(위생등급) 지정 현황 — 식품안전나라 Open API C004 (식품의약품안전처)
// https://www.foodsafetykorea.go.kr/api/openApiInfo.do?svc_no=C004  필요: FOODSAFETY_KEY
// 맛 평가가 아니라 '위생등급 지정' 정보다. 앱에서도 맛집·추천이라고 부르지 않는다.
// 좌표가 없어 지도에 찍지 않고, 시·군·구별 목록 파일(web/data/food/<코드>.json)로만 낸다.
// 대표자명·사업자등록번호는 담지 않는다.
import { gunzipSync } from 'node:zlib';
import { resolvePlace } from '../lib/regions.mjs';

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

/** CSV 글 → 행 객체들 (따옴표 안 쉼표·줄바꿈·"" 처리, 머리줄 BOM 제거) */
export function parseCsv(text) {
  const recs = [];
  let rec = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { rec.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      rec.push(field); field = '';
      if (rec.length > 1 || rec[0]) recs.push(rec);
      rec = [];
    } else field += c;
  }
  if (field || rec.length) { rec.push(field); recs.push(rec); }
  const head = (recs.shift() || []).map((h) => h.replace(/^﻿/, '').trim());
  return recs.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

export async function fetchFood({ key }) {
  if (!key) return { skipped: 'FOODSAFETY_KEY 없음' };
  // 페이지로 받으면 한 번에 20~30초씩 걸려(4만여 건 → 20분 넘음) 전체 파일(gzip CSV, 약 3MB)을 받는다
  const res = await fetch(`http://openapi.foodsafetykorea.go.kr/api/${encodeURIComponent(key)}/C004/file`, { signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`식품안심업소 HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf[0] !== 0x1f || buf[1] !== 0x8b) throw new Error(`식품안심업소 파일 아님: ${buf.subarray(0, 120).toString('utf8').replace(/\s+/g, ' ').replace(key, '***')}`);
  const rows = parseCsv(gunzipSync(buf).toString('utf8'));
  if (rows.length < 10000 || !('BSSH_NM' in rows[0])) throw new Error(`식품안심업소 파일 형식 이상 (${rows.length}행)`);
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const { by, dropped } = toFoodBySgg(rows, today);
  const count = Object.values(by).reduce((n, l) => n + l.length, 0);
  console.log(`  식품안심업소 원자료 ${rows.length}건 → 유효 ${count}건, ${Object.keys(by).length}개 시·군·구 (지역 못 찾음 ${dropped})`);
  return { by, count };
}

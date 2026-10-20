// 여러 출처에서 소식을 모아 web/data/news.json을 만든다.
// GitHub Actions가 10분마다 돌린다 (.github/workflows/deploy.yml). 로컬: npm run collect
//
// 환경 변수
//   SAFETYDATA_KEY   긴급재난문자 (safetydata.go.kr)
//   KMA_APIHUB_KEY   기상특보 (apihub.kma.go.kr)
//   DATA_GO_KR_KEY   정책브리핑 (data.go.kr)
//   PREV_URL         직전에 배포된 news.json 주소 (없으면 로컬 파일을 이어 쓴다)
import fs from 'node:fs';
import * as sms from './sources/disaster-sms.mjs';
import * as wrn from './sources/weather-warning.mjs';
import * as brief from './sources/policy-news.mjs';

// 일시적인 네트워크 오류('fetch failed')는 3초 뒤 한 번 더 시도한다
const rawFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  try {
    return await rawFetch(url, opts);
  } catch (e) {
    if (e?.name === 'AbortError' || e?.name === 'TimeoutError') throw e;
    await new Promise((r) => setTimeout(r, 3000));
    const { signal, ...rest } = opts || {};
    return rawFetch(url, { ...rest, signal: AbortSignal.timeout(20000) });
  }
};

const OUT = 'web/data/news.json';
const KEEP_HOURS = 72;
const MAX_ITEMS = 600;
// 실종자 문자는 이름·나이 등 개인정보가 있어 하루만 보여준다
const MISSING_PERSON_HOURS = 24;
const isMissingPerson = (it) => it.src === 'sms' && it.cat === '사건' && /실종|찾습니다|배회/.test(it.body || it.title);

const SOURCES = [
  { name: 'sms', label: '긴급재난문자', mod: sms, key: process.env.SAFETYDATA_KEY },
  { name: 'wrn', label: '기상특보', mod: wrn, key: process.env.KMA_APIHUB_KEY },
  { name: 'brief', label: '정책브리핑', mod: brief, key: process.env.DATA_GO_KR_KEY },
];

async function loadPrevious() {
  try {
    if (process.env.PREV_URL) {
      const res = await fetch(process.env.PREV_URL, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (res.ok) return await res.json();
      console.log(`이전 소식 없음 (${res.status}) — 새로 시작`);
      return null;
    }
    return JSON.parse(fs.readFileSync(OUT, 'utf8'));
  } catch {
    return null;
  }
}

const prev = await loadPrevious();
const now = new Date();
const since = new Date(now.getTime() - KEEP_HOURS * 3600e3);
const byId = new Map((prev?.items || []).map((it) => [it.id, it]));
const status = {};

for (const s of SOURCES) {
  try {
    const r = await s.mod.fetchItems({ key: s.key, since });
    if (r.skipped) { status[s.name] = { ok: false, note: r.skipped }; console.log(`- ${s.label}: 건너뜀 (${r.skipped})`); continue; }
    if (r.replaceSource) for (const [id, it] of byId) if (it.src === s.name) byId.delete(id);
    let added = 0;
    for (const it of r.items) { if (!byId.has(it.id)) added++; byId.set(it.id, it); }
    status[s.name] = { ok: true, count: r.items.length, at: now.toISOString() };
    console.log(`- ${s.label}: ${r.items.length}건 (새 소식 ${added})`);
  } catch (e) {
    // 한 출처가 실패해도 나머지와 이전 소식은 그대로 둔다
    status[s.name] = { ok: false, note: String(e.message || e).slice(0, 200), at: now.toISOString() };
    console.log(`- ${s.label}: 실패 — ${e.message || e}`);
  }
}

const items = [...byId.values()]
  .filter((it) => new Date(it.time) >= since && new Date(it.time) <= new Date(now.getTime() + 3600e3))
  .filter((it) => !isMissingPerson(it) || now - new Date(it.time) < MISSING_PERSON_HOURS * 3600e3)
  .sort((a, b) => new Date(b.time) - new Date(a.time))
  .slice(0, MAX_ITEMS);

fs.mkdirSync('web/data', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ updated: now.toISOString(), sources: status, items }));
console.log(`→ ${OUT}: ${items.length}건`);

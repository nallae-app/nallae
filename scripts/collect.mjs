// 여러 출처에서 소식을 모아 web/data/news.json을 만든다.
// GitHub Actions가 10분마다 돌린다 (.github/workflows/deploy.yml). 로컬: npm run collect
//
// 환경 변수
//   SAFETYDATA_KEY   긴급재난문자 (safetydata.go.kr)
//   KMA_APIHUB_KEY   기상특보 (apihub.kma.go.kr)
//   DATA_GO_KR_KEY   정책브리핑·전국문화축제 (data.go.kr)
//   OPINET_KEY       주유소 기름값 (opinet.co.kr) → web/data/fuel.json, 3시간마다
//   FOODSAFETY_KEY   식품안심업소 (foodsafetykorea.go.kr) → web/data/food/, 하루 한 번
//   FORCE_REFRESH    1이면 간격과 상관없이 기름값·식품안심업소를 새로 받는다
//   PREV_URL         직전에 배포된 news.json 주소 (없으면 로컬 파일을 이어 쓴다)
import fs from 'node:fs';
import * as sms from './sources/disaster-sms.mjs';
import * as wrn from './sources/weather-warning.mjs';
import * as brief from './sources/policy-news.mjs';
import { fetchFestivals } from './sources/festivals.mjs';
import { fetchFuel, PRODUCTS } from './sources/fuel.mjs';
import { fetchFood } from './sources/food-safety.mjs';

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
    console.log(`- ${s.label}: 실패 — ${e.message || e}${e.cause ? ` (${e.cause.code || ""} ${e.cause.message || ""})` : ""}`);
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

// ---------- 축제(장소·일정): 소식과 섞지 않고 web/data/festivals.json으로 따로 ----------
const FEST_OUT = 'web/data/festivals.json';
try {
  const r = await fetchFestivals({ key: process.env.DATA_GO_KR_KEY });
  if (r.skipped) console.log(`- 축제: 건너뜀 (${r.skipped})`);
  else {
    fs.writeFileSync(FEST_OUT, JSON.stringify({ updated: now.toISOString(), source: '전국문화축제표준데이터 (공공데이터포털)', items: r.items }));
    console.log(`- 축제: ${r.items.length}건 → ${FEST_OUT}`);
  }
} catch (e) {
  // 실패하면 직전에 배포된 파일을 그대로 이어 쓴다 (축제 일정은 자주 바뀌지 않는다)
  console.log(`- 축제: 실패 — ${e.message || e}${e.cause ? ` (${e.cause.code || ''})` : ''}`);
  if (process.env.PREV_URL) {
    try {
      const prevFest = await (await fetch(process.env.PREV_URL.replace(/news\.json$/, 'festivals.json'), { signal: AbortSignal.timeout(15000) })).text();
      JSON.parse(prevFest);
      fs.writeFileSync(FEST_OUT, prevFest);
      console.log('  직전 festivals.json 유지');
    } catch { /* 없으면 이번 배포에는 축제 파일이 없다 */ }
  }
}

// ---------- 동네 탐험용 상태 데이터: 자주 바뀌지 않아 간격을 두고 받는다 ----------
// 간격 안이면 직전에 배포된 파일을 그대로 이어 쓴다. FORCE_REFRESH=1이면 무조건 새로 받는다.
const PREV_BASE = process.env.PREV_URL?.replace(/news\.json$/, '');
async function prevJson(path) {
  if (!PREV_BASE) { try { return JSON.parse(fs.readFileSync(`web/data/${path}`, 'utf8')); } catch { return null; } }
  try {
    const res = await fetch(PREV_BASE + path, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}
const fresh = (prevFile, hours) => !process.env.FORCE_REFRESH && prevFile?.updated && now - new Date(prevFile.updated) < hours * 3600e3 - 5 * 60e3;

// 주유소 기름값 (오피넷) — 3시간마다
const FUEL_OUT = 'web/data/fuel.json';
{
  const prevFuel = await prevJson('fuel.json');
  try {
    if (fresh(prevFuel, 3)) {
      fs.writeFileSync(FUEL_OUT, JSON.stringify(prevFuel));
      console.log(`- 기름값: 직전 파일 유지 (${prevFuel.updated})`);
    } else {
      const r = await fetchFuel({ key: process.env.OPINET_KEY });
      if (r.skipped) console.log(`- 기름값: 건너뜀 (${r.skipped})`);
      else {
        fs.writeFileSync(FUEL_OUT, JSON.stringify({ updated: now.toISOString(), date: r.date, source: '오피넷 (한국석유공사)', products: PRODUCTS, national: r.national, sgg: r.sgg, stations: r.stations }));
        console.log(`- 기름값: 시·군·구 ${Object.keys(r.sgg).length}곳, 최저가 주유소 ${r.stations.length}곳 → ${FUEL_OUT}`);
      }
    }
  } catch (e) {
    console.log(`- 기름값: 실패 — ${e.message || e}${e.cause ? ` (${e.cause.code || ''})` : ''}`);
    if (prevFuel) { fs.writeFileSync(FUEL_OUT, JSON.stringify(prevFuel)); console.log('  직전 fuel.json 유지'); }
  }
}

// 식품안심업소(위생등급) — 하루 한 번. 시·군·구별 파일 + 목차(index.json)
const FOOD_DIR = 'web/data/food';
{
  const prevIdx = await prevJson('food/index.json');
  const writeAll = (idx, by) => {
    fs.mkdirSync(FOOD_DIR, { recursive: true });
    for (const [code, items] of Object.entries(by)) fs.writeFileSync(`${FOOD_DIR}/${code}.json`, JSON.stringify({ updated: idx.updated, items }));
    fs.writeFileSync(`${FOOD_DIR}/index.json`, JSON.stringify(idx));
  };
  // 직전 배포 파일들을 다시 내려받아 그대로 쓴다
  const reuse = async () => {
    const by = {};
    const codes = Object.keys(prevIdx.counts || {});
    for (let i = 0; i < codes.length; i += 16) {
      await Promise.all(codes.slice(i, i + 16).map(async (c) => {
        const f = await prevJson(`food/${c}.json`);
        if (f?.items) by[c] = f.items;
      }));
    }
    if (Object.keys(by).length < codes.length * 0.95) throw new Error(`직전 파일 ${Object.keys(by).length}/${codes.length}개만 받음`);
    writeAll(prevIdx, by);
  };
  try {
    if (fresh(prevIdx, 24)) {
      await reuse();
      console.log(`- 식품안심업소: 직전 파일 유지 (${prevIdx.updated})`);
    } else {
      const r = await fetchFood({ key: process.env.FOODSAFETY_KEY });
      if (r.skipped) console.log(`- 식품안심업소: 건너뜀 (${r.skipped})`);
      else {
        const counts = Object.fromEntries(Object.entries(r.by).map(([c, l]) => [c, l.length]));
        writeAll({ updated: now.toISOString(), source: '식품안전나라 식품접객업소 식품안심업소(위생등급) 지정 현황 (식품의약품안전처)', total: r.count, counts }, r.by);
        console.log(`- 식품안심업소: ${r.count}건 → ${FOOD_DIR}/`);
      }
    }
  } catch (e) {
    console.log(`- 식품안심업소: 실패 — ${e.message || e}${e.cause ? ` (${e.cause.code || ''})` : ''}`);
    if (prevIdx) {
      try { await reuse(); console.log('  직전 food/ 유지'); } catch (e2) { console.log(`  직전 food/ 유지 실패 — ${e2.message}`); }
    }
  }
}

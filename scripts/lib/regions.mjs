// 지명 → 시·군·구 / 시·도 코드 찾기 (규칙 기반).
// 지명 사전은 scripts/build-regions.mjs가 만든 scripts/data/regions-index.json.
import fs from 'node:fs';

const INDEX = JSON.parse(fs.readFileSync(new URL('../data/regions-index.json', import.meta.url), 'utf8'));

// 시·도 이름 변형 → 시·도 코드. 통합·명칭 변경 전 이름도 받는다.
const SIDO_ALIASES = new Map();
const addAlias = (alias, code, filter) => SIDO_ALIASES.set(alias, { code, filter });
for (const s of INDEX.sidos) {
  addAlias(s.name, s.code);
  addAlias(s.short, s.code);
}
const byName = (name) => INDEX.sidos.find((s) => s.name === name)?.code;
const extra = {
  서울시: '서울특별시', 부산시: '부산광역시', 대구시: '대구광역시', 인천시: '인천광역시', 대전시: '대전광역시',
  울산시: '울산광역시', 세종시: '세종특별자치시', 강원도: '강원특별자치도', 전라북도: '전북특별자치도',
  충청북도: '충청북도', 충청남도: '충청남도', 경상북도: '경상북도', 경상남도: '경상남도', 제주도: '제주특별자치도',
};
for (const [alias, name] of Object.entries(extra)) if (byName(name)) addAlias(alias, byName(name));
// 2026-07 전남광주통합특별시 출범 전 이름: 광주 = 옛 광주 구, 전남 = 시·군
const gj = byName('전남광주통합특별시');
if (gj) {
  for (const a of ['광주광역시', '광주시', '광주']) addAlias(a, gj, (r) => r.short === '광주');
  for (const a of ['전라남도', '전남']) addAlias(a, gj, (r) => r.short === '전남');
}
const SIDO_KEYS = [...SIDO_ALIASES.keys()].sort((a, b) => b.length - a.length);

// 시·도 코드 → 그 안의 시·군·구 목록
const SGG_BY_SIDO = new Map();
for (const r of INDEX.sgg) {
  if (!SGG_BY_SIDO.has(r.sido)) SGG_BY_SIDO.set(r.sido, []);
  SGG_BY_SIDO.get(r.sido).push(r);
}

/** 시·도 범위 안에서 시·군·구 이름(또는 '수원시'처럼 구가 있는 시 이름)을 찾는다. */
function findInSido(sidoCode, word, filter) {
  const list = (SGG_BY_SIDO.get(sidoCode) || []).filter((r) => !filter || filter(r));
  const w = word.replace(/\s+/g, '');
  const exact = list.filter((r) => r.name.replace(/\s+/g, '') === w || r.gu === w);
  if (exact.length) return exact;
  // '수원시' → 수원시 장안구·권선구·팔달구·영통구
  const city = list.filter((r) => r.gu && r.city === w);
  if (city.length) return city;
  // '마포', '수원'처럼 시·군·구 접미사 없이 쓴 경우
  if (w.length >= 2) {
    const strip = (n) => n && n.replace(/[시군구]$/, '');
    const loose = list.filter((r) => strip(r.name.replace(/\s+/g, '')) === w || strip(r.gu) === w);
    if (loose.length === 1) return loose;
    const looseCity = list.filter((r) => r.gu && strip(r.city) === w);
    if (looseCity.length) return looseCity;
  }
  return [];
}

/**
 * "서울특별시 마포구", "경기도 수원시 장안구", "부산광역시 전체", "강원도" 같은 지역 표현 하나를 코드로 바꾼다.
 * @returns {{ sgg: string[], sido: string[] }}
 */
export function resolvePlace(text) {
  const t = String(text || '').trim();
  const out = { sgg: [], sido: [] };
  const key = SIDO_KEYS.find((k) => t === k || t.startsWith(k + ' ') || t.startsWith(k));
  if (!key) return out;
  const { code, filter } = SIDO_ALIASES.get(key);
  const rest = t.slice(key.length).trim();
  if (!rest || rest === '전체' || rest === '전역') {
    if (filter) out.sgg.push(...SGG_BY_SIDO.get(code).filter(filter).map((r) => r.code));
    else out.sido.push(code);
    return out;
  }
  // "수원시 장안구" → 붙여서 먼저 찾고, 안 되면 첫 단어만
  const words = rest.split(/\s+/);
  let found = findInSido(code, words.slice(0, 2).join(''), filter);
  if (!found.length) found = findInSido(code, words[0], filter);
  if (found.length) out.sgg.push(...found.map((r) => r.code));
  else if (filter) out.sgg.push(...SGG_BY_SIDO.get(code).filter(filter).map((r) => r.code));
  else out.sido.push(code); // 시·군·구를 못 찾으면 (예: 폐지된 구 이름) 시·도 단위로
  return out;
}

/** 여러 지역 표현을 합친다. 시·도 전체가 들어 있으면 그 시·도의 개별 시·군·구는 뺀다. */
export function resolvePlaces(list) {
  const sgg = new Set(), sido = new Set();
  for (const p of list) {
    const r = resolvePlace(p);
    r.sgg.forEach((c) => sgg.add(c));
    r.sido.forEach((c) => sido.add(c));
  }
  for (const c of [...sgg]) if (sido.has(sggSido(c))) sgg.delete(c);
  return { sgg: [...sgg], sido: [...sido] };
}

const SIDO_OF = new Map(INDEX.sgg.map((r) => [r.code, r.sido]));
export const sggSido = (code) => SIDO_OF.get(code);

/**
 * 자유 문장(기사 제목 등)에서 지명을 찾는다. 오탐을 줄이려고
 *  - "시·도 + 시·군·구" 함께 나온 경우, 또는
 *  - 전국에 하나뿐인 시·군 이름(예: '강릉시', '해운대구')이 나온 경우만 인정한다.
 */
const UNIQUE_NAMES = (() => {
  // 이름 → 코드들. '수원시'처럼 구가 있는 시는 그 구 전부를 가리킨다.
  const m = new Map();
  const add = (n, code) => { if (!m.has(n)) m.set(n, []); m.get(n).push(code); };
  for (const r of INDEX.sgg) {
    add(r.name.replace(/\s+/g, ''), r.code);
    if (r.gu) { add(r.name, r.code); add(r.city, r.code); }
  }
  for (const [n, codes] of m) {
    const multiSido = new Set(codes.map(sggSido)).size > 1;          // 중구, 고성군 …
    const sameNameTwice = codes.length > 1 && !INDEX.sgg.some((r) => r.gu && r.city === n); // 같은 시·도 안 동명
    if (multiSido || sameNameTwice) m.delete(n);
  }
  m.delete('광주시'); // 경기 광주시와 옛 광주광역시를 문장만으로 구분하기 어렵다
  return m;
})();
const UNIQUE_KEYS = [...UNIQUE_NAMES.keys()].filter((k) => /[시군구]$/.test(k) && k.length >= 3).sort((a, b) => b.length - a.length);

// '부천 화재', '과천 경마장'처럼 시·군·구 접미사 없이 쓴 이름. 일반 단어와 겹치는 지명은 뺀다.
const STEM_STOP = new Set(`
  광주 동해 남해 서해 진도 구리 사천 양산 화성 봉화 예산 부여 보은 영동 음성 인제 정선 장수 완주 강진 장흥 장성 영광
  함양 거창 고령 상주 영양 경주 진주 기장 달성 강화 고양 공주 세종 수영 사상 유성 광산 연수 동작 강북 강서 중구 동구 서구
  남구 북구 고성 광명 성주 대덕 남동 청양 하동 금산 영도 연제 중랑 금천 송파 미추홀 제물포 영종 검단 북항 통영 의성 청도
`.trim().split(/\s+/));
const SIDO_SHORTS = new Set(INDEX.sidos.map((s) => s.short));
const STEMS = (() => {
  const m = new Map();
  for (const k of UNIQUE_KEYS) {
    if (k.includes(' ')) continue;
    const stem = k.replace(/[시군구]$/, '');
    if (stem.length < 2 || STEM_STOP.has(stem) || SIDO_SHORTS.has(stem)) continue;
    if (m.has(stem)) { m.set(stem, null); continue; } // 같은 줄기가 둘이면 버린다
    m.set(stem, UNIQUE_NAMES.get(k));
  }
  for (const [s, v] of m) if (!v) m.delete(s);
  return m;
})();
const STEM_KEYS = [...STEMS.keys()].sort((a, b) => b.length - a.length);
// 지명 뒤에는 띄어쓰기·문장부호·조사만 허용 ('부천에서', '과천 경마장')
const STEM_TAIL = '(?=$|[^가-힣]|(?:에서|에|의|도|은|는|이|가|을|를|와|과|시민|지역|일대)(?:$|[^가-힣]))';

export function findPlacesInText(text) {
  const t = String(text || '');
  const sgg = new Set(), sido = new Set();
  // 1) "서울 마포구", "경기도 수원시" 등
  const re = new RegExp(`(${SIDO_KEYS.map(escapeRe).join('|')})\\s*([가-힣]{1,6}(?:시|군|구))(?:\\s*([가-힣]{1,4}구))?`, 'g');
  for (const m of t.matchAll(re)) {
    const r = resolvePlace(`${m[1]} ${m[2]}${m[3] ? ' ' + m[3] : ''}`);
    r.sgg.forEach((c) => sgg.add(c));
  }
  // 2) 전국에 하나뿐인 이름. 긴 이름부터 보고, 이미 찾은 부분은 지워서 '수원시 영통구'가 '수원시' 전체로 번지지 않게 한다.
  if (!sgg.size) {
    let rest = t;
    for (const k of UNIQUE_KEYS) {
      const re2 = new RegExp(`(^|[^가-힣])${escapeRe(k)}`);
      if (re2.test(rest)) {
        UNIQUE_NAMES.get(k).forEach((c) => sgg.add(c));
        rest = rest.replace(re2, '$1 ');
      }
    }
    // 3) 접미사 없는 이름
    for (const s of STEM_KEYS) {
      const re3 = new RegExp(`(^|[^가-힣])${escapeRe(s)}${STEM_TAIL}`);
      if (re3.test(rest)) {
        STEMS.get(s).forEach((c) => sgg.add(c));
        rest = rest.replace(re3, '$1 ');
      }
    }
  }
  return { sgg: [...sgg], sido: [...sido] };
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export const regionIndex = INDEX;

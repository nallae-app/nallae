// 기상청 특보구역(REG_ID) → 시·군·구/시·도 코드 표를 만든다.
// 입력: build-src/kma/zones.csv (기상청 API허브 '특보구역 코드.csv')
// 출력: scripts/data/kma-zones.json
// 서울 4권역, 부산·울산 동/서부 같은 광역시 안 권역은 경계 자료가 없어 시·도 전체로 연결한다.
import fs from 'node:fs';
import { resolvePlace, regionIndex } from './lib/regions.mjs';

const rows = fs.readFileSync('build-src/kma/zones.csv', 'utf8').replace(/^﻿/, '').split(/\r?\n/)
  .slice(1).map((l) => l.split(',')).filter((c) => c[0]?.startsWith('L'))
  .map(([id, up, name]) => ({ id, up, name: name.trim() }));
const byId = new Map(rows.map((r) => [r.id, r]));

const sgg = (sidoShort, name) => regionIndex.sgg.filter((r) => r.short === sidoShort && r.name === name).map((r) => r.code);
const MANUAL = {
  울릉도독도: { sgg: sgg('경북', '울릉군') },
  서해5도: { sgg: sgg('인천', '옹진군') },
  백령도대청도: { sgg: sgg('인천', '옹진군') },
  연평도우도: { sgg: sgg('인천', '옹진군') },
  흑산도홍도: { sgg: sgg('전남', '신안군') },
  거문도초도: { sgg: sgg('전남', '여수시') },
  추자도: { sgg: sgg('제주', '제주시') },
};

const PARENT_ALIAS = { 전북자치도: '전북특별자치도', 제주도: '제주특별자치도' };
const cleanName = (n) => n.replace(/\(.*?\)/g, '').replace(/(평지|산지|산간|도서|동북부|서북부|동남부|서남부|북부|남부|동부|서부|중부|중북부|중산간|위도면|낙월면|여서도|옥도면|어청도)$/, '').replace(/[.\s]/g, '');

const out = {};
const unmapped = [];
for (const z of rows) {
  if (z.id === 'L1000000') continue;
  const key = z.name.replace(/[.\s]/g, '');
  if (MANUAL[key]) { out[z.id] = { name: z.name, sgg: MANUAL[key].sgg, sido: [] }; continue; }

  // 시·도 급 구역 (부모가 '전국')
  if (z.up === 'L1000000') {
    const r = resolvePlace(PARENT_ALIAS[z.name] || z.name);
    out[z.id] = { name: z.name, ...r };
    if (!r.sgg.length && !r.sido.length) unmapped.push(z);
    continue;
  }

  // 하위 구역(파주동북부, 안동북부, 인천영종 …)은 부모 구역을 따른다
  const parent = byId.get(z.up);
  if (parent && parent.up !== 'L1000000') {
    if (!out[parent.id]) { rows.push(z); continue; } // 부모가 아직이면 뒤로 미룬다
    out[z.id] = { ...out[parent.id], name: z.name };
    continue;
  }

  // 부모를 따라 올라가 시·도 이름을 찾는다
  let p = byId.get(z.up), sidoName = null;
  while (p) { if (p.up === 'L1000000') { sidoName = PARENT_ALIAS[p.name] || p.name; break; } p = byId.get(p.up); }
  const name = cleanName(z.name);
  // 시·군·구를 못 찾으면 resolvePlace가 시·도 전체로 돌려준다 (서울동남권, 부산동부 등)
  const r = sidoName ? resolvePlace(`${sidoName} ${name}`) : { sgg: [], sido: [] };
  out[z.id] = { name: z.name, ...r };
  if (!r.sgg.length && !r.sido.length) unmapped.push(z);
}

fs.writeFileSync('scripts/data/kma-zones.json', JSON.stringify(out, null, 1));
console.log(`zones ${Object.keys(out).length}, unmapped ${unmapped.length}`);
for (const z of unmapped) console.log('  unmapped:', z.id, z.name);
const sidoOnly = Object.entries(out).filter(([, v]) => !v.sgg.length).map(([k, v]) => `${k} ${v.name}`);
console.log(`시·도 단위로 연결: ${sidoOnly.length}개\n  ${sidoOnly.join(', ')}`);

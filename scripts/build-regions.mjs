// 행정동 경계(admdongkor, 통계청 SGIS 원자료)를 시·군·구 / 시·도로 합쳐 앱용 TopoJSON을 만든다.
// 입력: build-src/admdong/HangJeongDong_ver*.geojson  (https://github.com/vuski/admdongkor)
// 출력: web/data/regions.json (objects: sgg, sido), scripts/data/regions-index.json (수집기용 지명 사전)
import fs from 'node:fs';
import path from 'node:path';
import mapshaper from 'mapshaper';
import * as topojson from 'topojson-client';
import polylabel from 'polylabel';

const SRC_DIR = 'build-src/admdong';
const src = fs.readdirSync(SRC_DIR).filter((f) => /^HangJeongDong_ver\d+\.geojson$/.test(f)).sort().pop();
if (!src) throw new Error(`${SRC_DIR}에 HangJeongDong_ver*.geojson이 없습니다`);
const version = src.match(/ver(\d+)/)[1];
console.log(`source: ${src}`);

const cmd = [
  `-i "${path.join(SRC_DIR, src)}" name=dong`,
  '-dissolve2 sgg copy-fields=sido,sidonm,sggnm name=sgg + target=dong',
  '-dissolve2 sido copy-fields=sidonm name=sido target=dong',
  '-target sgg,sido',
  // 작은 섬 정리. 독도(동도·서도 각 약 0.07km²)는 지워지지 않게 기준을 그보다 작게 둔다.
  '-filter-islands min-area=0.03km2 remove-empty target=sgg,sido',
  // keep-shapes는 '피처' 단위로만 지켜준다. 섬(독도 등)이 사라지지 않게 조각으로 나눠 단순화한 뒤 다시 합친다.
  '-explode target=sgg,sido',
  '-simplify 12% keep-shapes target=sgg,sido',
  '-dissolve2 sgg copy-fields=sido,sidonm,sggnm target=sgg',
  '-dissolve2 sido copy-fields=sidonm target=sido',
  '-each "code=sgg, name=sggnm.replace(/^(.+?시)(.+구)$/, \'$1 $2\'), sidoName=sidonm, delete sgg, delete sggnm, delete sidonm" target=sgg',
  '-each "code=sido, name=sidonm, delete sidonm" target=sido',
  '-o format=topojson quantization=100000 target=sgg,sido regions.json',
].join(' ');

const out = await mapshaper.applyCommands(cmd, {});
const topo = JSON.parse(out['regions.json']);

// 화면 표시용 시·도 줄임말. 전남광주통합특별시는 옛 광주 구와 전남 시·군을 구분해 보여준다.
const SIDO_SHORT = {
  서울특별시: '서울', 부산광역시: '부산', 대구광역시: '대구', 인천광역시: '인천', 대전광역시: '대전',
  울산광역시: '울산', 세종특별자치시: '세종', 경기도: '경기', 강원특별자치도: '강원', 충청북도: '충북',
  충청남도: '충남', 전북특별자치도: '전북', 경상북도: '경북', 경상남도: '경남', 제주특별자치도: '제주',
};
for (const g of topo.objects.sgg.geometries) {
  const p = g.properties;
  p.short = p.sidoName === '전남광주통합특별시' ? (/구$/.test(p.name) ? '광주' : '전남') : SIDO_SHORT[p.sidoName] || p.sidoName;
}
for (const g of topo.objects.sido.geometries) {
  const p = g.properties;
  p.short = p.name === '전남광주통합특별시' ? '전남광주' : SIDO_SHORT[p.name] || p.name;
}
if (!topo.objects.sgg.geometries.some((g) => g.properties.name === '울릉군')) throw new Error('울릉군 누락');

// 라벨 위치: 가장 큰 폴리곤 안쪽 깊은 점(pole of inaccessibility). lx=경도, ly=위도, la=라벨 우선순위용 면적(대략, 도² 단위).
// 화면에서는 선택 지역 → 시·도 → 시·군·구 순, 같은 순위에서는 la가 큰 것부터 놓고 겹치면 생략한다.
const ringArea = (r) => Math.abs(r.reduce((s, [x1, y1], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x1 * y2 - x2 * y1; }, 0) / 2);
for (const [objName, obj] of Object.entries(topo.objects)) {
  const fc = topojson.feature(topo, obj);
  fc.features.forEach((f, i) => {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const biggest = polys.reduce((a, p) => (ringArea(p[0]) > ringArea(a[0]) ? p : a));
    // 경도·위도 그대로 쓰면 동서로 늘어나므로 위도 보정(cos)한 좌표에서 찾는다
    const k = Math.cos((biggest[0][0][1] * Math.PI) / 180);
    const pt = polylabel(biggest.map((ring) => ring.map(([x, y]) => [x * k, y])), 0.0005);
    const p = obj.geometries[i].properties;
    p.lx = +(pt[0] / k).toFixed(4);
    p.ly = +pt[1].toFixed(4);
    p.la = +polys.reduce((s, poly) => s + ringArea(poly[0]) * k, 0).toFixed(5);
  });
  console.log(`${objName}: 라벨 위치 ${obj.geometries.length}개`);
}

topo.meta = { source: 'admdongkor (CC BY 4.0) / 통계청 SGIS (공공누리 1유형)', version };
fs.writeFileSync('web/data/regions.json', JSON.stringify(topo));

// 수집기용 지명 사전: 코드, 시·도, 표시 이름, 매칭용 이름들
const index = topo.objects.sgg.geometries.map(({ properties: p }) => {
  const [city, gu] = p.name.includes(' ') ? p.name.split(' ') : [p.name, null];
  return { code: p.code, sido: p.sido, sidoName: p.sidoName, short: p.short, name: p.name, city, gu };
});
const sidos = topo.objects.sido.geometries.map(({ properties: p }) => ({ code: p.code, name: p.name, short: p.short }));
fs.mkdirSync('scripts/data', { recursive: true });
fs.writeFileSync('scripts/data/regions-index.json', JSON.stringify({ version, sidos, sgg: index }, null, 1));

const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0);
console.log(`sgg ${index.length}, sido ${sidos.length} → web/data/regions.json ${kb('web/data/regions.json')}KB`);

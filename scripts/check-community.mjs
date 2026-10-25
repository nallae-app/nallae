import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// 필드 값이나 외부 URL 없이 공개 ID와 고정된 오류 이유만 표시한다.
const context = vm.createContext({ URL });
for (const file of ['local-scope.js', 'discovery.js', 'community.js']) {
  vm.runInContext(fs.readFileSync(new URL('../web/' + file, import.meta.url), 'utf8'), context);
}
const path = process.argv[2] || fileURLToPath(new URL('../web/data/community.json', import.meta.url));
const label = (item, index) => typeof item?.id === 'string' && /^[a-zA-Z0-9:_-]{1,80}$/.test(item.id) ? item.id : `item-${index + 1}`;
let catalog;
try { catalog = JSON.parse(fs.readFileSync(path, 'utf8')); }
catch { console.error('community: 파일을 읽을 수 없거나 JSON 형식이 아닙니다.'); process.exit(1); }
const result = context.NallaeCommunity.parseCatalog(catalog);
let failed = !result.valid || result.rejected !== 0;
if (!result.valid) console.error('community: schemaVersion 1과 items 배열이 필요합니다.');
if (result.valid) {
  let previousRejected = 0;
  catalog.items.forEach((item, index) => {
    const prefix = context.NallaeCommunity.parseCatalog({ schemaVersion: 1, items: catalog.items.slice(0, index + 1) });
    if (prefix.rejected > previousRejected) console.error(`${label(item, index)}: 승인·동의·필드·날짜·좌표·중복 ID 검증에 실패했습니다.`);
    previousRejected = prefix.rejected;
  });
  for (const item of result.items) {
    const index = catalog.items.findIndex(raw => raw.id === item.id);
    if (item.stops.some(stop => /^submitted-\d+$/.test(stop.id))) {
      failed = true;
      console.error(`${label(item, index)}: 임시 장소 ID를 안정적인 공개 장소 ID로 교체해야 합니다.`);
    }
    if (item.kind === 'course' && !context.NallaeDiscovery.snapshotPlan({ stops: item.stops, sourceType: 'community', communityId: item.id })) {
      failed = true;
      console.error(`${label(item, index)}: 코스는 2~4곳, 각 구간 직선거리 100~2,000m, 총 4,000m 이하여야 합니다.`);
    }
  }
}
if (failed) process.exitCode = 1;
else console.log(`community: 승인 항목 ${result.items.length}개 검증 통과`);

// 수동 의료 자료 갱신 전용. 다른 출처 API는 호출하지 않는다.
// refresh-medical workflow가 직전 배포 data/를 복원한 뒤 실행한다.
import fs from 'node:fs';
import { fetchPharmacies, fetchEmergency, updatePharmacy, updateEmergency } from './sources/medical.mjs';

if (!process.env.DATA_GO_KR_KEY) throw new Error('DATA_GO_KR_KEY 없음');
const now = new Date();
const prevJson = async (path) => {
  try { return JSON.parse(fs.readFileSync(`web/data/${path}`, 'utf8')); } catch { return null; }
};
// 갱신 함수가 기존 파일을 교체하기 전에 모든 이전 의료 자료를 메모리에 보관한다.
const previous = new Map();
for (const path of ['er.json', 'pharmacy/index.json']) previous.set(path, await prevJson(path));
for (const code of Object.keys(previous.get('pharmacy/index.json')?.counts || {})) {
  previous.set(`pharmacy/${code}.json`, await prevJson(`pharmacy/${code}.json`));
}
const readPrevious = async (path) => previous.get(path) ?? null;
const pharmacy = await updatePharmacy({ dir: 'web/data/pharmacy', prevJson: readPrevious, now, force: true,
  fetcher: (prevTotal) => fetchPharmacies({ key: process.env.DATA_GO_KR_KEY, prevTotal }) });
const er = await updateEmergency({ out: 'web/data/er.json', prevJson: readPrevious, now, force: true,
  fetcher: (prevTotal) => fetchEmergency({ key: process.env.DATA_GO_KR_KEY, prevTotal }) });
if (pharmacy !== 'updated' || er !== 'updated') {
  console.error('의료 전체 갱신 미완료 — 이번 수동 배포는 중단하고 공개 자료를 유지합니다.');
  process.exitCode = 1;
} else {
  console.log('의료 자료 두 서비스 갱신 완료(다른 출처 API 호출 없음)');
}

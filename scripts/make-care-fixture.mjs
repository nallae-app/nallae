// 약국·응급실 화면 시험용 가짜 자료 (로컬 전용). ?demo 로 열면 쓰인다.
// 만드는 파일은 .gitignore(web/data/demo-pharmacy/, web/data/demo-er.json)라 커밋·배포되지 않는다.
// 시설 이름은 모두 '(시험)'을 붙인 가상의 이름이고 좌표·전화번호도 실제가 아니다.
// 지역: 마포구(11440) 자료 있음 · 종로구(11110) 자료상 0곳 · 강남구(11680) 개수만 있고 파일 없음(지역 파일 실패 시험)
//   node scripts/make-care-fixture.mjs           정상 자료
//   node scripts/make-care-fixture.mjs --failed  수집 실패 기록만 있는 자료(분류에서 빠지는지 시험)
import fs from 'node:fs';
import { fullCounts } from './sources/medical.mjs';

const failed = process.argv.includes('--failed');
const at = new Date().toISOString();
const week = (s, c) => Array.from({ length: 5 }, () => [s, c]);
const pharmacies = [
  { id: 'T001', name: '(시험) 망원 하늘약국', address: '서울특별시 마포구 망원로 1 (망원동)', phone: '02-000-0001', lat: 37.5563, lon: 126.9050, hours: [...week('0900', '2100'), ['0900', '1800'], ['1000', '1700'], ['1000', '1500']] },
  { id: 'T002', name: '(시험) 아주 긴 이름을 가진 서울 마포구 합정동 사거리 건강한 온누리 365 큰길 약국', address: '서울특별시 마포구 양화로 000, 1층 101호 (합정동, 아주 긴 건물 이름 메디컬타워 별관 지하 1층 옆)', phone: '02-000-0002', lat: 37.5495, lon: 126.9135, hours: [...week('0830', '2400'), ['0900', '2400'], ['0900', '2400'], null] },
  { id: 'T003', name: '(시험) 좌표 없는 약국', address: '서울특별시 마포구 성미산로 0 (성산동)', phone: '', hours: [...week('0900', '1900'), null, null, null] },
  { id: 'T004', name: '(시험) 밤늦게 표기 약국', address: '서울특별시 마포구 독막로 0 (상수동)', phone: '02-000-0004', lat: 37.5480, lon: 126.9230, hours: [...week('2000', '0200'), null, null, null] },
];
const by = { 11440: pharmacies };
const counts = { ...fullCounts(by), 11680: 3 };
const base = { updated: at, checkedAt: at, complete: true, fixture: true, source: '시험 자료 (가상)', total: 4, sourceTotal: 5, unplaced: 1, invalid: 0, oddTimes: 2 };
fs.rmSync('web/data/demo-pharmacy', { recursive: true, force: true });
fs.mkdirSync('web/data/demo-pharmacy', { recursive: true });
if (failed) {
  fs.writeFileSync('web/data/demo-pharmacy/index.json', JSON.stringify({ complete: false, checkedAt: at, lastFailure: { at, error: '포털 오류 30 등록되지 않은 키(활용신청 필요)' } }));
  fs.writeFileSync('web/data/demo-er.json', JSON.stringify({ complete: false, checkedAt: at, lastFailure: { at, error: '일부만 받음 300/412' } }));
} else {
  fs.writeFileSync('web/data/demo-pharmacy/index.json', JSON.stringify({ ...base, counts }));
  fs.writeFileSync('web/data/demo-pharmacy/11440.json', JSON.stringify({ updated: at, items: pharmacies }));
  const er = [
    { id: 'E001', sgg: '11440', name: '(시험) 마포 한빛병원', cls: '지역응급의료기관', address: '서울특별시 마포구 월드컵북로 0 (성산동)', erPhone: '02-000-1191', phone: '02-000-1000', lat: 37.5640, lon: 126.9100 },
    { id: 'E002', sgg: '11440', name: '(시험) 아주 긴 이름의 의료법인 서울 마포 강변 종합 응급의료 센터 부속 병원', cls: '응급실운영신고기관', address: '서울특별시 마포구 마포대로 000 (아현동, 아주 긴 주소 예시 건물 본관과 별관 사이 응급실 출입구 방향)', erPhone: '', phone: '02-000-2000', lat: 37.5530, lon: 126.9560 },
    { id: 'E003', sgg: '11440', name: '(시험) 좌표 없는 병원', cls: '지역응급의료센터', address: '서울특별시 마포구 신촌로 0', erPhone: '02-000-3119' },
  ];
  fs.writeFileSync('web/data/demo-er.json', JSON.stringify({ updated: at, checkedAt: at, complete: true, fixture: true, source: '시험 자료 (가상)', total: er.length, sourceTotal: 5, excluded: { notOperating: 1, unknown: 1, unplaced: 0, invalid: 0 }, counts: { ...fullCounts({ 11440: er }) }, items: er }));
}
console.log(`시험 자료 ${failed ? '(실패 기록)' : ''} → web/data/demo-pharmacy/, web/data/demo-er.json (커밋·배포 안 됨)`);

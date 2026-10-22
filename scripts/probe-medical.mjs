// 약국·응급실 API 권한·응답 구조 확인용 (수동 실행, 의료 출처만). 키는 출력하지 않는다.
// 국립중앙의료원 전국 약국 정보(15000576) · 전국 응급의료기관 정보(15000563)만 부른다 — 호출 5번 이하.
// 출력: 결과 코드, totalCount, 첫 항목의 필드 이름(값은 시간·운영여부 같은 판정용 필드만)
const key = process.env.DATA_GO_KR_KEY;
if (!key) { console.log('DATA_GO_KR_KEY 없음'); process.exit(1); }
const mask = (t) => String(t).replaceAll(key, '***').replaceAll(encodeURIComponent(key), '***');
const B = 'https://apis.data.go.kr/B552657';
const calls = [
  ['약국 목록 getParmacyListInfoInqire', `${B}/ErmctInsttInfoInqireService/getParmacyListInfoInqire`, { pageNo: 1, numOfRows: 2 }],
  ['응급의료기관 목록 getEgytListInfoInqire', `${B}/ErmctInfoInqireService/getEgytListInfoInqire`, { pageNo: 1, numOfRows: 2 }],
];
const SHOW = /^(hpid|dutyEryn|dutyEmcls|dutyEmclsName|dutyTime\d[sc]|totalCount|resultCode|wgs84Lat|wgs84Lon)$/;
const tag = (x, n) => x.match(new RegExp(`<${n}>([\\s\\S]*?)</${n}>`))?.[1];
async function probe(name, url, params) {
  const t = Date.now();
  try {
    const res = await fetch(`${url}?serviceKey=${encodeURIComponent(key)}&${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(30000) });
    const text = await res.text();
    console.log(`== ${name}: HTTP ${res.status}, ${text.length} bytes, ${Date.now() - t}ms`);
    const gw = tag(text, 'returnReasonCode');
    if (gw) { console.log(`  포털 오류 코드 ${/^\d+$/.test(gw) ? gw : '?'} (20·30: 이 서비스 활용신청 필요, 22: 한도 초과)`); return null; }
    const code = tag(text, 'resultCode'), total = tag(text, 'totalCount');
    console.log(`  resultCode ${/^\d{1,3}$/.test(code || '') ? code : '?'}, totalCount ${/^\d+$/.test(total || '') ? total : '?'}`);
    const item = tag(text, 'item');
    if (!item) { console.log('  항목 없음'); return null; }
    const fields = [...item.matchAll(/<([A-Za-z0-9_]+)>([\s\S]*?)<\/\1>/g)];
    console.log(`  필드: ${fields.map((m) => m[1]).join(', ')}`);
    console.log(`  판정용 값: ${mask(fields.filter((m) => SHOW.test(m[1])).map((m) => `${m[1]}=${m[2]}`).join(' '))}`);
    return Object.fromEntries(fields.map((m) => [m[1], m[2]]));
  } catch (e) {
    console.log(`== ${name}: 실패 ${e.name} ${e.cause?.code || ''} ${Date.now() - t}ms`);
    return null;
  }
}
await probe(...calls[0]);
const er = await probe(...calls[1]);
if (er?.hpid && /^[A-Z0-9]+$/.test(er.hpid)) await probe('응급의료기관 기본정보 getEgytBassInfoInqire', `${B}/ErmctInfoInqireService/getEgytBassInfoInqire`, { HPID: er.hpid, pageNo: 1, numOfRows: 1 });

// 주차장 API 응답 확인용 (수동 실행). 키는 출력하지 않는다.
// 전국주차장정보표준데이터(data.go.kr 15012896), 서울 시영주차장 실시간(OA-21709)
const dg = process.env.DATA_GO_KR_KEY, seoul = process.env.SEOUL_KEY;
const keys = [dg, seoul].filter(Boolean);
const mask = (s) => keys.reduce((t, k) => t.replaceAll(k, '***').replaceAll(encodeURIComponent(k), '***'), s);
const urls = {};
if (dg) urls['전국 주차장 표준데이터'] = `https://api.data.go.kr/openapi/tn_pubr_prkplce_info_api?serviceKey=${encodeURIComponent(dg)}&pageNo=1&numOfRows=2&type=json`;
if (seoul) {
  urls['서울 시영주차장 실시간 GetParkingInfo'] = `http://openapi.seoul.go.kr:8088/${seoul}/json/GetParkingInfo/1/2/`;
  urls['서울 공영주차장 안내 GetParkInfo'] = `http://openapi.seoul.go.kr:8088/${seoul}/json/GetParkInfo/1/2/`;
}
console.log(`키: DATA_GO_KR ${dg ? '있음' : '없음'}, SEOUL ${seoul ? '있음' : '없음'}`);
for (const [name, url] of Object.entries(urls)) {
  const t = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const text = await res.text();
    console.log(`== ${name}: HTTP ${res.status}, ${text.length} bytes, ${Date.now() - t}ms`);
    console.log(mask(text.slice(0, 1800)).replace(/\s+/g, ' '));
  } catch (e) {
    console.log(`== ${name}: 실패 ${e.message} ${e.cause?.code || ''} ${Date.now() - t}ms`);
  }
}

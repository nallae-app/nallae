// 오피넷·식품안전나라 응답 구조 확인용 (수동 실행). 키는 출력하지 않는다.
const opinet = process.env.OPINET_KEY, food = process.env.FOODSAFETY_KEY;
const mask = (s) => [opinet, food].filter(Boolean).reduce((t, k) => t.replaceAll(k, '***'), s);
const urls = {};
if (opinet) {
  urls['opinet 전국 평균'] = `https://www.opinet.co.kr/api/avgAllPrice.do?out=json&code=${opinet}`;
  urls['opinet 서울 휘발유 최저가 10'] = `https://www.opinet.co.kr/api/lowTop10.do?out=json&code=${opinet}&prodcd=B027&area=01`;
  urls['opinet 시군구 평균(서울)'] = `https://www.opinet.co.kr/api/avgSigunPrice.do?out=json&code=${opinet}&sido=01&prodcd=B027`;
}
if (food) {
  // 식품안전나라 Open API: /api/{key}/{서비스ID}/{json}/{시작}/{끝}
  urls['식품안심업소 C004'] = `http://openapi.foodsafetykorea.go.kr/api/${food}/C004/json/1/3`;
}
for (const [name, url] of Object.entries(urls)) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const text = await res.text();
    console.log(`== ${name}: HTTP ${res.status}, ${text.length} bytes`);
    console.log('  ' + mask(text.slice(0, 700)).replace(/\s+/g, ' '));
  } catch (e) {
    console.log(`== ${name}: 실패 ${e.message} ${e.cause?.code || ''}`);
  }
}

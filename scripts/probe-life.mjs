// 오피넷·식품안전나라 응답 구조 확인용 (수동 실행). 키는 출력하지 않는다.
const opinet = process.env.OPINET_KEY, food = process.env.FOODSAFETY_KEY;
const mask = (s) => [opinet, food].filter(Boolean).reduce((t, k) => t.replaceAll(k, '***'), s);
const urls = {};
if (opinet) {
  urls['opinet 전국 평균'] = `https://www.opinet.co.kr/api/avgAllPrice.do?out=json&code=${opinet}`;
  // 공식 문서의 인증 매개변수 이름은 certkey (2026-10-21 확인). 기존 code와 응답을 비교한다
  urls['opinet 전국 평균(certkey)'] = `https://www.opinet.co.kr/api/avgAllPrice.do?out=json&certkey=${opinet}`;
  urls['opinet 서울 휘발유 최저가 10'] = `https://www.opinet.co.kr/api/lowTop10.do?out=json&code=${opinet}&prodcd=B027&area=01`;
  urls['opinet 시군구 평균(서울)'] = `https://www.opinet.co.kr/api/avgSigunPrice.do?out=json&code=${opinet}&sido=01&prodcd=B027`;
}
if (food) {
  // 식품안전나라 Open API: /api/{key}/{서비스ID}/{json}/{시작}/{끝}
  urls['식품안심업소 C004'] = `http://openapi.foodsafetykorea.go.kr/api/${food}/C004/json/1/3`;
}
if (food) {
  // 페이지 API는 1,000건에 20~30초(2026-10-21 측정) → 수집기는 전체 파일을 받는다
  const t = Date.now();
  try {
    const res = await fetch(`http://openapi.foodsafetykorea.go.kr/api/${food}/C004/file`, { signal: AbortSignal.timeout(120000) });
    const buf = Buffer.from(await res.arrayBuffer());
    console.log(`== C004 file: HTTP ${res.status}, ${res.headers.get('content-type')}, ${res.headers.get('content-disposition')}, ${buf.length} bytes, ${Date.now() - t}ms`);
    const raw = (await import('node:zlib')).gunzipSync(buf);
    for (const enc of ['utf-8', 'euc-kr']) {
      const lines = new TextDecoder(enc).decode(raw.subarray(0, 3000)).split(/\r?\n/);
      console.log(`  [${enc}] 머리줄: ${lines[0]}`);
      console.log(`  [${enc}] 첫 줄: ${lines[1]}`);
    }
    console.log(`  풀린 크기 ${raw.length} bytes`);
  } catch (err) {
    console.log(`== C004 file: 실패 ${err.message} ${Date.now() - t}ms`);
  }
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

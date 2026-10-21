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
if (food) {
  // 페이지 크기별 응답 시간 재기 (수집기가 느린 원인 확인)
  for (const [s, e] of [[1, 100], [1, 500], [1001, 2000], [40001, 41000]]) {
    const t = Date.now();
    try {
      const res = await fetch(`http://openapi.foodsafetykorea.go.kr/api/${food}/C004/json/${s}/${e}`, { signal: AbortSignal.timeout(120000) });
      const text = await res.text();
      console.log(`== C004 ${s}-${e}: HTTP ${res.status}, ${text.length} bytes, ${Date.now() - t}ms`);
    } catch (err) {
      console.log(`== C004 ${s}-${e}: 실패 ${err.message} ${err.cause?.code || ''} ${Date.now() - t}ms`);
    }
  }
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

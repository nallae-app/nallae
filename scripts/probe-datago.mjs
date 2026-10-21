// 공공데이터포털 API 응답 구조 확인용 (수동 실행). 키는 출력하지 않는다.
const key = process.env.DATA_GO_KR_KEY;
if (!key) throw new Error('DATA_GO_KR_KEY 없음');
const kst = new Date(Date.now() + 9 * 3600e3);
const ymd = kst.toISOString().slice(0, 10).replace(/-/g, '');
// 초단기실황은 매시 정각 자료가 약 40분 뒤 올라온다 → 한 시간 전 정각
const base = new Date(kst.getTime() - 3600e3);
const baseDate = base.toISOString().slice(0, 10).replace(/-/g, '');
const baseTime = base.toISOString().slice(11, 13) + '00';
const k = encodeURIComponent(key);
const urls = {
  festival: `https://api.data.go.kr/openapi/tn_pubr_public_cltur_fstvl_api?serviceKey=${k}&pageNo=1&numOfRows=3&type=json`,
  airkorea: `https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty?serviceKey=${k}&returnType=json&numOfRows=3&pageNo=1&sidoName=${encodeURIComponent('서울')}&ver=1.0`,
  forecast: `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst?serviceKey=${k}&pageNo=1&numOfRows=10&dataType=JSON&base_date=${baseDate}&base_time=${baseTime}&nx=60&ny=127`,
};
for (const [name, url] of Object.entries(urls)) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const text = await res.text();
    console.log(`== ${name}: HTTP ${res.status}, ${text.length} bytes`);
    let j;
    try { j = JSON.parse(text); } catch { console.log(text.slice(0, 300).replaceAll(key, '***')); continue; }
    const head = j.response?.header || j.header;
    const body = j.response?.body || j.body;
    console.log('  header:', JSON.stringify(head));
    console.log('  totalCount:', body?.totalCount);
    const items = body?.items?.item ?? body?.items;
    const first = Array.isArray(items) ? items[0] : items;
    console.log('  첫 항목:', JSON.stringify(first)?.slice(0, 600));
  } catch (e) {
    console.log(`== ${name}: 실패 ${e.message} ${e.cause?.code || ''}`);
  }
}
console.log(`(기준 ${ymd}, 초단기실황 base ${baseDate} ${baseTime})`);

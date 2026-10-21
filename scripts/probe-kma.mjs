// 2026-10-21 추가 신청한 API 응답 확인용 (수동 실행). 키는 출력하지 않는다.
// 기상청 API허브: 지진정보(최근·목록), 태풍정보 / 공공데이터포털: 에어코리아 측정소정보·대기오염 전국, 생활기상지수
const kma = process.env.KMA_APIHUB_KEY, dg = process.env.DATA_GO_KR_KEY;
const keys = [kma, dg].filter(Boolean);
const mask = (s) => keys.reduce((t, k) => t.replaceAll(k, '***').replaceAll(encodeURIComponent(k), '***'), s);
const kst = new Date(Date.now() + 9 * 3600e3);
const ymdhm = (d) => d.toISOString().slice(0, 16).replace(/[-T:]/g, '');
const now = ymdhm(kst), weekAgo = ymdhm(new Date(kst.getTime() - 30 * 86400e3));
const H = 'https://apihub.kma.go.kr/api/typ01/url';
const urls = {};
if (kma) {
  const k = encodeURIComponent(kma);
  urls['지진 최근 eqk_now'] = `${H}/eqk_now.php?tm=${now}&disp=0&help=1&authKey=${k}`;
  urls['지진 목록 eqk_list (30일)'] = `${H}/eqk_list.php?tm1=${weekAgo}&tm2=${now}&disp=0&help=1&authKey=${k}`;
  urls['태풍 목록 typ_lst'] = `${H}/typ_lst.php?YY=${kst.getUTCFullYear()}&disp=0&help=1&authKey=${k}`;
  urls['태풍 현재 typ_now'] = `${H}/typ_now.php?disp=0&help=1&authKey=${k}`;
  urls['태풍 자료 typ_data'] = `${H}/typ_data.php?YY=${kst.getUTCFullYear()}&disp=0&help=1&authKey=${k}`;
}
if (dg) {
  const k = encodeURIComponent(dg);
  urls['에어코리아 측정소정보'] = `https://apis.data.go.kr/B552584/MsrstnInfoInqireSvc/getMsrstnList?serviceKey=${k}&returnType=json&numOfRows=2&pageNo=1`;
  urls['에어코리아 대기오염 전국'] = `https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty?serviceKey=${k}&returnType=json&numOfRows=2&pageNo=1&sidoName=${encodeURIComponent('전국')}&ver=1.0`;
  const hour = kst.toISOString().slice(0, 13).replace(/[-T]/g, '');
  urls['생활기상 자외선 V4'] = `https://apis.data.go.kr/1360000/LivingWthrIdxServiceV4/getUVIdxV4?serviceKey=${k}&pageNo=1&numOfRows=2&dataType=JSON&areaNo=1100000000&time=${hour}`;
  urls['생활기상 대기정체 V4'] = `https://apis.data.go.kr/1360000/LivingWthrIdxServiceV4/getAirDiffusionIdxV4?serviceKey=${k}&pageNo=1&numOfRows=2&dataType=JSON&areaNo=1100000000&time=${hour}`;
}
for (const [name, url] of Object.entries(urls)) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const buf = await res.arrayBuffer();
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('�')) text = new TextDecoder('euc-kr').decode(buf);
    const lines = text.split(/\r?\n/);
    console.log(`== ${name}: HTTP ${res.status}, ${text.length} bytes, ${lines.length}줄`);
    console.log(mask(lines.slice(0, 30).join('\n')).slice(0, 2500));
  } catch (e) {
    console.log(`== ${name}: 실패 ${e.message} ${e.cause?.code || ''}`);
  }
}

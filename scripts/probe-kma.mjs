// 기상청 API허브 관측 자료 확인용 (수동 실행). 키는 출력하지 않는다.
// 기온 레이어 후보: AWS 매분자료(전국 한 번에), 지상(ASOS) 시간자료, 관측소 정보(좌표)
const key = process.env.KMA_APIHUB_KEY;
if (!key) throw new Error('KMA_APIHUB_KEY 없음');
const kst = new Date(Date.now() + 9 * 3600e3 - 5 * 60e3);
const tmMin = kst.toISOString().slice(0, 16).replace(/[-T:]/g, '');
const tmHour = kst.toISOString().slice(0, 13).replace(/[-T:]/g, '') + '00';
const k = encodeURIComponent(key);
const H = 'https://apihub.kma.go.kr/api/typ01';
const urls = {
  'AWS 매분 (전국)': `${H}/cgi-bin/url/nph-aws2_min?tm2=${tmMin}&stn=0&disp=0&help=1&authKey=${k}`,
  '지상 ASOS 시간 (전국)': `${H}/url/kma_sfctm2.php?tm=${tmHour}&stn=0&help=1&authKey=${k}`,
  '관측소 정보 AWS': `${H}/url/stn_inf.php?inf=AWS&stn=&tm=${tmMin}&help=1&authKey=${k}`,
};
for (const [name, url] of Object.entries(urls)) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const text = new TextDecoder(res.headers.get('content-type')?.includes('euc-kr') ? 'euc-kr' : 'utf-8').decode(await res.arrayBuffer());
    const lines = text.split(/\r?\n/);
    console.log(`== ${name}: HTTP ${res.status}, ${text.length} bytes, ${lines.length}줄, ${res.headers.get('content-type')}`);
    console.log(lines.slice(0, 40).join('\n').replaceAll(key, '***'));
  } catch (e) {
    console.log(`== ${name}: 실패 ${e.message} ${e.cause?.code || ''}`);
  }
}

// ITS 응답 구조 확인용 (수동 실행). 키는 출력하지 않는다.
const key = process.env.ITS_KEY;
if (!key) throw new Error('ITS_KEY 없음');
const ymd = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
const urls = {
  eventInfo: `https://openapi.its.go.kr:9443/eventInfo?apiKey=${key}&type=all&eventType=all&getType=json`,
  disasterInfo: `https://openapi.its.go.kr:9443/disasterInfo?apiKey=${key}&category=D&eventType=all&startDate=${ymd}&endDate=${ymd}&getType=json`,
};
for (const [name, url] of Object.entries(urls)) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const text = await res.text();
    console.log(`== ${name}: HTTP ${res.status}, ${text.length} bytes, content-type ${res.headers.get('content-type')}`);
    let j;
    try { j = JSON.parse(text); } catch { console.log(text.slice(0, 500).replaceAll(key, '***')); continue; }
    const walk = (o, p = '', d = 0) => {
      if (d > 3 || o === null || typeof o !== 'object') return;
      if (Array.isArray(o)) { console.log(`${p} [array ${o.length}]`); if (o[0]) walk(o[0], p + '[0]', d + 1); return; }
      for (const [k, v] of Object.entries(o)) {
        if (v && typeof v === 'object') walk(v, `${p}.${k}`, d + 1);
        else console.log(`${p}.${k} = ${JSON.stringify(v)?.slice(0, 80)}`);
      }
    };
    walk(j);
  } catch (e) {
    console.log(`== ${name}: 실패 ${e.message} ${e.cause?.code || ''}`);
  }
}

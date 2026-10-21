// 서울 리전에서 ITS(국가교통정보센터) Open API를 대신 불러 주는 함수.
// ITS 서버는 해외(GitHub Actions) IP에서 연결되지 않아, 국내 리전 함수를 거친다.
//
// 요청: GET /api/its?service=event|disaster  (헤더 x-nallae-token: <PROXY_TOKEN>)
// 환경 변수(Vercel 프로젝트 설정): ITS_KEY, PROXY_TOKEN
// 키는 이 함수 안에서만 붙이고, 응답·로그에 남기지 않는다.

const ENDPOINTS = {
  event: (key) => `https://openapi.its.go.kr:9443/eventInfo?apiKey=${key}&type=all&eventType=all&getType=json`,
  disaster: (key) => {
    const ymd = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
    return `https://openapi.its.go.kr:9443/disasterInfo?apiKey=${key}&category=D&eventType=all&startDate=${ymd}&endDate=${ymd}&getType=json`;
  },
};

export default async function handler(req, res) {
  const token = process.env.PROXY_TOKEN;
  if (!token || req.headers['x-nallae-token'] !== token) return res.status(401).json({ error: 'unauthorized' });
  const make = ENDPOINTS[req.query.service];
  if (!make) return res.status(400).json({ error: 'service must be event or disaster' });
  if (!process.env.ITS_KEY) return res.status(500).json({ error: 'ITS_KEY not set' });

  try {
    const upstream = await fetch(make(process.env.ITS_KEY), { signal: AbortSignal.timeout(20000) });
    const body = await upstream.text();
    res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-proxy-region', process.env.VERCEL_REGION || 'unknown');
    return res.status(upstream.status).send(body);
  } catch (e) {
    return res.status(502).json({ error: 'upstream failed', code: e.cause?.code || e.name, region: process.env.VERCEL_REGION || 'unknown' });
  }
}

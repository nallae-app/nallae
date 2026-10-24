// 오피넷 좌표(KATEC) → WGS84 위경도
// KATEC: 베셀 타원체, 횡메르카토르(원점 북위 38°, 동경 128°, 축척 0.9999, 가산 x 400000 / y 600000)
// 베셀 → WGS84는 3변수 이동(towgs84 -146.43, 507.89, 681.46, 우리나라 일반값)으로 근사한다(수 m 오차).

const BESSEL = { a: 6377397.155, f: 1 / 299.1528128 };
const WGS84 = { a: 6378137, f: 1 / 298.257223563 };
const SHIFT = [-146.43, 507.89, 681.46];
const LAT0 = (38 * Math.PI) / 180, LON0 = (128 * Math.PI) / 180, K0 = 0.9999, X0 = 400000, Y0 = 600000;

function meridianArc(e2, a, phi) {
  const e4 = e2 * e2, e6 = e4 * e2;
  return a * ((1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi
    - ((3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi)
    + ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi)
    - ((35 * e6) / 3072) * Math.sin(6 * phi));
}

/** 횡메르카토르 역변환 (베셀) → [위도, 경도] 라디안 */
function tmInverse(x, y) {
  const { a, f } = BESSEL;
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const M = meridianArc(e2, a, LAT0) + (y - Y0) / K0;
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 = mu + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu)
    + ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu)
    + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) + ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const C1 = ep2 * Math.cos(phi1) ** 2, T1 = Math.tan(phi1) ** 2;
  const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) ** 2);
  const R1 = (a * (1 - e2)) / (1 - e2 * Math.sin(phi1) ** 2) ** 1.5;
  const D = (x - X0) / (N1 * K0);
  const lat = phi1 - ((N1 * Math.tan(phi1)) / R1) * (D * D / 2 - ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4) / 24
    + ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6) / 720);
  const lon = LON0 + (D - ((1 + 2 * T1 + C1) * D ** 3) / 6 + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5) / 120) / Math.cos(phi1);
  return [lat, lon];
}

function toGeocentric([lat, lon], { a, f }) {
  const e2 = f * (2 - f), N = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
  return [N * Math.cos(lat) * Math.cos(lon), N * Math.cos(lat) * Math.sin(lon), N * (1 - e2) * Math.sin(lat)];
}

function fromGeocentric([X, Y, Z], { a, f }) {
  const e2 = f * (2 - f), p = Math.hypot(X, Y);
  let lat = Math.atan2(Z, p * (1 - e2));
  for (let i = 0; i < 6; i++) { const N = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2); lat = Math.atan2(Z + e2 * N * Math.sin(lat), p); }
  return [lat, Math.atan2(Y, X)];
}

/** KATEC x, y → { lat, lon } (WGS84, 도) */
export function katecToWgs84(x, y) {
  const bessel = tmInverse(Number(x), Number(y));
  const g = toGeocentric(bessel, BESSEL).map((v, i) => v + SHIFT[i]);
  const [lat, lon] = fromGeocentric(g, WGS84);
  return { lat: +(lat * 180 / Math.PI).toFixed(6), lon: +(lon * 180 / Math.PI).toFixed(6) };
}

/** WGS84 → 오피넷 KATEC. 요청에만 사용하며 좌표·키를 로그에 남기지 않는다. */
export function wgs84ToKatec(lat,lon) {
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<33||lat>39||lon<124||lon>132)throw Error('국내 좌표가 필요해요.');
  const g=toGeocentric([lat*Math.PI/180,lon*Math.PI/180],WGS84).map((v,i)=>v-SHIFT[i]);
  const [phi,lambda]=fromGeocentric(g,BESSEL),{a,f}=BESSEL,e2=f*(2-f),ep2=e2/(1-e2);
  const sin=Math.sin(phi),cos=Math.cos(phi),T=Math.tan(phi)**2,C=ep2*cos*cos,N=a/Math.sqrt(1-e2*sin*sin),A=(lambda-LON0)*cos;
  const x=X0+K0*N*(A+(1-T+C)*A**3/6+(5-18*T+T*T+72*C-58*ep2)*A**5/120);
  const y=Y0+K0*(meridianArc(e2,a,phi)-meridianArc(e2,a,LAT0)+N*Math.tan(phi)*(A*A/2+(5-T+9*C+4*C*C)*A**4/24+(61-58*T+T*T+600*C-330*ep2)*A**6/720));
  return {x:+x.toFixed(3),y:+y.toFixed(3)};
}

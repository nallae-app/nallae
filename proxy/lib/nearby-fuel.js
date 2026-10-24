import {katecToWgs84,wgs84ToKatec} from './katec.js';
import {createHmac} from 'node:crypto';
export const RADII=[5000,10000,15000],PRODUCTS=['B027','D047'];
const distance=(a,b)=>{const r=Math.PI/180,dlat=(b.lat-a.lat)*r,dlon=(b.lon-a.lon)*r,h=Math.sin(dlat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dlon/2)**2;return 6371000*2*Math.asin(Math.sqrt(Math.min(1,h)));};
// 원점 5km + 8km 반지름의 8원 + 13km 반지름의 16원으로 요청 원판을 덮는다.
// 각 요청은 공식 최대 5km. 마지막에 원래 출발점 반경으로 다시 거른다.
export function queryCenters(lat,lon,radius) {
  if(!RADII.includes(radius))throw Error('invalid-radius');
  const p=wgs84ToKatec(lat,lon),out=[p];
  for(const [ring,count] of radius===5000?[]:radius===10000?[[8000,8]]:[[8000,8],[13000,16]])for(let i=0;i<count;i++){const a=2*Math.PI*i/count;out.push({x:p.x+ring*Math.cos(a),y:p.y+ring*Math.sin(a)});}
  return out;
}
export function normalizeRows(rows,product,origin,radius,asOf) {
  const ids=new Set(),out=[];
  for(const row of rows) {
    const id=String(row.UNI_ID||''),price=Number(row.PRICE),x=Number(row.GIS_X_COOR),y=Number(row.GIS_Y_COOR);
    if(!id||ids.has(id)||!Number.isFinite(price)||price<=0||!Number.isFinite(x)||!Number.isFinite(y)||x<=0||y<=0)continue;
    const p=katecToWgs84(x,y);if(p.lat<33||p.lat>39||p.lon<124||p.lon>132)continue;
    const meters=distance(origin,p);if(meters>radius)continue;ids.add(id);
    out.push({id,name:String(row.OS_NM||'').trim(),brand:String(row.POLL_DIV_CD||''),address:String(row.NEW_ADR||row.VAN_ADR||'').trim()||undefined,...p,price:{[product]:price},distance:Math.round(meters),asOf});
  }
  return out.sort((a,b)=>a.distance-b.distance||a.id.localeCompare(b.id));
}
export function createFuelService({key,fetcher=fetch,now=Date.now,cache=new Map(),ttl=30*60000,maxCalls=70}={}) {
  let quotaDate='',calls=0;const pending=new Map();
  async function tile(center,product) {
    const id=createHmac('sha256',key).update([center.x.toFixed(3),center.y.toFixed(3),product].join('|')).digest('hex'),hit=cache.get(id);
    if(hit&&hit.expires>now())return hit;
    if(pending.has(id))return pending.get(id);
    const task=(async()=>{
      const date=new Date(now()+9*3600000).toISOString().slice(0,10);if(date!==quotaDate){quotaDate=date;calls=0;}
      if(calls>=maxCalls)throw Error('quota');calls++;
      const qs=new URLSearchParams({out:'json',code:key,x:String(center.x),y:String(center.y),radius:'5000',prodcd:product,sort:'2'});
      let r,j;try{r=await fetcher('https://www.opinet.co.kr/api/aroundAll.do?'+qs,{signal:AbortSignal.timeout(20000)});j=await r.json();}catch{throw Error('upstream');}
      if(!r.ok||!Array.isArray(j?.RESULT?.OIL))throw Error('upstream');
      const value={rows:j.RESULT.OIL,asOf:new Date(now()).toISOString(),expires:now()+ttl};
      if(cache.size>=300)cache.delete(cache.keys().next().value);cache.set(id,value);return value;
    })();pending.set(id,task);try{return await task;}finally{pending.delete(id);}
  }
  return async({lat,lon,radius,product})=>{
    if(!key)throw Error('not-configured');if(!PRODUCTS.includes(product))throw Error('invalid-product');
    const centers=queryCenters(lat,lon,radius),results=[];
    for(let i=0;i<centers.length;i+=3)results.push(...await Promise.all(centers.slice(i,i+3).map(c=>tile(c,product))));
    if(results.some(x=>!x.rows.length)){
      // 해역·농촌의 진짜 0곳과 인증·한도 오류를 전국 평균 정상 응답으로 구분한다.
      if(calls>=maxCalls)throw Error('quota');calls++;
      let r,j;try{r=await fetcher('https://www.opinet.co.kr/api/avgAllPrice.do?'+new URLSearchParams({out:'json',code:key}),{signal:AbortSignal.timeout(20000)});j=await r.json();}catch{throw Error('upstream');}
      if(!r.ok||!Array.isArray(j?.RESULT?.OIL)||!j.RESULT.OIL.some(x=>Number(x.PRICE)>0))throw Error('empty-response');
    }
    const asOf=results.map(x=>x.asOf).sort()[0];
    return {complete:true,radius,product,asOf,source:'오피넷 반경 내 주유소 조회',queryCount:centers.length,stations:normalizeRows(results.flatMap(x=>x.rows),product,{lat,lon},radius,asOf)};
  };
}

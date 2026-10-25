// 배포 검증. 사용자 위치 대신 공식 공개 예시 지점만 사용하고 키·응답 원문은 출력하지 않는다.
import {katecToWgs84} from './lib/katec.mjs';
const endpoint='https://nallae-proxy.vercel.app/api/fuel';
const health=await fetch(endpoint+'?health=1',{signal:AbortSignal.timeout(30000),cache:'no-store'});
if(!health.ok){console.log(JSON.stringify({healthStatus:health.status}));process.exit(1);}
let j;try{j=await health.json();}catch{console.log('서버 상태 응답이 JSON이 아니에요.');process.exit(1);}
console.log(JSON.stringify(j));if(j.service!=='nearby-fuel'||!j.configured)process.exit(1);
if(process.argv.includes('--live')){
  // 노원 검증도 개인 위치가 아닌 공개 지역 안의 고정 지점이다.
  const nowon=process.argv.includes('--nowon');
  const origin=nowon?{lat:37.654,lon:127.056}:katecToWgs84(314681.8,544837);
  let previous=new Set();
  for(const radius of process.argv.includes('--all-radii')?[5000,10000,15000]:[5000]){
    const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',origin:'https://nallae-app.github.io'},body:JSON.stringify({...origin,radius,product:'B027'}),signal:AbortSignal.timeout(240000)});
    const data=await r.json();
    if(!r.ok||data.complete!==true||!Array.isArray(data.stations)){console.log(JSON.stringify({radius,status:r.status,error:data.error}));process.exit(1);}
    const rows=data.stations,ids=new Set(rows.map(s=>s.id));
    const meters=s=>{const rad=Math.PI/180,a=(s.lat-origin.lat)*rad,b=(s.lon-origin.lon)*rad,h=Math.sin(a/2)**2+Math.cos(origin.lat*rad)*Math.cos(s.lat*rad)*Math.sin(b/2)**2;return 6371000*2*Math.asin(Math.sqrt(h));};
    const valid=data.radius===radius&&data.product==='B027'&&Number.isFinite(Date.parse(data.asOf))&&ids.size===rows.length&&rows.every((s,i)=>s.id&&Number.isFinite(s.price?.B027)&&s.price.B027>0&&meters(s)<=radius&&Math.abs(meters(s)-s.distance)<=1&&(!i||s.distance>=rows[i-1].distance))&&[...previous].every(id=>ids.has(id));
    if(!valid){console.log(JSON.stringify({radius,error:'invalid-station-set'}));process.exit(1);}previous=ids;
    const prices=rows.map(s=>s.price.B027);console.log(JSON.stringify({area:nowon?'노원 고정 지점':'공식 예시 지점',radius,complete:data.complete,count:prices.length,minPrice:prices.length?Math.min(...prices):null,maxPrice:prices.length?Math.max(...prices):null,withinRadius:true,uniqueStations:true,distanceOrdered:true,asOf:data.asOf}));
  }
}

// 배포 검증. 사용자 위치 대신 공식 공개 예시 지점만 사용하고 키·응답 원문은 출력하지 않는다.
import {katecToWgs84} from './lib/katec.mjs';
const endpoint='https://nallae-proxy.vercel.app/api/fuel';
const health=await fetch(endpoint+'?health=1',{signal:AbortSignal.timeout(30000),cache:'no-store'});
if(!health.ok){console.log(JSON.stringify({healthStatus:health.status}));process.exit(1);}
let j;try{j=await health.json();}catch{console.log('서버 상태 응답이 JSON이 아니에요.');process.exit(1);}
console.log(JSON.stringify(j));if(j.service!=='nearby-fuel'||!j.configured)process.exit(1);
if(process.argv.includes('--live')){
  const origin=katecToWgs84(314681.8,544837);
  for(const radius of process.argv.includes('--all-radii')?[5000,10000,15000]:[5000]){
    const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',origin:'https://nallae-app.github.io'},body:JSON.stringify({...origin,radius,product:'B027'}),signal:AbortSignal.timeout(240000)});
    const data=await r.json();
    if(!r.ok||data.complete!==true||!Array.isArray(data.stations)){console.log(JSON.stringify({radius,status:r.status,error:data.error}));process.exit(1);}
    const prices=data.stations.map(s=>s.price.B027);console.log(JSON.stringify({radius,complete:data.complete,count:prices.length,minPrice:Math.min(...prices),maxPrice:Math.max(...prices),asOf:data.asOf}));
  }
}

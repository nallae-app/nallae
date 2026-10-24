// 공식 문서의 공개 예시 지점(사용자 위치 아님)에서 현재 키의 반경 조회를 확인한다.
// 키·요청 URL·응답 원문은 출력하지 않는다. 최대 3회 호출, 자동 재시도 없음.
const key=process.env.OPINET_KEY;
if(!key){console.log('OPINET_KEY 미설정');process.exit(1);}
async function query(sort,param='certkey') {
  const qs=new URLSearchParams({out:'json',[param]:key,x:'314681.8',y:'544837',radius:'5000',prodcd:'B027',sort:String(sort)});
  try{
    const r=await fetch('https://www.opinet.co.kr/api/aroundAll.do?'+qs,{signal:AbortSignal.timeout(25000)});
    const text=await r.text();let j;try{j=JSON.parse(text);}catch{return {ok:false,status:r.status,kind:'not-json'};}
    const rows=j?.RESULT?.OIL;
    if(!r.ok||!Array.isArray(rows)||!rows.length)return {ok:false,status:r.status,kind:Array.isArray(rows)?'empty':'bad-shape'};
    const clean=rows.filter(x=>String(x.UNI_ID||'')&&Number.isFinite(Number(x.PRICE))&&Number(x.PRICE)>0&&Number.isFinite(Number(x.DISTANCE))&&Number(x.DISTANCE)>=0);
    return {ok:true,status:r.status,rows:clean};
  }catch{return {ok:false,kind:'network-or-timeout'};}
}
function summary(r){if(!r.ok)return r;const prices=r.rows.map(x=>Number(x.PRICE)),distances=r.rows.map(x=>Number(x.DISTANCE));return {ok:true,status:r.status,count:r.rows.length,minPrice:Math.min(...prices),maxPrice:Math.max(...prices),minDistance:Math.min(...distances),maxDistance:Math.max(...distances)};}
let distance=await query(2),param='certkey';
console.log('반경 5km 거리순(certkey): '+JSON.stringify(summary(distance)));
if(!distance.ok){await new Promise(r=>setTimeout(r,1000));distance=await query(2,'code');param='code';console.log('반경 5km 거리순(code): '+JSON.stringify(summary(distance)));}
if(distance.ok){
  await new Promise(r=>setTimeout(r,1000));const price=await query(1,param);console.log('같은 반경 최저가순: '+JSON.stringify(summary(price)));
  if(price.ok){const ids=new Set(distance.rows.map(x=>String(x.UNI_ID)));console.log(JSON.stringify({sameStationSet:price.rows.length===ids.size&&price.rows.every(x=>ids.has(String(x.UNI_ID))),distanceOrdered:distance.rows.every((x,i,xs)=>i===0||Number(x.DISTANCE)>=Number(xs[i-1].DISTANCE)),priceOrdered:price.rows.every((x,i,xs)=>i===0||Number(x.PRICE)>=Number(xs[i-1].PRICE)),within5km:distance.rows.every(x=>Number(x.DISTANCE)<=5000)}));}
}else process.exitCode=1;

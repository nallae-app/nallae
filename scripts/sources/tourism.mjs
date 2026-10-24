// 한국관광공사 국문 관광정보_GW: https://www.data.go.kr/data/15101578/openapi.do
// 공식 Swagger KorService2/areaBasedList2. 이용허락범위 제한 없음.
// 사진(Type1/Type3)은 가져오지 않는다. 맛 평가나 현재 영업을 보증하지 않는다.
import {sggAt} from './festivals.mjs';
import {resolvePlace,regionIndex} from '../lib/regions.mjs';
const API='https://apis.data.go.kr/B551011/KorService2/areaBasedList2';
export const TOUR_TYPES={'39':'음식점','12':'관광지','14':'문화시설','28':'레포츠'};
const clean=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
export function tourItems(rows) {
  const seen=new Set(),out=[];
  for(const r of rows) {
    const type=String(r.contenttypeid),id='tour-'+r.contentid,name=clean(r.title),address=clean([r.addr1,r.addr2].filter(Boolean).join(' '));
    if(!TOUR_TYPES[type]||!/^tour-\d+$/.test(id)||seen.has(id)||!name||!address)continue;
    const found=resolvePlace(address,{strict:true}).sgg;
    let lat=Number(r.mapy),lon=Number(r.mapx),point=Number.isFinite(lat)&&lat>32&&lat<39.5&&Number.isFinite(lon)&&lon>124&&lon<132.5?sggAt(lon,lat):null;
    // 0 좌표·타지역 좌표를 주소에 맞춰 임의 이동하지 않는다.
    if(point&&found.length&& !found.includes(point)) point=null;
    const sgg=point||(found.length===1?found[0]:null);if(!sgg)continue;
    const region=regionIndex.sgg.find(x=>x.code===sgg);if(!region)continue;
    seen.add(id);out.push({id,name,address,sgg,district:region.short+' '+region.name,kind:TOUR_TYPES[type],type,
      ...(point?{lat,lon}:{}),source:{type:'tourism',name:'한국관광공사 관광정보',url:'https://www.data.go.kr/data/15101578/openapi.do'},
      ...( /^\d{14}$/.test(String(r.modifiedtime))?{sourceDate:String(r.modifiedtime).slice(0,8).replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3')}:{} )});
  }
  return out;
}
export async function fetchTourism({key,types=Object.keys(TOUR_TYPES),fetcher=fetch}) {
  if(!key)return {skipped:'DATA_GO_KR_KEY 없음'};
  const all=[];const totals={};
  for(const type of types) {
    const rows=[],ids=new Set();let total;
    for(let page=1;page<=150;page++) {
      const q=new URLSearchParams({serviceKey:key,MobileOS:'ETC',MobileApp:'Nallae',_type:'json',contentTypeId:type,numOfRows:'500',pageNo:String(page),arrange:'A'});
      let res;try{res=await fetcher(API+'?'+q,{signal:AbortSignal.timeout(30000)});}catch{throw Error('관광정보 연결 실패');}
      if(!res.ok)throw Error('관광정보 HTTP '+res.status);
      const text=await res.text();let j;try{j=JSON.parse(text);}catch{
        const code=text.match(/<returnReasonCode>([A-Z0-9_]+)<\/returnReasonCode>/)?.[1];
        throw Error('관광정보 응답 오류'+(code?' '+code:''));
      }
      const h=j.response?.header,b=j.response?.body;
      if(!['0000','00'].includes(String(h?.resultCode)))throw Error('관광정보 인증·서비스 오류 '+String(h?.resultCode||'unknown').replace(/[^A-Z0-9_]/gi,'').slice(0,20));
      const count=Number(b?.totalCount);if(!Number.isInteger(count)||count<=0||count>75000||total!==undefined&&count!==total)throw Error('관광정보 전체 건수 불일치');total=count;
      let batch=b.items?.item||[];if(!Array.isArray(batch))batch=[batch];
      if(!batch.length)throw Error('관광정보 중간 페이지 없음');
      for(const row of batch){const id=String(row.contentid);if(ids.has(id))throw Error('관광정보 중복 페이지');ids.add(id);rows.push(row);}
      if(rows.length>=total)break;
    }
    if(rows.length!==total)throw Error('관광정보 전체 수집 미완료');
    totals[type]=total;all.push(...rows);
  }
  return {complete:true,source:'한국관광공사 국문 관광정보',license:'이용허락범위 제한 없음',totals,items:tourItems(all)};
}

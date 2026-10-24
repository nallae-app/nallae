// 공식 CSV 두 개를 대조해 2026 지정 목록에 있고 음식 업종 근거가 있는 곳만 수록한다.
// 이용허락범위 제한 없음(2026-10-24 확인), 대표자·전화번호는 저장하지 않는다.
// 최신 지정: https://www.data.go.kr/data/15132695/fileData.do (2026-08-20)
// 업종 근거: https://www.data.go.kr/data/15102255/fileData.do (2022-07-13)
// 실행: node scripts/build-heritage-restaurants.mjs <최신.csv> <업종.csv>
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {parseCsv} from './sources/food-safety.mjs';
import {resolvePlace,regionIndex} from './lib/regions.mjs';
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
const normalized=s=>clean(s).replace(/㈜|주식회사|\(주\)|\s/g,'');
const restaurantKind=/한식|한정식|중식|중화요리|중국요리|일식|양식|음식점|식당|요리|식사|제과|제빵|국밥|순대|냉면|막국수|칼국수|설렁탕|곰탕|추어탕|삼계탕|감자탕|매운탕|육개장|해장국|갈비|불고기|곱창|족발|보쌈|닭갈비|통닭|치킨|백숙|장어|복어|만두|비빔밥|비빔국수|찌개|돈까스|돈가스|분식|횟집|회정식|초밥|파전|생선구이/;
const codeFor=address=>{const found=resolvePlace(address,{strict:true}).sgg;return found.length===1?found[0]:null;};
export function buildHeritage(current,legacy) {
  const known=new Map();
  for(const row of legacy) {
    const kind=clean(row['주요사업']); if(!restaurantKind.test(kind)||/제조|가공|도소매|도매|소매|유통/.test(kind)) continue;
    const code=codeFor(row['기본주소']); if(!code)continue;
    const key=normalized(row['업체명'])+'|'+code;
    if(!known.has(key))known.set(key,new Set());known.get(key).add(kind);
  }
  const seen=new Set(),items=[];
  for(const row of current) {
    const name=clean(row['업체명']),address=clean(row['업체주소']),sgg=codeFor(address);
    if(!sgg||!name||!address)continue;
    const kinds=known.get(normalized(name)+'|'+sgg);if(!kinds||kinds.size!==1)continue;
    const key=normalized(name)+'|'+address;if(seen.has(key))continue;seen.add(key);
    const region=regionIndex.sgg.find(m=>m.code===sgg);
    items.push({id:'heritage-'+createHash('sha256').update(key).digest('hex').slice(0,16),name,branch:null,address,district:region.short+' '+region.name,sgg,food:[...kinds][0],source:{type:'heritage',name:'소상공인시장진흥공단 백년가게 지정',url:'https://www.data.go.kr/data/15132695/fileData.do'},sourceDate:'2026-08-20',kindDate:'2022-07-13',checkedAt:'2026-10-24'});
  }
  return {source:'소상공인시장진흥공단',sourceDate:'2026-08-20',kindDate:'2022-07-13',license:'이용허락범위 제한 없음',note:'2026년 지정 목록과 2022년 업종 자료의 상호·시군구를 대조한 음식 업종. 맛·현재 영업 보증 아님. 좌표는 임의로 만들지 않음.',items};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const [currentPath,legacyPath]=process.argv.slice(2);if(!currentPath||!legacyPath)throw Error('최신 지정 CSV와 업종 CSV가 필요해요.');
  const read=file=>parseCsv(new TextDecoder('euc-kr').decode(fs.readFileSync(file)));
  const data=buildHeritage(read(currentPath),read(legacyPath));
  fs.writeFileSync('web/data/heritage-restaurants.json',JSON.stringify(data));
  console.log(JSON.stringify({restaurants:data.items.length,regions:new Set(data.items.map(x=>x.sgg)).size}));
}

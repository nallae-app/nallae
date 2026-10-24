// 전국관광지정보(15021141)·전국도시공원정보(15012890) 공개 표준자료.
// 시설명·위치·분류·관리기관·기준일만 사용, 소개문·사진은 재배포하지 않는다.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {sggAt} from './sources/festivals.mjs';
import {resolvePlace,regionIndex} from './lib/regions.mjs';
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
export function outingItems(rows,type) {
  const out=[],seen=new Set();
  for(const r of rows) {
    const name=clean(type==='park'?r.PARK_NM:r.TRRSRT_NM),address=clean(r.RDNMADR||r.LNMADR),lat=Number(r.LATITUDE),lon=Number(r.LONGITUDE);
    if(!name||!address||!Number.isFinite(lat)||lat<33||lat>39||!Number.isFinite(lon)||lon<124||lon>132)continue;
    const sgg=sggAt(lon,lat),found=resolvePlace(address,{strict:true}).sgg;
    if(!sgg||found.length&&!found.includes(sgg))continue;
    const key=type+'|'+name+'|'+address;if(seen.has(key))continue;seen.add(key);
    const region=regionIndex.sgg.find(x=>x.code===sgg);if(!region)continue;
    out.push({id:'outing-'+createHash('sha256').update(key).digest('hex').slice(0,16),name,address,lat,lon,sgg,district:region.short+' '+region.name,type,
      kind:clean(type==='park'?r.PARK_SE:r.TRRSRT_SE),source:clean(r.INSTITUTION_NM||r.INSTT_NM)||'지방자치단체',
      referenceDate:/^\d{4}-\d{2}-\d{2}$/.test(r.REFERENCE_DATE||'')?r.REFERENCE_DATE:null,
      sourceUrl:'https://www.data.go.kr/data/'+(type==='park'?'15012890':'15021141')+'/standard.do'});
  }
  return out;
}
export function writeOutings(items,updated=new Date().toISOString(),root='web/data/outings') {
  fs.mkdirSync(root,{recursive:true});const counts={};
  for(const region of regionIndex.sgg) {
    const list=items.filter(x=>x.sgg===region.code);counts[region.code]=list.length;
    fs.writeFileSync(root+'/'+region.code+'.json',JSON.stringify({updated,items:list}));
  }
  const attractions=items.filter(x=>x.type==='attraction');
  const index={updated,source:'공공데이터포털 전국관광지·도시공원 표준데이터',policyUrl:'https://www.data.go.kr/ugs/selectPortalPolicyView.do',counts,total:items.length,parks:items.length-attractions.length,attractions:attractions.length,featured:attractions};
  fs.writeFileSync(root+'/index.json',JSON.stringify(index));return index;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const read=n=>JSON.parse(fs.readFileSync('output/discovery/'+n+'-raw.json','utf8')).rows;
  const index=writeOutings([...outingItems(read('attractions'),'attraction'),...outingItems(read('parks'),'park')]);
  console.log(JSON.stringify({total:index.total,parks:index.parks,attractions:index.attractions,regions:Object.values(index.counts).filter(Boolean).length}));
}

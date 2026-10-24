// 공공데이터포털의 공개 JSON 다운로드와 같은 요청. 키·로그인 불필요.
// 공개 사양: https://www.data.go.kr/js/biz/mvc/std/std-download-manager.js
export async function downloadStandard(pk,{fetcher=fetch,limit=50000}={}) {
  const base='https://www.data.go.kr/download/';
  const get=async url=>{const r=await fetcher(url,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('표준자료 HTTP '+r.status);return r.json();};
  const header=await get(base+'columList.json?'+new URLSearchParams({pk,ext:'JSON'}));
  const total=Number(header.totalCount),table=header.tableVO;
  if(!Number.isInteger(total)||total<=0||total>limit||!Array.isArray(header.columList)||!Array.isArray(table?.colNmList)||!/^tn_[a-z_]+_svc$/.test(table.svcTableNm))throw Error('표준자료 구조·건수 확인 실패');
  const rows=[];
  for(let page=1;rows.length<total;page++) {
    const qs=new URLSearchParams({publicDataPk:pk,totalCount:String(total),svcTableNm:table.svcTableNm,perPage:'10000',page:String(page)});
    for(const col of table.colNmList)qs.append('colNmList',col);
    const batch=await get(base+'standard.json?'+qs);
    if(!Array.isArray(batch)||!batch.length||batch.length>10000||rows.length+batch.length>total)throw Error('표준자료 중간 페이지·전체 건수 불일치');
    rows.push(...batch);
  }
  return {name:header.fileName,rows,columns:header.columList};
}

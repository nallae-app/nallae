// 제보와 개인 코스 메모의 자료 규칙. 통신·위치 조회·기기 저장을 하지 않는 순수 모듈.
(() => {
  'use strict';
  const LIMITS=Object.freeze({id:240,name:120,address:240,source:200,title:80,reason:600,caution:600,review:500,url:2048});
  const text=value=>typeof value==='string'?value.replace(/\r\n?/g,'\n').trim():'';
  const control=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
  const bounded=(value,max,required=false)=>typeof value==='string'&&(!required||value.length>0)&&value.length<=max&&!control.test(value);
  const idValid=value=>bounded(value,LIMITS.id,true)&&value===value.trim()&&!/[\r\n\t]/.test(value);
  const nowDate=options=>{const date=new Date(options?.now??Date.now());return Number.isFinite(date.getTime())?date:null;};
  const koreaDay=date=>new Date(date.getTime()+9*3600000).toISOString().slice(0,10);
  const validDay=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
  const monthValid=(value,now)=>/^\d{4}-(0[1-9]|1[0-2])$/.test(value)&&value>='1900-01'&&value<=koreaDay(now).slice(0,7);
  const number=value=>{
    if(value===null||value===undefined||value==='')return null;
    if(typeof value!=='number'&&(typeof value!=='string'||! /^-?\d+(?:\.\d+)?$/.test(value.trim())))return null;
    const n=Number(value);return Number.isFinite(n)?n:null;
  };
  const point=stop=>Number.isFinite(stop?.lat)&&Number.isFinite(stop?.lon)&&stop.lat>=33&&stop.lat<=39&&stop.lon>=124&&stop.lon<=132;
  function publicUrl(value) {
    const s=text(value);if(!s)return '';
    try{const u=new URL(s);return s.length<=LIMITS.url&&['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!control.test(s)?u.href:null;}catch(_){return null;}
  }
  function stopDraft(input,index) {
    const stop=input&&typeof input==='object'?input:{};
    const source=stop.source&&typeof stop.source==='object'?stop.source:{};
    return {id:text(stop.id)||'submitted-'+(index+1),name:text(stop.name),address:text(stop.address),lat:number(stop.lat),lon:number(stop.lon),source:typeof stop.source==='string'?text(stop.source):text(source.name),sourceUrl:text(stop.sourceUrl||source.url),referenceDate:text(stop.referenceDate)};
  }
  function normalizeDraft(input={}) {
    const raw=input&&typeof input==='object'?input:{};
    const kind=raw.kind==='course'?'course':'place';
    const stops=Array.isArray(raw.stops)&&raw.stops.length?raw.stops.slice(0,4):Array.from({length:kind==='place'?1:2},()=>({}));
    return {kind,title:text(raw.title),stops:stops.map(stopDraft),recentVisit:text(raw.recentVisit),reason:text(raw.reason),caution:text(raw.caution),relationship:['none','owner','compensated'].includes(raw.relationship)?raw.relationship:'',consent:{publication:raw.consent?.publication===true,sourceDetails:raw.consent?.sourceDetails===true}};
  }
  function validateSubmission(input,options={}) {
    const now=nowDate(options);if(!now||!input||typeof input!=='object'||!['place','course'].includes(input.kind)||!Array.isArray(input.stops))return null;
    const count=input.stops.length;if(input.kind==='place'?count!==1:count<2||count>4)return null;
    if(!['none','owner','compensated'].includes(input.relationship))return null;
    const draft=normalizeDraft(input);
    if(!bounded(draft.title,LIMITS.title,true)||!bounded(draft.reason,LIMITS.reason,true)||!bounded(draft.caution,LIMITS.caution)||!monthValid(draft.recentVisit,now)||!draft.consent.publication||!draft.consent.sourceDetails)return null;
    const ids=new Set();
    for(let i=0;i<draft.stops.length;i++){
      const stop=draft.stops[i],raw=input.stops[i];if(!raw||typeof raw!=='object'||!idValid(stop.id)||ids.has(stop.id)||!bounded(stop.name,LIMITS.name,true)||!bounded(stop.address,LIMITS.address,true)||!bounded(stop.source,LIMITS.source))return null;
      ids.add(stop.id);const url=publicUrl(stop.sourceUrl);if(url===null||(!stop.source&&!url))return null;stop.sourceUrl=url;
      if(stop.referenceDate&&(!validDay(stop.referenceDate)||stop.referenceDate>koreaDay(now)))return null;
      const provided=['lat','lon'].some(k=>raw[k]!==undefined&&raw[k]!==null&&raw[k]!=='');if(provided&&!point(stop))return null;
    }
    return draft;
  }
  function parseCatalog(data,options={}) {
    const result={schemaVersion:1,valid:false,items:[],rejected:0};
    const now=nowDate(options);if(!now||data?.schemaVersion!==1||!Array.isArray(data.items))return result;
    result.valid=true;const ids=new Set(),places=new Map();
    for(const item of data.items){
      const normalized=validateSubmission(item,options);
      if(!normalized||item.status!=='approved'||item.checked!==true||!idValid(item.id)||ids.has(item.id)||item.stops.some(stop=>!idValid(stop?.id)||typeof stop.lat!=='number'||typeof stop.lon!=='number')||!normalized.stops.every(point)) {result.rejected++;continue;}
      if(item.checkedAt&&(!validDay(item.checkedAt)||item.checkedAt>koreaDay(now))){result.rejected++;continue;}
      const conflicts=normalized.stops.some(stop=>places.has(stop.id)&&places.get(stop.id)!==JSON.stringify([stop.name,stop.address,stop.lat,stop.lon]));if(conflicts){result.rejected++;continue;}
      ids.add(item.id);normalized.stops.forEach(stop=>places.set(stop.id,JSON.stringify([stop.name,stop.address,stop.lat,stop.lon])));
      result.items.push({...normalized,id:item.id,status:'approved',checked:true,checkedAt:item.checkedAt||null,verification:'unverified'});
    }
    return result;
  }
  function orderedPlanId(stops) {
    if(!Array.isArray(stops)||stops.length<2||stops.length>4)return null;
    const ids=stops.map(stop=>typeof stop==='string'?stop:stop?.id);
    if(!ids.every(idValid)||new Set(ids).size!==ids.length)return null;
    return 'v2:'+JSON.stringify(ids);
  }
  function normalizeReview(input,options={}) {
    const now=nowDate(options);if(!now||!input||typeof input!=='object'||(input.scope!==undefined&&input.scope!=='course'))return null;
    let planId=Array.isArray(input.stops)?orderedPlanId(input.stops):null;
    if(input.stops!==undefined&&!planId)return null;
    if(input.planId!==undefined){
      if(typeof input.planId!=='string'||!input.planId.startsWith('v2:'))return null;
      let ids;try{ids=JSON.parse(input.planId.slice(3));}catch(_){return null;}
      const canonical=orderedPlanId(ids);if(!canonical||canonical!==input.planId||(planId&&planId!==canonical))return null;planId=canonical;
    }
    const rating=typeof input.rating==='number'?input.rating:typeof input.rating==='string'&&/^[1-5]$/.test(input.rating)?Number(input.rating):NaN;
    if(!planId||!Number.isInteger(rating)||rating<1||rating>5||(input.text!==undefined&&typeof input.text!=='string'))return null;
    const note=text(input.text);if(!bounded(note,LIMITS.review))return null;
    const updatedAt=input.updatedAt===undefined?now.toISOString():input.updatedAt;
    if(typeof updatedAt!=='string'||!Number.isFinite(Date.parse(updatedAt)))return null;
    return {schemaVersion:1,planId,scope:'course',rating,text:note,updatedAt};
  }
  globalThis.NallaeCommunity=Object.freeze({LIMITS,normalizeDraft,validateSubmission,parseCatalog,normalizeReview,orderedPlanId});
})();

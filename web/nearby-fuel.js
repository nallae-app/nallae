// 비밀키 없이 날래 서버에 POST한다. 위치는 URL·기기 저장소에 넣지 않는다.
(() => {
  const ENDPOINT='https://nallae-proxy.vercel.app/api/fuel';
  function createClient({fetcher=fetch,now=Date.now,ttl=30*60000}={}) {
    const cache=new Map();
    const keyFor=q=>[q.lat,q.lon,q.radius,q.product].join('|');
    const peek=q=>{const entry=cache.get(keyFor(q));if(entry?.status==='ready'&&entry.expires<=now()){cache.delete(keyFor(q));return undefined;}return entry;};
    async function load(q,{retry=false}={}) {
      if(![5000,10000,15000].includes(q.radius)||!['B027','D047'].includes(q.product)||!NallaeDiscovery.point(q))throw Error('invalid-query');
      const key=keyFor(q),previous=peek(q);if(previous&&!retry){if(previous.status==='loading')return previous.promise;if(previous.status==='ready')return previous.data;if(previous.status==='error')throw Error(previous.error);}
      const entry={status:'loading'};cache.set(key,entry);
      entry.promise=(async()=>{
        try {
          const r=await fetcher(ENDPOINT,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(q),cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(240000)});
          const data=await r.json();
          if(!r.ok){const kind=['quota','not-configured','empty-response','upstream'].includes(data?.error)?data.error:'upstream';throw Error(kind);}
          if(data.complete!==true||data.radius!==q.radius||data.product!==q.product||!Array.isArray(data.stations)||!Number.isFinite(Date.parse(data.asOf)))throw Error('invalid-response');
          const ids=new Set();const stations=data.stations.filter(s=>{
            if(typeof s.id!=='string'||!s.id||ids.has(s.id)||!NallaeDiscovery.point(s)||!Number.isFinite(s.price?.[q.product])||s.price[q.product]<=0||NallaeDiscovery.distance(q,s)>q.radius)return false;
            ids.add(s.id);return true;
          });
          const clean={...data,stations};Object.assign(entry,{status:'ready',data:clean,expires:now()+ttl});return clean;
        }catch(e){const kind=['quota','not-configured','empty-response','invalid-response'].includes(e.message)?e.message:'upstream';Object.assign(entry,{status:'error',error:kind});throw Error(kind);}
      })();return entry.promise;
    }
    return {keyFor,peek,load};
  }
  globalThis.NallaeNearbyFuel=Object.freeze({ENDPOINT,createClient});
})();

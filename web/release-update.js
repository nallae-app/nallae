// Existing open documents update only when the user chooses to apply a release.
(() => {
  'use strict';
  const current=Number(document.documentElement.dataset.appVersion);
  if(!Number.isSafeInteger(current))return;
  const banner=document.getElementById('app-update');
  let registration=null,pending=null,lastCheck=0,newest=current;
  function announce(version){
    if(!Number.isSafeInteger(version)||version<=current)return;
    newest=Math.max(newest,version);if(banner)banner.hidden=false;
  }
  async function check(force=false){
    if(pending)return pending;
    if(!force&&Date.now()-lastCheck<60000)return;
    lastCheck=Date.now();
    pending=(async()=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
      try{
        void registration?.update().catch(()=>{});
        const response=await fetch('data/app-release.json',{cache:'no-store',signal:controller.signal});
        if(response.ok)announce((await response.json()).version);
      }catch(_){/* Offline or failed checks never discard an existing screen. */}
      finally{clearTimeout(timer);pending=null;}
    })();
    return pending;
  }
  async function apply(button){
    if(button){button.disabled=true;button.textContent='불러오는 중…';}
    // The unique release navigation also bypasses an older cache-first worker.
    try{await Promise.race([registration?.update().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,2000))]);}catch(_){}
    const url=new URL(location.href);url.searchParams.set('appv',String(newest));
    location.replace(url.href);
  }
  document.querySelectorAll('[data-app-refresh]').forEach(button=>button.addEventListener('click',()=>void apply(button)));
  if('serviceWorker' in navigator&&location.protocol==='https:'){
    navigator.serviceWorker.addEventListener('controllerchange',()=>void check(true));
    navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(value=>{registration=value;void check(true);}).catch(()=>{});
  }
  window.addEventListener('pageshow',()=>void check());
  window.addEventListener('online',()=>void check(true));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void check();});
  void check();
})();

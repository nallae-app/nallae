import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const out='docs/design/review-current/final-qa';fs.mkdirSync(out,{recursive:true});
const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const results=[],errors=[];let failures=0;
try {
for(const [w,h] of [[375,812],[768,1024],[1280,800]])for(const theme of ['light','dark']){
 const p=await b.newPage();p.on('pageerror',e=>errors.push(e.message));
 await p.setViewport({width:w,height:h,isMobile:w===375,hasTouch:w===375});
 await p.evaluateOnNewDocument(()=>{localStorage.clear();localStorage.setItem('nallae-mode','explore');localStorage.setItem('nallae-explore-layer','fuel');localStorage.setItem('nallae-sheet-stage','full');navigator.geolocation.getCurrentPosition=(_ok,bad)=>bad({code:1});});
 await p.goto('http://localhost:5173/?demo&debug&theme='+theme,{waitUntil:'networkidle0'});
 for(const layer of ['fuel','weather','places','food']){
  await p.click('[data-layer="'+layer+'"]');await new Promise(r=>setTimeout(r,350));
  const d=await p.$('.source-disclosure');if(!d){failures++;results.push({w,theme,layer,missing:true});continue;}
  const before=await d.$eval('p',e=>e.checkVisibility());
  await p.click('.source-disclosure summary');
  const state=await p.evaluate(()=>{const d=document.querySelector('.source-disclosure'),p=d.querySelector('p');return {open:d.open,display:getComputedStyle(p).display,paragraphSize:getComputedStyle(p).fontSize,summarySize:getComputedStyle(d.querySelector('summary')).fontSize,legendSize:d.querySelector('[role=img]')?getComputedStyle(d.querySelector('[role=img]')).fontSize:null,overflow:document.documentElement.scrollWidth>innerWidth,paragraphHeight:p.getBoundingClientRect().height};});
  const pass=!before&&state.open&&state.display!=='none'&&state.paragraphHeight>0&&!state.overflow;
  if(!pass)failures++;results.push({w,h,theme,layer,pass,...state});
  await p.screenshot({path:out+'/'+w+'-'+theme+'-'+layer+'.png'});
  await p.click('.source-disclosure summary');if(await d.$eval('p',e=>e.checkVisibility()))failures++;
 }
 await p.evaluate(()=>document.querySelector('#btn-locate').click());await new Promise(r=>setTimeout(r,100));
 const denied=await p.evaluate(()=>document.body.innerText.includes('위치 권한이 없어요'));
 results.push({w,theme,permissionDenied:denied});if(!denied)failures++;
 await p.close();
}
}finally{await b.close();}
fs.writeFileSync(out+'/metadata.json',JSON.stringify({results,errors,failures},null,2));console.log(JSON.stringify({results,errors,failures}));process.exitCode=failures||errors.length?1:0;

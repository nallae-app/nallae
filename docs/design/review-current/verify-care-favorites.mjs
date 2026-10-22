// 독립 회귀: 임시 Chrome 프로필에 관심 지역/시작 지역을 준비하고 실제 버튼으로 모드·지역을 전환한다.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const results=[];
try {
  const page=await browser.newPage();
  await page.setViewport({width:375,height:812,isMobile:true,hasTouch:true});
  await page.evaluateOnNewDocument(()=>{
    if(!localStorage.getItem('care-regression-initialized')){
      localStorage.setItem('nallae-favorites-v1',JSON.stringify({version:1,regions:[{code:'11440',name:'집'},{code:'11110',name:'직장'}],startCode:'11440'}));
      localStorage.setItem('nallae-mode','explore');localStorage.setItem('nallae-explore-layer','pharmacy');
      localStorage.setItem('care-regression-initialized','1');
    }
  });
  const check=async(name,fn)=>{const ok=await fn();results.push(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)process.exitCode=1;};
  await page.goto('http://localhost:5173/?demo',{waitUntil:'networkidle0'});
  await page.waitForSelector('.care-card');
  await check('시작 관심지역에서 약국 4곳',async()=>await page.$$eval('.care-card',els=>els.length)===4);
  await page.click('[data-layer="er"]');
  await check('응급실 전환 시 집 지역 유지',async()=>await page.$$eval('.care-card',els=>els.length)===3);
  await page.click('[data-mode-choice="news"]');await page.click('[data-mode-choice="explore"]');
  await check('소식 왕복 후 응급실과 관심지역 유지',async()=>await page.$$eval('.care-card',els=>els.length)===3);
  const work=await page.$('#favorites [data-code="11110"]');
  if(!work)throw Error('관심지역 버튼을 찾지 못함');
  await work.click();
  await check('직장 선택 시 0건 지역 안내',async()=>await page.$eval('#feed',el=>el.innerText.includes('종로구')&&el.innerText.includes('공식 자료')));
  await page.reload({waitUntil:'networkidle0'});
  await page.waitForSelector('.care-card');
  await check('새로고침 후 시작지역 집 및 저장 분류 복원',async()=>await page.$$eval('.care-card',els=>els.length)===3);
  await check('관심지역 저장 2곳과 시작지역 보존',async()=>await page.evaluate(()=>{const x=JSON.parse(localStorage.getItem('nallae-favorites-v1'));return x.regions.length===2&&x.startCode==='11440';}));
}finally{await browser.close();fs.writeFileSync('docs/design/review-current/care-favorites-verify.txt',results.join('\n')+'\n');console.log(results.join('\n'));}

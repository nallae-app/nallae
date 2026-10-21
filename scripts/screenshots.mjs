// Play 스토어 휴대전화 스크린샷(1080×1920, 9:16). 기본은 실제 배포 사이트의 실데이터.
// 사용: node scripts/screenshots.mjs [base-url] [--demo]
//   base-url 기본값: https://nallae-app.github.io/nallae/
// 데모 데이터로 찍으면 화면에 '데모' 표시가 남는다 — 스토어에는 실데이터 화면을 올린다.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const args = process.argv.slice(2);
const DEMO = args.includes('--demo');
const BASE = (args.find((a) => !a.startsWith('--')) || 'https://nallae-app.github.io/nallae/').replace(/\/?$/, '/');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 관심 지역을 미리 넣어 '시작 지역' 화면을 재현한다 (앱 저장 형식: nallae-favorites-v1)
const favorites = (startCode) => ({ version: 1, regions: [{ code: '11440', name: '집' }, { code: '11680', name: '직장' }, { code: '26350', name: '부모님 동네' }], startCode });
const shots = [
  { file: 'screenshot-1-national.png', theme: 'light', fav: favorites(null), wait: 6000 },
  { file: 'screenshot-2-region.png', theme: 'light', fav: favorites('11440'), wait: 4500 },
  { file: 'screenshot-3-detail.png', theme: 'light', fav: favorites(null), wait: 5000, open: true, sheet: 'full' },
  { file: 'screenshot-4-dark.png', theme: 'dark', fav: favorites(null), wait: 6000 },
];

fs.mkdirSync('store', { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] });
for (const s of shots) {
  const page = await browser.newPage();
  await page.setViewport({ width: 360, height: 640, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: s.theme }]);
  await page.evaluateOnNewDocument((fav, sheet) => {
    try {
      localStorage.setItem('nallae-favorites-v1', JSON.stringify(fav));
      localStorage.setItem('nallae-sheet-stage', sheet || 'middle');
    } catch (_) {}
  }, s.fav, s.sheet);
  await page.goto(`${BASE}?theme=${s.theme}${DEMO ? '&demo' : ''}`, { waitUntil: 'networkidle0' });
  await wait(s.wait);
  if (s.open) {
    // 첫 소식의 상세를 펼친다
    await page.evaluate(() => document.querySelector('#feed li button, #feed li')?.click());
    await wait(1500);
  }
  const out = path.join('store', s.file);
  await page.screenshot({ path: out });
  console.log(out);
  await page.close();
}
await browser.close();

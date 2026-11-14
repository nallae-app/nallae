import { browserPath } from './lib/browser.mjs';
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
const CHROME = browserPath();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 관심 지역을 미리 넣어 '시작 지역' 화면을 재현한다 (앱 저장 형식: nallae-favorites-v1)
const favorites = (startCode) => ({ version: 1, regions: [{ code: '11440', name: '집' }, { code: '11680', name: '직장' }, { code: '26350', name: '부모님 동네' }], startCode });
const shots = [
  { file: '스크린샷-전국.png', theme: 'light', fav: favorites(null), wait: 6000 },
  { file: '스크린샷-지역.png', theme: 'light', fav: favorites('11440'), region: '11440', wait: 4500 },
  { file: '스크린샷-소식상세.png', theme: 'light', fav: favorites(null), wait: 5000, open: true, sheet: 'full' },
  { file: '스크린샷-다크모드.png', theme: 'dark', fav: favorites(null), wait: 6000 },
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
      localStorage.setItem('nallae-mode', 'explore');
      localStorage.setItem('nallae-explore-layer', 'outing');
      localStorage.setItem('nallae-sheet-stage', sheet || 'full');
    } catch (_) {}
  }, s.fav, s.sheet);
  await page.goto(`${BASE}?theme=${s.theme}${DEMO ? '&demo' : ''}`, { waitUntil: 'networkidle0' });
  await wait(s.wait);
  await page.waitForSelector('[data-outing-filters]', { timeout: 15000 });
  if (s.region) {
    await page.click('[data-outing-filters]');
    await page.select('[data-outing-region]', s.region);
    await page.click('[data-outing-filters-close]');
    await page.waitForSelector('[data-plan-save]', { timeout: 15000 });
  }
  if (s.open) {
    // 기본이 코스 화면이므로 소식 화면으로 먼저 이동한다. 다른 버튼을 상세로 오인하지 않는다.
    await page.click('[data-open-utilities]');
    await page.click('[data-mode-choice="news"]');
    await page.waitForSelector('#feed li[data-id] .card-toggle', { timeout: 15000 });
    await page.click('#feed li[data-id] .card-toggle');
    await page.waitForSelector('#feed li.open .detail', { timeout: 10000 });
    await wait(1500);
  }
  const out = path.join('store', s.file);
  await page.screenshot({ path: out });
  console.log(out);
  await page.close();
}
await browser.close();

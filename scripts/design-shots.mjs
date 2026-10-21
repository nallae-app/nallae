// 디자인 비교 스크린샷 (정확한 휴대폰 화면 크기). 로컬 서버가 떠 있어야 한다.
// 사용: node scripts/design-shots.mjs <base-url> <out-dir> [set]
//   set = compare(기본, A·B × 라이트·다크 × 전국·지역 = 8장) | full(현재 안 × 3크기 × 2테마 × 2화면 = 12장)
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const [base = 'http://localhost:5173', outDir = 'docs/design/shots', set = 'compare', design = 'A'] = process.argv.slice(2);
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));

const views = { 375: [375, 812, 3], 768: [768, 1024, 2], 1280: [1280, 800, 1] };
const screens = { national: '', region: '&near=11440&open' };
const jobs = [];
if (set === 'compare') {
  for (const d of ['A', 'B']) for (const t of ['light', 'dark']) for (const [sn, q] of Object.entries(screens)) jobs.push({ d, t, w: 375, sn, q });
} else {
  for (const w of [375, 768, 1280]) for (const t of ['light', 'dark']) for (const [sn, q] of Object.entries(screens)) jobs.push({ d: design, t, w, sn, q });
}

fs.mkdirSync(outDir, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] });
for (const { d, t, w, sn, q } of jobs) {
  const [vw, vh, dpr] = views[w];
  const page = await browser.newPage();
  await page.setViewport({ width: vw, height: vh, deviceScaleFactor: dpr, isMobile: vw < 760, hasTouch: vw < 760 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: t }]);
  await page.goto(`${base}/?demo&design=${d}&theme=${t}${q}`, { waitUntil: 'networkidle0' });
  // 첫 진입 재생이 몇 개 지나가고 지도가 자리 잡을 때까지
  await new Promise((r) => setTimeout(r, sn === 'region' ? 3500 : 4200));
  const file = path.join(outDir, `${d}-${t}-${w}-${sn}.png`);
  await page.screenshot({ path: file });
  console.log(file);
  await page.close();
}
await browser.close();

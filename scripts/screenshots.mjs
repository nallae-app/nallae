// 스토어용 휴대전화 스크린샷(1080×1920)과 그래픽 이미지(1024×500)를 만든다.
// 먼저 로컬 서버를 띄운다: powershell -ExecutionPolicy Bypass -File tools\serve.ps1
// 사용: node scripts/screenshots.mjs [http://localhost:5173]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const BASE = process.argv[2] || 'http://localhost:5173';
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));
if (!CHROME) throw new Error('Chrome/Edge를 찾지 못했습니다');

const shots = [
  ['screenshot-1-home.png', '?demo', 5200],
  ['screenshot-2-near.png', '?demo&near=11440', 4500],
  ['screenshot-3-detail.png', '?demo&near=11440&open', 4500],
  ['screenshot-4-gangneung.png', '?demo&near=51150&open', 4500],
];

fs.mkdirSync('store', { recursive: true });
const profile = fs.mkdtempSync(path.join(process.env.TEMP || '.', 'nallae-shot-'));
for (const [file, query, wait] of shots) {
  const out = path.resolve('store', file);
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${profile}`,
    '--window-size=540,960', '--force-device-scale-factor=2',
    `--virtual-time-budget=${wait}`, `--screenshot=${out}`, `${BASE}/${query}`,
  ], { stdio: 'ignore' });
  console.log(`store/${file}`);
}

// 그래픽 이미지 1024×500
const icon = fs.readFileSync('web/icons/icon.svg', 'utf8').replace(/<\/?svg[^>]*>/g, '').replace('<rect width="512" height="512" rx="112" fill="#0b1220"/>', '');
const feature = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
  <rect width="1024" height="500" fill="#0b1220"/>
  <g transform="translate(90,90) scale(0.62)">${icon}</g>
  <text x="440" y="250" font-family="Malgun Gothic, Noto Sans KR, sans-serif" font-size="120" font-weight="900" fill="#e8eefc">날래</text>
  <text x="446" y="322" font-family="Malgun Gothic, Noto Sans KR, sans-serif" font-size="40" fill="#8a9bbd">나와 동네를 잇다</text>
</svg>`;
await sharp(Buffer.from(feature)).png().toFile('store/feature-1024x500.png');
console.log('store/feature-1024x500.png');

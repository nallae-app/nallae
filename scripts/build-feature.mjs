// Play 스토어 그래픽 이미지(1024×500): 왼쪽 아이콘·이름·슬로건, 오른쪽 휴대폰 틀 안에 실제 앱 화면.
// 먼저 node scripts/screenshots.mjs 로 store/screenshot-2-region.png 를 만든다.
// 사용: node scripts/build-feature.mjs [스크린샷 경로]
import fs from 'node:fs';
import sharp from 'sharp';

const shot = process.argv[2] || 'store/screenshot-2-region.png';
const W = 1024, H = 500;
const PAPER = '#F7F7F2', TEAL = '#176B60', INK = '#182C30', MUTED = '#53666B';

// 휴대폰: 화면 비율 9:16, 위쪽만 보이게 아래를 잘라 그래픽 밖으로 흘려보낸다
const phoneW = 300, screenW = phoneW - 24, screenH = Math.round((screenW * 16) / 9);
const phoneX = 640, phoneY = 56;
const screen = await sharp(shot).resize(screenW, screenH).png().toBuffer();
const radius = 34;
const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${screenW}" height="${screenH}"><rect width="${screenW}" height="${screenH}" rx="${radius - 10}" fill="#fff"/></svg>`);
const roundedScreen = await sharp(screen).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();

const icon = fs.readFileSync('web/icons/icon.svg', 'utf8').replace(/<\/?svg[^>]*>/g, '');
const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <g fill="none" stroke="${TEAL}" opacity=".10" stroke-width="2">
    <circle cx="${phoneX + phoneW / 2}" cy="250" r="190"/><circle cx="${phoneX + phoneW / 2}" cy="250" r="270"/><circle cx="${phoneX + phoneW / 2}" cy="250" r="350"/>
  </g>
  <g transform="translate(84,92) scale(0.14)">${icon}</g>
  <text x="84" y="268" font-family="Pretendard, Malgun Gothic, sans-serif" font-size="76" font-weight="700" fill="${INK}">날래</text>
  <text x="88" y="318" font-family="Pretendard, Malgun Gothic, sans-serif" font-size="28" fill="${MUTED}">동네 소식, 날래 왔다오</text>
  <text x="88" y="378" font-family="Pretendard, Malgun Gothic, sans-serif" font-size="20" fill="${MUTED}">재난문자·기상특보가 오면 지도에서 우리 동네가 반짝여요</text>
  <rect x="${phoneX}" y="${phoneY}" width="${phoneW}" height="${screenH + 24}" rx="${radius}" fill="${INK}"/>
  <rect x="${phoneX + phoneW / 2 - 28}" y="${phoneY + 6}" width="56" height="6" rx="3" fill="#2E4448"/>
</svg>`);

await sharp(bg)
  .composite([{ input: roundedScreen, left: phoneX + 12, top: phoneY + 12 }])
  .resize(W, H, { position: 'top' })
  .png()
  .toFile('store/feature-1024x500.png');
console.log('store/feature-1024x500.png');

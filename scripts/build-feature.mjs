// Play 스토어 그래픽 이미지(1024×500): 왼쪽 아이콘·이름·슬로건, 오른쪽 휴대폰 틀 안에 실제 앱 화면.
// 먼저 node scripts/screenshots.mjs 로 store/screenshot-2-region.png 를 만든다.
// 사용: node scripts/build-feature.mjs [스크린샷 경로]
import sharp from 'sharp';

const shot = process.argv[2] || 'store/screenshot-2-region.png';
const W = 1024, H = 500;
const PAPER = '#FFF7E8', TEAL = '#A93C00', INK = '#0B1B33', MUTED = '#53666B';

// 휴대폰: 화면 비율 9:16, 위쪽만 보이게 아래를 잘라 그래픽 밖으로 흘려보낸다
const phoneW = 300, screenW = phoneW - 24, screenH = Math.round((screenW * 16) / 9);
const phoneX = 640, phoneY = 56;
const screen = await sharp(shot).resize(screenW, screenH).png().toBuffer();
const radius = 34;
const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${screenW}" height="${screenH}"><rect width="${screenW}" height="${screenH}" rx="${radius - 10}" fill="#fff"/></svg>`);
const roundedScreen = await sharp(screen).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();

const icon = await sharp('web/icons/icon-512.png').resize(96, 96, { fit: 'contain' }).png().toBuffer();
const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <g fill="none" stroke="${TEAL}" opacity=".10" stroke-width="2">
    <circle cx="${phoneX + phoneW / 2}" cy="250" r="190"/><circle cx="${phoneX + phoneW / 2}" cy="250" r="270"/><circle cx="${phoneX + phoneW / 2}" cy="250" r="350"/>
  </g>
  <text x="84" y="268" font-family="Pretendard, Malgun Gothic, sans-serif" font-size="76" font-weight="700" fill="${INK}">지삐</text>
  <text x="88" y="318" font-family="Pretendard, Malgun Gothic, sans-serif" font-size="28" fill="${MUTED}">오늘 어디 갈지, 지삐 알지.</text>
  <text x="88" y="378" font-family="Pretendard, Malgun Gothic, sans-serif" font-size="20" fill="${MUTED}">가까운 맛집·놀거리·데이트 코스를</text>
  <text x="88" y="408" font-family="Pretendard, Malgun Gothic, sans-serif" font-size="20" fill="${MUTED}">지도에서 고르고 저장해요</text>
  <rect x="${phoneX}" y="${phoneY}" width="${phoneW}" height="${screenH + 24}" rx="${radius}" fill="${INK}"/>
  <rect x="${phoneX + phoneW / 2 - 28}" y="${phoneY + 6}" width="56" height="6" rx="3" fill="#2E4448"/>
</svg>`);

await sharp(bg)
  .composite([{ input: icon, left: 84, top: 80 }, { input: roundedScreen, left: phoneX + 12, top: phoneY + 12 }])
  .resize(W, H, { position: 'top' })
  .png()
  .toFile('store/feature-1024x500.png');
console.log('store/feature-1024x500.png');

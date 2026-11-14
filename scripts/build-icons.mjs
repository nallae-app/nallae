// 승인 PNG에서 설치 아이콘·스토어 아이콘을 만든다. OS용은 불투명 정사각형,
// 헤더·파비콘은 투명 심벌이며, 글자를 폰트로 다시 그리지 않는다.
import fs from 'node:fs';
import sharp from 'sharp';
import './apply-logo.mjs';
import { iconSvg } from './logo-mark.mjs';
import { installIcon } from './lib/install-icon.mjs';


const jobs = [
  ['store/android-icons/drawable-nodpi/ic_launcher_monochrome.png', Buffer.from(iconSvg({size:432,scale:.46,rx:0,bg:'none',colors:{mono:true}})), 432, 432],
];
// 설치·스토어용은 불투명 full-bleed. 원본 추출 자산·헤더 심벌은 그대로 둔다.
for (const [out, size, options] of [
  ['web/icons/icon-192.png', 192, {}],
  ['web/icons/icon-512.png', 512, {}],
  ['web/icons/icon-dark-512.png', 512, { dark: true }],
  ['web/icons/apple-touch-icon-v2.png', 180, {}],
  ['web/icons/maskable-512.png', 512, { maskable: true }],
  ['store/icon-512.png', 512, {}],
  // Android 108dp 레이어: 66dp 안전 원 안에 승인 그림 전체를 두고 배경은 끝까지 채운다.
  ['store/android-icons/drawable-nodpi/ic_launcher_foreground.png', 432, { canvasSize: 704 }],
  ['store/android-icons/drawable-night-nodpi/ic_launcher_foreground.png', 432, { canvasSize: 704, dark: true }],
]) {
  fs.mkdirSync(out.slice(0, out.lastIndexOf('/')), { recursive: true });
  fs.writeFileSync(out, await installIcon(`scripts/assets/jippi/final/app-${options.dark ? 'dark' : 'light'}.png`, { size, ...options }));
  console.log(out);
}
// 스토어 그래픽 이미지는 실제 앱 화면을 넣는 scripts/build-feature.mjs 가 만든다 (작업자료/스토어/feature.svg는 화면 없는 대안 시안)

fs.mkdirSync('store', { recursive: true });
for (const [out, src, w, h] of jobs) {
  fs.mkdirSync(out.slice(0, out.lastIndexOf('/')), { recursive: true });
  let img = sharp(src, { density: 300 }).resize(w, h);
  if (out === 'store/icon-512.png') img = img.flatten({ background: '#FFF7E8' });
  await img.png().toFile(out);
  console.log(out);
}

// 상단·파비콘은 작은 핀·지도 시안을 쓴다. 큰 앱 아이콘의 글자를 작게 줄이지 않는다.
for (const [out, name] of [['web/icons/logo-header.png', 'symbol-light.png'], ['web/icons/logo-header-dark.png', 'symbol-dark.png']]) {
  await sharp(`scripts/assets/jippi/final/${name}`)
    .resize({ width: 144 })
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(out);
}
for (const theme of ['light','dark']) {
  for (const size of [32,192]) await sharp(`scripts/assets/jippi/final/symbol-${theme}.png`).resize(size).png().toFile(`web/icons/favicon-${theme}-${size}.png`);
}

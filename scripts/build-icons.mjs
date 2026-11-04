// 아이콘·스토어 그래픽 PNG 만들기
//   web/icons/icon.svg           → icon-192.png, icon-512.png (PWA), store/icon-512.png (Play 스토어)
//   web/icons/icon-maskable.svg  → maskable-512.png (안드로이드 마스크형). 없으면 icon.svg를 쓴다.
// 글자는 Windows 폰트(Malgun Gothic)로 래스터화된다.
import fs from 'node:fs';
import sharp from 'sharp';
import './apply-logo.mjs';
import { iconSvg } from './logo-mark.mjs';

const icon = fs.readFileSync('web/icons/icon.svg');
const maskable = fs.existsSync('web/icons/icon-maskable.svg') ? fs.readFileSync('web/icons/icon-maskable.svg') : icon;

const jobs = [
  ['web/icons/icon-192.png', icon, 192, 192],
  ['web/icons/icon-512.png', icon, 512, 512],
  ['web/icons/icon-dark-512.png', fs.readFileSync('web/icons/icon-dark.svg'), 512, 512],
  ['web/icons/maskable-512.png', maskable, 512, 512],
  // Play 스토어 아이콘은 스토어가 모서리를 둥글게 깎으므로 꽉 찬 마스크형을 쓴다
  ['store/icon-512.png', maskable, 512, 512],
  ['store/android-icons/drawable-nodpi/ic_launcher_foreground.png', Buffer.from(iconSvg({size:432,scale:.46,rx:0,bg:'none'})), 432, 432],
  ['store/android-icons/drawable-night-nodpi/ic_launcher_foreground.png', Buffer.from(iconSvg({size:432,scale:.46,rx:0,bg:'none',colors:{dark:true}})), 432, 432],
  ['store/android-icons/drawable-nodpi/ic_launcher_monochrome.png', Buffer.from(iconSvg({size:432,scale:.46,rx:0,bg:'none',colors:{mono:true}})), 432, 432],
];
// 스토어 그래픽 이미지는 실제 앱 화면을 넣는 scripts/build-feature.mjs 가 만든다 (store/feature.svg는 화면 없는 대안 시안)

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

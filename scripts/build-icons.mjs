// 아이콘·스토어 그래픽 PNG 만들기
//   web/icons/icon.svg           → icon-192.png, icon-512.png (PWA), store/icon-512.png (Play 스토어)
//   web/icons/icon-maskable.svg  → maskable-512.png (안드로이드 마스크형). 없으면 icon.svg를 쓴다.
// 글자는 Windows 폰트(Malgun Gothic)로 래스터화된다.
import fs from 'node:fs';
import sharp from 'sharp';

const icon = fs.readFileSync('web/icons/icon.svg');
const maskable = fs.existsSync('web/icons/icon-maskable.svg') ? fs.readFileSync('web/icons/icon-maskable.svg') : icon;

const jobs = [
  ['web/icons/icon-192.png', icon, 192, 192],
  ['web/icons/icon-512.png', icon, 512, 512],
  ['web/icons/maskable-512.png', maskable, 512, 512],
  // Play 스토어 아이콘은 스토어가 모서리를 둥글게 깎으므로 꽉 찬 마스크형을 쓴다
  ['store/icon-512.png', maskable, 512, 512],
];
// 스토어 그래픽 이미지는 실제 앱 화면을 넣는 scripts/build-feature.mjs 가 만든다 (store/feature.svg는 화면 없는 대안 시안)

fs.mkdirSync('store', { recursive: true });
for (const [out, src, w, h] of jobs) {
  let img = sharp(src, { density: 300 }).resize(w, h);
  if (out.startsWith('store/')) img = img.flatten({ background: '#F7F7F2' }); // 스토어 이미지는 투명 금지
  await img.png().toFile(out);
  console.log(out);
}

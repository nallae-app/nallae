// web/icons/icon.svg → PNG 아이콘들 (PWA·Play 스토어용)
import fs from 'node:fs';
import sharp from 'sharp';

const svg = fs.readFileSync('web/icons/icon.svg');
// 마스크형 아이콘: 둥근 모서리 없이 꽉 채우고, 안쪽 80% 안전 영역에 로고를 둔다
const maskable = Buffer.from(svg.toString()
  .replace('rx="112"', 'rx="0"')
  .replace('<svg ', '<svg ')
  .replace(/<circle cx="256" cy="256" r="(\d+)"/g, (m, r) => `<circle cx="256" cy="256" r="${Math.round(r * 0.78)}"`)
  .replace(/stroke-width="(\d+)"/g, (m, w) => `stroke-width="${Math.round(w * 0.78)}"`));

const jobs = [
  ['web/icons/icon-192.png', svg, 192],
  ['web/icons/icon-512.png', svg, 512],
  ['web/icons/maskable-512.png', maskable, 512],
  ['store/icon-512.png', maskable, 512], // Play 스토어 아이콘(512x512, 모서리는 스토어가 둥글게 처리)
];
fs.mkdirSync('store', { recursive: true });
for (const [out, src, size] of jobs) {
  await sharp(src, { density: 384 }).resize(size, size).png().toFile(out);
  console.log(out);
}

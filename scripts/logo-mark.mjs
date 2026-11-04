// 확정 지삐 시안의 실제 픽셀을 사용한다. 기존 날래 원본은 이력 보존용으로 남긴다.
import fs from 'node:fs';
export const MARK_BOX = { x:0, y:0, w:512, h:512 };
export const ON_DARK = { dark: true };
export function markSvg({ dark = false, mono = false } = {}) {
  // 단색 아이콘도 원본 알파를 사용한다. 임의 SVG 도형으로 대체하지 않는다.
  const name=mono?'symbol-mono':`app-${dark?'dark':'light'}`;
  const source=fs.readFileSync(new URL(`./assets/jippi/final/${name}.png`,import.meta.url)).toString('base64');
  return `<image width="512" height="512" href="data:image/png;base64,${source}"/>`;
}
export function iconSvg({size = 512, scale = 1, rx = 112, bg = 'none', colors = {}} = {}) {
  const k = size * scale / MARK_BOX.w;
  const tx = size / 2 - (MARK_BOX.x + MARK_BOX.w / 2) * k;
  const ty = size / 2 - (MARK_BOX.y + MARK_BOX.h / 2) * k;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${rx}" fill="${bg}"/><g transform="translate(${tx} ${ty}) scale(${k})">${markSvg(colors)}</g></svg>`;
}

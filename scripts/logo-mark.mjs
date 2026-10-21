// 확정된 투명 PNG를 내장한다. 화면 크기에서 배경 제거 필터를 실행하지 않는다.
import fs from 'node:fs';
export const MARK_BOX = { x: 125, y: 175, w: 990, h: 910 };
export const ON_DARK = { dark: true };
export function markSvg({ dark = false, mono = false } = {}) {
  const name = mono ? 'logo-cutout-mono.png' : dark ? 'logo-cutout-dark.png' : 'logo-cutout.png';
  const source = fs.readFileSync(new URL(`./assets/${name}`, import.meta.url)).toString('base64');
  return `<image width="1254" height="1254" href="data:image/png;base64,${source}"/>`;
}
export function iconSvg({size = 512, scale = .80, rx = 112, bg = '#FAF9F6', colors = {}} = {}) {
  const k = size * scale / MARK_BOX.w;
  const tx = size / 2 - (MARK_BOX.x + MARK_BOX.w / 2) * k;
  const ty = size / 2 - (MARK_BOX.y + MARK_BOX.h / 2) * k;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${rx}" fill="${bg}"/><g transform="translate(${tx} ${ty}) scale(${k})">${markSvg(colors)}</g></svg>`;
}

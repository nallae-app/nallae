// 확정 지삐 시안의 실제 픽셀을 사용한다. 기존 날래 원본은 이력 보존용으로 남긴다.
import fs from 'node:fs';
export const MARK_BOX = { x:0, y:0, w:512, h:512 };
export const ON_DARK = { dark: true };
export function markSvg({ dark = false, mono = false } = {}) {
  // Android 테마 아이콘 전용: 작은 아이콘의 핀·지도 단색 실루엣.
  if (mono) return '<g fill="black"><path fill-rule="evenodd" d="M256 75c-52 0-87 37-87 81 0 56 87 145 87 145s87-89 87-145c0-44-35-81-87-81zm0 43a36 36 0 1 1 0 72 36 36 0 0 1 0-72z"/><path d="m105 344 93-35 116 32 93-32 37 94-94 35-117-32-94 32z"/></g>';
  const source=fs.readFileSync(new URL(`./assets/jippi/large-${dark?'dark':'light'}.png`,import.meta.url)).toString('base64');
  return `<image width="512" height="512" href="data:image/png;base64,${source}"/>`;
}
export function iconSvg({size = 512, scale = 1, rx = 112, bg = '#FFF7E8', colors = {}} = {}) {
  const k = size * scale / MARK_BOX.w;
  const tx = size / 2 - (MARK_BOX.x + MARK_BOX.w / 2) * k;
  const ty = size / 2 - (MARK_BOX.y + MARK_BOX.h / 2) * k;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${rx}" fill="${bg}"/><g transform="translate(${tx} ${ty}) scale(${k})">${markSvg(colors)}</g></svg>`;
}

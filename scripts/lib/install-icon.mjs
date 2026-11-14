// OS가 설치 아이콘의 모서리를 자른다. 승인 타일 바깥 매트·그림자를 제거하고
// 타일 안쪽 배경을 끝까지 연장한다. 글자·핀·지도의 위치와 비율은 보존한다.
import sharp from 'sharp';

export async function installIcon(source, { size = 512, maskable = false, dark = false, canvasSize } = {}) {
  const { data, info } = await sharp(source)
    .flatten({ background: dark ? '#0B1B33' : '#FFF7E8' }).removeAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== 512 || info.height !== 512) throw new Error('Expected approved 512px artwork');
  // 경계의 작은 질감이 바깥으로 방사형 줄무늬처럼 늘어나지 않게 배경만 평활화.
  const background = await sharp(data, { raw: info }).blur(8).raw().toBuffer();
  const side = canvasSize ?? (maskable ? 640 : 512), offset = (side - 512) / 2;
  if (!Number.isInteger(side) || side < 512 || side > 1024 || side % 2) throw new Error('Invalid icon canvas');
  const pixels = Buffer.alloc(side * side * 3);
  // 타일 테두리 안쪽, 모든 글자·심벌 바깥의 배경 경계.
  const left = 36, right = 476, top = 46, bottom = 458, radius = 92;
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    let sx = x - offset, sy = y - offset;
    const cx = Math.max(left + radius, Math.min(right - radius, sx));
    const cy = Math.max(top + radius, Math.min(bottom - radius, sy));
    const dx = sx - cx, dy = sy - cy, distance = Math.hypot(dx, dy);
    const blend = Math.max(0, Math.min(1, (distance - radius + 12) / 12));
    if (distance > radius) {
      sx = cx + dx * radius / distance;
      sy = cy + dy * radius / distance;
    }
    const from = (Math.round(sy) * 512 + Math.round(sx)) * 3;
    const to = (y * side + x) * 3;
    for (let c = 0; c < 3; c++) pixels[to + c] = Math.round(data[from + c] * (1 - blend) + background[from + c] * blend);
  }
  return sharp(pixels, { raw: { width: side, height: side, channels: 3 } })
    .resize(size, size).toColourspace('srgb').png().toBuffer();
}

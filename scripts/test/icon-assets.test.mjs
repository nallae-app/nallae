import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';

const root = new URL('../../', import.meta.url);
const read = p => fs.readFile(new URL(p, root));

test('iOS 홈 화면은 전용 180px 불투명 PNG와 연결한다', async () => {
  const html = await read('web/index.html');
  assert.match(html.toString(), /rel="apple-touch-icon" sizes="180x180" href="icons\/apple-touch-icon-jippi-v1\.png"/);
  const png = await read('web/icons/apple-touch-icon-jippi-v1.png');
  const meta = await sharp(png).metadata();
  assert.equal(meta.width, 180);
  assert.equal(meta.height, 180);
  assert.equal(meta.format, 'png');
  const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4) assert.equal(data[i], 255, 'iOS 설치 아이콘에 투명 픽셀이 남아 있음');
  assert.match((await read('web/sw.js')).toString(), /icons\/apple-touch-icon-jippi-v1\.png/);
});

test('설치용 PWA·Play 아이콘은 모두 불투명하고 헤더 심벌은 투명도를 유지한다', async () => {
  for (const file of ['icon-192.png', 'icon-512.png', 'icon-dark-512.png', 'maskable-512.png']) {
    const { data } = await sharp(await read('web/icons/' + file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 3; i < data.length; i += 4) assert.equal(data[i], 255, file);
  }
  const store = await sharp(await read('store/icon-512.png')).ensureAlpha().stats();
  assert.equal(store.channels[3]?.min ?? 255, 255);
  for (const file of ['logo-header.png', 'logo-header-dark.png']) {
    const stats = await sharp(await read('web/icons/' + file)).ensureAlpha().stats();
    assert.equal(stats.channels[3].min, 0, file + ': 투명 심벌을 설치용 배경으로 덮으면 안 됨');
  }
});

test('Android 중요 표식과 단색 마스크는 66dp 안전 원 안에 둔다', async () => {
  const variants = [
    ['drawable-nodpi/ic_launcher_foreground.png', 'light'],
    ['drawable-night-nodpi/ic_launcher_foreground.png', 'dark'],
    ['drawable-nodpi/ic_launcher_monochrome.png', 'mono'],
  ];
  for (const [file, theme] of variants) {
    const { data, info } = await sharp(await read('store/android-icons/' + file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 432);
    assert.equal(info.height, 432);
    let coreCount = 0;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4;
      const [r, g, b, a] = data.subarray(i, i + 4);
      if (a < 128) continue;
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      const lightness = (r + g + b) / 3;
      // 확정된 팔레트의 글자·핀·광선·지도 핵심 픽셀. 장식 타일·약한 그림자는 제외한다.
      const core = theme === 'mono' || chroma > 70 || (theme === 'light' ? lightness < 130 : lightness > 170);
      if (!core) continue;
      coreCount++;
      assert.ok(Math.hypot(x + .5 - 216, y + .5 - 216) <= 132, file + ': 중요 표식이 안전 원을 벗어남');
    }
    assert.ok(coreCount > 1000, file + ': 표식 검사가 빈 그림을 통과시키면 안 됨');
  }
});

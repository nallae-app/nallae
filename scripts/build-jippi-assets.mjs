// 사용자가 선택한 실제 이미지에서 네 가지 확정 시안을 추출한다.
import fs from 'node:fs/promises';
import sharp from 'sharp';
const dir='scripts/assets/jippi';
await fs.mkdir(dir,{recursive:true});
for(const [name,box,background] of [
  ['large-dark',{left:50,top:38,width:418,height:410},'#0B1B33'],
  ['large-light',{left:490,top:38,width:414,height:410},'#FFF7E8'],
  ['small-dark',{left:59,top:1127,width:101,height:95},'#0B1B33'],
  ['small-light',{left:178,top:1130,width:98,height:90},'#FFF7E8'],
]) {
  const size=name.startsWith('large')?512:144;
  const source=await sharp(`${dir}/selected-sheet.png`).extract(box).resize(size,size,{fit:'contain',background}).png().toBuffer();
  // 비교판 바깥 여백만 마스킹한다. 선택한 도형·색·글자는 보존한다.
  const mask=Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size*.26}" fill="white"/></svg>`);
  await sharp(source).composite([{input:mask,blend:'dest-in'}]).png().toFile(`${dir}/${name}.png`);
}
console.log('Extracted four approved Jippi variants.');

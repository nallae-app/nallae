// GPT 제작 후 사용자가 최종 승인한 PNG에서만 자산을 추출한다. 도형을 다시 그리지 않는다.
import fs from 'node:fs/promises';
import sharp from 'sharp';
const dir='scripts/assets/jippi/final';
await fs.mkdir(dir,{recursive:true});
for(const [name,box] of [
  ['app-dark',{left:179,top:470,width:560,height:530}],
  ['app-light',{left:809,top:470,width:560,height:530}],
  ['symbol-dark',{left:239,top:54,width:430,height:390}],
  ['symbol-light',{left:895,top:54,width:430,height:390}],
]) {
  const {data,info}=await sharp(`${dir}/approved-gpt.png`).extract(box).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  // 투명 배경의 1/255·2/255 알파 잡음만 제거한다. RGB·도형·가까운 그림자는 그대로 둔다.
  for(let i=3;i<data.length;i+=4)if(data[i]<=2)data[i]=0;
  const size=512;
  await sharp(data,{raw:info}).resize(size,size,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toFile(`${dir}/${name}.png`);
}
const mono=await sharp(`${dir}/symbol-light.png`).ensureAlpha().raw().toBuffer({resolveWithObject:true});
for(let i=0;i<mono.data.length;i+=4)mono.data[i]=mono.data[i+1]=mono.data[i+2]=0;
await sharp(mono.data,{raw:mono.info}).png().toFile(`${dir}/symbol-mono.png`);
console.log('Extracted four approved Jippi variants.');

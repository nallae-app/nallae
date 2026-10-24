import fs from 'node:fs';
import {downloadStandard} from './lib/standard-download.mjs';
fs.mkdirSync('output/discovery',{recursive:true});
for(const [pk,name] of [['15021141','attractions'],['15012890','parks']]) {
  const result=await downloadStandard(pk);fs.writeFileSync('output/discovery/'+name+'-raw.json',JSON.stringify(result));console.log(name+': '+result.rows.length);
}

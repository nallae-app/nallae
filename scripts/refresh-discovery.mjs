import fs from 'node:fs';
import {fetchTourism} from './sources/tourism.mjs';
fs.mkdirSync('output/discovery',{recursive:true});
try {
  const result=await fetchTourism({key:process.env.DATA_GO_KR_KEY});
  if(result.skipped)throw Error(result.skipped);
  const data={...result,updated:new Date().toISOString()};
  fs.writeFileSync('output/discovery/tourism.json',JSON.stringify(data));
  console.log(JSON.stringify({complete:data.complete,totals:data.totals,items:data.items.length,withCoordinates:data.items.filter(x=>Number.isFinite(x.lat)).length}));
}catch(e){console.log('관광정보: '+e.message);process.exitCode=1;}

import {createFuelService,RADII,PRODUCTS} from '../lib/nearby-fuel.js';
let service;
export default async function handler(req,res) {
  res.setHeader('Access-Control-Allow-Origin','https://nallae-app.github.io');res.setHeader('Vary','Origin');
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
  if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','POST, GET, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');return res.status(204).end();}
  if(req.method==='GET'&&req.query.health==='1')return res.status(200).json({service:'nearby-fuel',configured:!!process.env.OPINET_KEY,radii:RADII,products:PRODUCTS});
  if(req.method!=='POST')return res.status(405).json({error:'method'});
  if(!process.env.OPINET_KEY)return res.status(503).json({error:'not-configured'});
  let body=req.body;try{if(typeof body==='string')body=JSON.parse(body);}catch{return res.status(400).json({error:'invalid-query'});}
  const lat=Number(body?.lat),lon=Number(body?.lon),radius=Number(body?.radius),product=body?.product;
  if(!Number.isFinite(lat)||lat<33||lat>39||!Number.isFinite(lon)||lon<124||lon>132||!RADII.includes(radius)||!PRODUCTS.includes(product))return res.status(400).json({error:'invalid-query'});
  if(req.headers.origin&&req.headers.origin!=='https://nallae-app.github.io')return res.status(403).json({error:'origin'});
  service??=createFuelService({key:process.env.OPINET_KEY});
  try{return res.status(200).json(await service({lat,lon,radius,product}));}
  catch(e){const kind=['quota','empty-response','not-configured'].includes(e.message)?e.message:'upstream';return res.status(kind==='quota'?429:503).json({error:kind});}
}

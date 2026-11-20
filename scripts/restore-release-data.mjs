// 웹 변경 배포용: 직전 정상 수집 산출물만 복원하고 수집 시각은 보존한다.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const files = ['news.json', 'weather.json', 'forecast.json', 'festivals.json', 'fuel.json', 'parking-live.json', 'er.json'];
const folders = ['food', 'parking', 'pharmacy'];
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const dated = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
function medical(root) {
  const index = json(path.join(root, 'pharmacy/index.json')), er = json(path.join(root, 'er.json'));
  for (const data of [index, er]) {
    if (data.complete !== true || data.fixture || !dated(data.updated) || !data.counts || !Number.isInteger(data.total) || data.total < 1) throw Error('Incomplete medical dataset');
    if (Object.values(data.counts).some(n => !Number.isInteger(n) || n < 0) || Object.values(data.counts).reduce((a,b)=>a+b,0) !== data.total) throw Error('Medical counts mismatch');
  }
  for (const [code, count] of Object.entries(index.counts)) {
    if (!/^\d{5}$/.test(code)) throw Error('Invalid medical region');
    if (!count) continue;
    const region = json(path.join(root, 'pharmacy', code + '.json'));
    if (region.fixture || region.updated !== index.updated || !Array.isArray(region.items) || region.items.length !== count) throw Error('Pharmacy generation mismatch');
  }
  if (!Array.isArray(er.items) || er.items.length !== er.total) throw Error('Emergency directory mismatch');
  const counts = {};
  for (const item of er.items) counts[item.sgg] = (counts[item.sgg] || 0) + 1;
  if (Object.keys(counts).some(code => er.counts[code] !== counts[code]) || Object.entries(er.counts).some(([code,n]) => n !== (counts[code] || 0))) throw Error('Emergency region mismatch');
}
export function restoreReleaseData(from, to, now = new Date()) {
  medical(from);
  for (const name of ['weather.json', 'forecast.json']) {
    const data = json(path.join(from, name));
    if (data.fixture || !dated(data.updated) || !dated(data.base) || !data.sgg || Array.isArray(data.sgg) || !Object.keys(data.sgg).length || Object.keys(data.sgg).some(code => !/^\d{5}$/.test(code))) throw Error('Invalid retained weather dataset');
  }
  const news = json(path.join(from, 'news.json'));
  if (!dated(news.updated) || !Array.isArray(news.items) || !news.sources) throw Error('Invalid news dataset');
  const retained = news.items.filter(item => {
    const time = Date.parse(item.time), age = now.getTime() - time;
    const missing = item.src === 'sms' && item.cat === '사건' && /실종|찾습니다|배회/.test(`${item.title || ''} ${item.body || ''}`);
    return Number.isFinite(time) && age >= -3600000 && age <= (missing ? 24 : 72) * 3600000;
  });
  const copy = relative => {
    const source = path.join(from, relative), dest = path.join(to, relative);
    if (!fs.existsSync(source)) return;
    const stat = fs.lstatSync(source);
    if (!stat.isFile() || stat.isSymbolicLink()) throw Error('Invalid retained data file');
    const data = json(source);
    if (!data || typeof data !== 'object' || data.fixture) throw Error('Invalid retained dataset');
    // 새 checkout의 파일을 덮지 않는다. 정적 카탈로그를 과거로 되돌리지 않는다.
    if (fs.existsSync(dest)) throw Error('Retained data destination already exists');
    fs.mkdirSync(path.dirname(dest), {recursive:true});
    fs.writeFileSync(dest, relative === 'news.json' ? JSON.stringify({...news, items:retained}) : fs.readFileSync(source));
  };
  for (const name of files) copy(name);
  for (const folder of folders) {
    const directory = path.join(from, folder);
    if (!fs.existsSync(directory)) continue;
    if (!fs.lstatSync(directory).isDirectory() || fs.lstatSync(directory).isSymbolicLink()) throw Error('Invalid retained data directory');
    for (const name of fs.readdirSync(directory)) {
      if (!/^[\w-]+\.json$/.test(name)) throw Error('Unexpected retained data entry');
      copy(path.join(folder, name));
    }
  }
  return {previousUpdated:news.updated, expiredNewsRemoved:news.items.length-retained.length};
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(JSON.stringify(restoreReleaseData(process.argv[2], process.argv[3])));
}

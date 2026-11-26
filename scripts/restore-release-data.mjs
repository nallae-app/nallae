// 웹 변경 배포용: 직전 정상 수집 산출물만 복원하고 수집 시각은 보존한다.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {scopedNews,sanitizePublishedData} from './lib/published-scope.mjs';

const files = ['news.json', 'weather.json', 'forecast.json', 'festivals.json', 'fuel.json', 'parking-live.json'];
const folders = ['food', 'parking'];
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const dated = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
export function restoreReleaseData(from, to, now = new Date()) {
  for (const name of ['weather.json', 'forecast.json']) {
    const data = json(path.join(from, name));
    if (data.fixture || !dated(data.updated) || !dated(data.base) || !data.sgg || Array.isArray(data.sgg) || !Object.keys(data.sgg).length || Object.keys(data.sgg).some(code => !/^\d{5}$/.test(code))) throw Error('Invalid retained weather dataset');
  }
  const news = json(path.join(from, 'news.json'));
  if (!dated(news.updated) || !Array.isArray(news.items) || !news.sources) throw Error('Invalid news dataset');
  const retained = scopedNews(news,{now});
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
    fs.writeFileSync(dest, relative === 'news.json' ? JSON.stringify(retained) : fs.readFileSync(source));
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
  sanitizePublishedData(to,{now});
  return {previousUpdated:news.updated, excludedNewsRemoved:news.items.length-retained.items.length};
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(JSON.stringify(restoreReleaseData(process.argv[2], process.argv[3])));
}

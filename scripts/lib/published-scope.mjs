import fs from 'node:fs';
import path from 'node:path';
import '../../web/release-scope.js';

export const CONTENT_SCOPE = globalThis.JippiReleaseScope.version;
export const isAllowedNewsItem = globalThis.JippiReleaseScope.isAllowedNewsItem;
export function scopedNews(data, {now = new Date(), requireScope = true} = {}) {
  if (!data || !Array.isArray(data.items)) throw Error('Invalid news dataset');
  const items = data.items.filter(item => {
    const age = now.getTime() - Date.parse(item?.time);
    return isAllowedNewsItem(item) && (!requireScope || item.contentScope === CONTENT_SCOPE) && Number.isFinite(age) && age >= -3600000 && age <= 72 * 3600000;
  });
  // 과거 의료·재난 출처 상태와 미검증 원문을 현재 상태로 이어 쓰지 않는다.
  return {updated:data.updated, contentScope:CONTENT_SCOPE, sources:data.contentScope === CONTENT_SCOPE && data.sources?.brief ? {brief:data.sources.brief} : {}, items};
}
export function sanitizePublishedData(directory, {now = new Date()} = {}) {
  for (const name of fs.readdirSync(directory)) {
    if (/^(?:demo-)?(?:er\.json|pharmacy(?:\.json)?|earthquakes?\.json|warnings?\.json|disaster.*\.json|sms\.json)$/i.test(name)) fs.rmSync(path.join(directory,name),{recursive:true,force:true});
  }
  for (const name of ['news.json','demo-news.json']) {
    const file=path.join(directory,name);
    if (!fs.existsSync(file)) continue;
    if (fs.lstatSync(file).isSymbolicLink()) throw Error('Invalid published news file');
    const data=JSON.parse(fs.readFileSync(file,'utf8'));
    fs.writeFileSync(file,JSON.stringify(scopedNews(data,{now})));
  }
  // 이전 버전의 응급 출처를 요구하던 health marker는 복원·서버 경로에서 재사용하지 않는다.
  const healthFile=path.join(directory,'collection-health.json');
  if (fs.existsSync(healthFile)) {
    const health=JSON.parse(fs.readFileSync(healthFile,'utf8'));
    if (health.contentScope !== CONTENT_SCOPE) fs.rmSync(healthFile);
  }
}

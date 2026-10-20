// 정책브리핑 정책뉴스·보도자료 — 문화체육관광부 (data.go.kr 15095335)
// https://www.data.go.kr/data/15095335/openapi.do
// 필요: DATA_GO_KR_KEY (공공데이터포털 회원가입 + 활용신청, 자동승인)
// 지역 이름이 제목에 나오고 공공누리 1유형인 자료만 쓴다. 본문은 싣지 않고 제목과 원문 링크만.
import { findPlacesInText } from '../lib/regions.mjs';
import { classify } from '../lib/classify.mjs';

const ENDPOINT = 'https://apis.data.go.kr/1371000/policyNewsService2/policyNewsList2';

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '').trim()) : '';
};
const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/** "20261020143000", "2026-10-20 14:30:00", "10/20/2026 14:30:00" → ISO (KST). 형식을 모르면 null */
const toIso = (s) => {
  let str = String(s || '').trim();
  const us = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(.*)$/);
  if (us) str = `${us[3]}${us[1].padStart(2, '0')}${us[2].padStart(2, '0')}${us[4]}`;
  const d = str.replace(/\D/g, '');
  if (d.length < 8) return null;
  const p = (a, b) => d.slice(a, b).padEnd(b - a, '0');
  const date = new Date(`${p(0, 4)}-${p(4, 6)}-${p(6, 8)}T${p(8, 10)}:${p(10, 12)}:${p(12, 14)}+09:00`);
  return isNaN(date) ? null : date.toISOString();
};

const isKogl1 = (v) => /^(1|제?1유형|type1|TYPE1)$/i.test(String(v).trim());

export function parse(xml) {
  const items = [];
  for (const m of xml.matchAll(/<NewsItem>([\s\S]*?)<\/NewsItem>/g)) {
    const x = m[1];
    const title = tag(x, 'Title').replace(/<[^>]+>/g, '').trim();
    const kogl = tag(x, 'KoglType');
    if (!title || !isKogl1(kogl)) continue;
    const { sgg, sido } = findPlacesInText(title);
    if (!sgg.length && !sido.length) continue;
    const url = tag(x, 'OriginalUrl');
    items.push({
      id: `brief-${tag(x, 'NewsItemId')}`,
      src: 'brief',
      cat: classify(title),
      title,
      time: toIso(tag(x, 'ApproveDate') || tag(x, 'ModifyDate')),
      sgg, sido,
      source: `정책브리핑 · ${tag(x, 'MinisterCode') || '정부'}`,
      license: '공공누리 1유형',
      url: /^https?:\/\//.test(url) ? url : undefined,
    });
  }
  return items.filter((it) => it.time);
}

export async function fetchItems({ key, since }) {
  if (!key) return { skipped: 'DATA_GO_KR_KEY 없음' };
  const ymd = (d) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
  const now = new Date();
  // 조회 기간은 최대 3일
  const from = new Date(Math.max(since.getTime(), now.getTime() - 2 * 86400e3));
  const url = `${ENDPOINT}?serviceKey=${encodeURIComponent(key)}&startDate=${ymd(from)}&endDate=${ymd(now)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`정책브리핑 HTTP ${res.status}`);
  const xml = await res.text();
  const code = xml.match(/<resultCode>(.*?)<\/resultCode>/)?.[1];
  if (code && !/^0+$/.test(code)) throw new Error(`정책브리핑 오류 ${code} ${xml.match(/<resultMsg>(.*?)<\/resultMsg>/)?.[1] || ''}`);
  return { items: parse(xml) };
}

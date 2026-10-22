// 약국·응급실 화면 검증 (로컬 시험 자료). 먼저: node scripts/make-care-fixture.mjs, tools/serve.ps1
//   node docs/design/review-current/verify-care.mjs [http://localhost:5173/]
// 촬영(shots-care/)과 동작 시험(PASS/FAIL 줄)을 따로 기록한다. 실제 전화·외부 지도는 열지 않는다(href만 확인).
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const base = process.argv[2] || 'http://localhost:5173/';
const out = 'docs/design/review-current/shots-care';
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ok = (name, cond, info = '') => { results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); if (!cond) process.exitCode = 1; };
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
async function open({ width = 375, height = 812, theme = 'light', layer = 'pharmacy', near = '11440', mobile = width < 768, stage = 'full' } = {}) {
  const p = await b.newPage(), errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.setViewport({ width, height, isMobile: mobile, hasTouch: mobile });
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
  await p.evaluateOnNewDocument((layer, stage) => { localStorage.clear(); localStorage.setItem('nallae-mode', 'explore'); localStorage.setItem('nallae-explore-layer', layer); localStorage.setItem('nallae-sheet-stage', stage); }, layer, stage);
  await p.goto(base + '?demo&debug&theme=' + theme + (near ? '&near=' + near : ''), { waitUntil: 'networkidle0' });
  await wait(700);
  return { p, errors };
}
// 사용자가 시·군·구 배율에서 누르는 것과 같게: 그 지역으로 배율을 맞춘 뒤 지역 클릭
const selectRegion = async (p, code) => { await p.evaluate((code) => { const m = window.nallae.munis.find((m) => m.code === code); window.nallae.map.setView(m.layer.getBounds().getCenter(), 11, { animate: false }); m.layer.fire('click'); }, code); await wait(900); };
const feedText = (p) => p.$eval('#feed', (e) => e.innerText);
const toolsText = (p) => p.$eval('.explore-tools', (e) => e.innerText);
try {
  // ---------- 촬영: 3 크기 × 라이트/다크 × 약국/응급실 ----------
  for (const [w, h] of [[375, 812], [768, 1024], [1280, 800]]) for (const theme of ['light', 'dark']) for (const layer of ['pharmacy', 'er']) {
    const { p, errors } = await open({ width: w, height: h, theme, layer });
    await p.screenshot({ path: `${out}/${layer}-${w}x${h}-${theme}.png` });
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    ok(`촬영 ${layer} ${w}x${h} ${theme}`, !errors.length && !overflow, errors.join(',') || (overflow ? '가로 넘침' : ''));
    await p.close();
  }

  // ---------- 동작: 약국 (모바일 라이트, 터치) ----------
  {
    const { p, errors } = await open({});
    const cards = await p.$$eval('.care-card', (es) => es.length);
    ok('약국 마포 카드 4곳', cards === 4, String(cards));
    ok('방문 전 전화 확인 문구', (await toolsText(p)).includes('운영시간이 바뀔 수 있으니 방문 전 전화로 확인하세요.'));
    const all = (await feedText(p)) + (await toolsText(p));
    ok('영업 중 단정 표현 없음', !/영업\s?중|지금 열려|문 열었/.test(all.replace('지금 문을 열었는지', '')));
    ok('전화 tel 링크', await p.$eval('.care-tel', (a) => a.getAttribute('href')) === 'tel:020000001');
    ok('전화 미제공 표시', (await feedText(p)).includes('전화번호 미제공'));
    const route = await p.$eval('[data-care-id="T001"] .food-map', (a) => a.href);
    ok('길찾기는 시설 좌표만', /^https:\/\/map\.kakao\.com\/link\/to\/.+,37\.5563,126\.905$/.test(route), route);
    ok('좌표 없는 곳은 주소 검색', (await p.$eval('[data-care-id="T003"] .food-map', (a) => a.href)).startsWith('https://map.kakao.com/link/search/'));
    ok('긴 이름 2줄 이내', await p.$eval('[data-care-id="T002"] h3', (h) => h.getBoundingClientRect().height <= 50));
    await p.click('[data-care-id="T001"] .care-hours summary');
    const rows = await p.$$eval('[data-care-id="T001"] .care-hours tr', (r) => r.map((x) => x.innerText.replace(/\s+/g, ' ')));
    ok('요일별 8칸(공휴일 포함)', rows.length === 8 && rows[7].startsWith('공휴일'), rows.join(' / '));
    ok('오늘 칸 강조 1개', (await p.$$('[data-care-id="T001"] tr.today')).length === 1);
    ok('밤 표기 원문 그대로', (await feedText(p)).includes('20:00~02:00') || rows.length === 8);
    await p.screenshot({ path: `${out}/action-pharmacy-hours.png` });
    await p.tap('[data-care-filter="holiday"]'); await wait(200);
    ok('공휴일 시간 등록 필터', (await p.$$eval('.care-card', (es) => es.map((e) => e.dataset.careId))).join() === 'T001');
    await p.tap('[data-care-filter=""]'); await wait(200);
    ok('지도 점 표시', (await p.$$('.care-marker.pharmacy')).length >= 1);
    await p.tap('[data-care-map="T001"]'); await wait(700);
    const st = await p.evaluate(() => ({ z: window.nallae.map.getZoom(), c: window.nallae.map.getCenter(), popup: document.querySelector('.leaflet-popup-content')?.innerText || '' }));
    ok('목록→지도 이동·팝업', st.z === 13 && Math.abs(st.c.lat - 37.5563) < 0.002 && st.popup.includes('망원 하늘약국'), JSON.stringify(st).slice(0, 120));
    await p.screenshot({ path: `${out}/action-pharmacy-map-popup.png` });
    await p.tap('[data-care-card="T001"]'); await wait(500);
    ok('지도→목록 이동·포커스', await p.evaluate(() => document.activeElement?.dataset.careMap === 'T001'));
    // 지역: 자료상 0곳(종로) / 지역 파일 실패(강남)
    await selectRegion(p, '11110'); await wait(500);
    const z = await feedText(p);
    ok('자료상 0곳은 기준일과 함께', z.includes('수집한 공식 자료에') && !z.includes('받지 못했'), z.slice(0, 80));
    await selectRegion(p, '11680'); await wait(800);
    const g = await feedText(p);
    ok('지역 파일 실패는 0곳이 아니라 다시 받기', g.includes('받지 못했어요') && !!(await p.$('[data-care-retry]')), g.slice(0, 80));
    await p.screenshot({ path: `${out}/action-pharmacy-region-failed.png` });
    // 모드 전환 회귀
    await selectRegion(p, '11440'); await wait(500);
    await p.click('[data-mode-choice="news"]'); await wait(300);
    ok('소식 모드에서 점 숨김', !(await p.$('.care-marker')));
    await p.click('[data-mode-choice="explore"]'); await wait(500);
    ok('탐험 복귀 시 점 복원', (await p.$$('.care-marker')).length >= 1);
    await p.click('[data-layer="parking"]'); await wait(400);
    ok('다른 분류로 바꾸면 점 숨김', !(await p.$('.care-marker')));
    ok('약국 오류 0', !errors.length, errors.join(','));
    await p.close();
  }

  // ---------- 동작: 응급실 ----------
  {
    const { p, errors } = await open({ layer: 'er' });
    const t = await toolsText(p);
    ok('119 안내와 tel:119 링크(누르지 않음)', t.includes('생명이 위급하면 바로 119') && (await p.$eval('.care-119', (a) => a.getAttribute('href'))) === 'tel:119');
    ok('수용 가능 여부 모름 안내', t.includes('수용 가능 여부와 진료 가능 과목은 이 목록으로 알 수 없어요'));
    const f = await feedText(p);
    ok('응급실 3곳·이름순', (await p.$$eval('.care-card', (es) => es.length)) === 3 && f.includes('이름순'));
    ok('금지 표현 없음', !/즉시 수용|진료 가능합니다|가장 빨리|가장 가까운|추천/.test(f));
    ok('응급실 전화 미제공 표시', f.includes('응급실 전화 미제공'));
    ok('응급실 전화 링크', (await p.$$eval('.care-tel', (a) => a.map((x) => x.getAttribute('href')))).includes('tel:020001191'));
    // 키보드: 지도에서 보기 버튼에 포커스 후 Enter
    await p.focus('[data-care-map="E001"]'); await p.keyboard.press('Enter'); await wait(700);
    ok('키보드 Enter로 지도 이동', (await p.evaluate(() => document.querySelector('.leaflet-popup-content')?.innerText || '')).includes('마포 한빛병원'));
    await p.screenshot({ path: `${out}/action-er-popup.png` });
    ok('응급실 오류 0', !errors.length, errors.join(','));
    await p.close();
  }

  // ---------- 위치 거부: 내 주변 실패해도 지역 선택으로 사용 ----------
  {
    const { p, errors } = await open({ near: '' });
    const ctx = b.defaultBrowserContext();
    await ctx.overridePermissions(new URL(base).origin, []);
    await p.evaluate(() => { navigator.geolocation.getCurrentPosition = (_, fail) => fail({ code: 1, message: 'denied' }); navigator.geolocation.watchPosition = (_, fail) => { fail({ code: 1, message: 'denied' }); return 0; }; });
    ok('지역 미선택 안내', (await feedText(p)).includes('시·군·구를 고르면'));
    await p.click('#btn-locate'); await wait(600);
    await selectRegion(p, '11440'); await wait(800);
    ok('위치 거부 뒤 지역 선택으로 목록', (await p.$$eval('.care-card', (es) => es.length)) === 4);
    ok('위치 거부 오류 0', !errors.length, errors.join(','));
    await p.close();
  }

  // ---------- 오프라인: 지역 파일을 못 받으면 실패 안내 → 온라인 다시 받기 ----------
  {
    const { p, errors } = await open({ near: '' });
    await p.setOfflineMode(true);
    await selectRegion(p, '11440'); await wait(800);
    ok('오프라인 지역 파일 실패 안내', (await feedText(p)).includes('받지 못했어요'));
    await p.setOfflineMode(false);
    await p.evaluate(() => document.querySelector('[data-care-retry]')?.click()); await wait(900);
    ok('다시 받기로 복구', (await p.$$eval('.care-card', (es) => es.length)) === 4);
    ok('오프라인 오류 0', !errors.length, errors.join(','));
    await p.close();
  }

  // ---------- 전체 실패·승인 대기 자료: 분류는 남고 실패 안내·다시 시도·119 ----------
  execFileSync(process.execPath, ['scripts/make-care-fixture.mjs', '--failed']);
  try {
    for (const layer of ['pharmacy', 'er']) {
      const { p, errors } = await open({ layer });
      const chips = await p.$$eval('[data-layer]', (es) => es.map((e) => e.dataset.layer));
      const f = await feedText(p), t = await toolsText(p);
      ok(`${layer} 전체 실패에도 분류 진입`, chips.includes(layer) && (await p.$eval(`[data-layer="${layer}"]`, (e) => e.getAttribute('aria-pressed'))) === 'true');
      ok(`${layer} 실패를 시설 없음으로 표시 안 함`, /승인을 기다리는 중|받지 못했어요/.test(f) && !/0곳|없어요\./.test(f.replace('없다는 뜻은 아니에요', '')), f.slice(0, 90));
      ok(`${layer} 다시 시도 버튼`, !!(await p.$('[data-care-reload]')));
      if (layer === 'er') ok('er 실패에도 119', t.includes('119') && !!(await p.$('.care-119')));
      ok(`${layer} 상태 '받지 못함'`, (await p.$eval('#collection-status', (e) => e.textContent)) === '받지 못함');
      await p.screenshot({ path: `${out}/failed-${layer}-375-light.png` });
      ok(`${layer} 실패 화면 오류 0`, !errors.length, errors.join(','));
      await p.close();
    }
  } finally {
    execFileSync(process.execPath, ['scripts/make-care-fixture.mjs']);
  }

  // ---------- 직전 자료 + 최근 실패: 상단에 바로 보임 ----------
  {
    const idx = JSON.parse(fs.readFileSync('web/data/demo-pharmacy/index.json', 'utf8'));
    const later = new Date(Date.parse(idx.updated) + 3600e3).toISOString();
    fs.writeFileSync('web/data/demo-pharmacy/index.json', JSON.stringify({ ...idx, lastFailure: { at: later, error: '일부만 받음 400/500' } }));
    try {
      const { p, errors } = await open({});
      ok('최근 갱신 실패 상단 노출', (await toolsText(p)).includes('최근 갱신에 실패해'));
      ok('상태 줄 경고', await p.$eval('#collection-alert', (e) => !e.hidden && e.innerText.includes('최근 갱신에 실패')));
      ok('직전 자료는 그대로', (await p.$$eval('.care-card', (es) => es.length)) === 4);
      await p.screenshot({ path: `${out}/stale-pharmacy-375-light.png` });
      ok('직전 자료 화면 오류 0', !errors.length, errors.join(','));
      await p.close();
    } finally {
      fs.writeFileSync('web/data/demo-pharmacy/index.json', JSON.stringify(idx));
    }
  }

  // ---------- 세대가 다른 지역 파일은 쓰지 않음 ----------
  {
    const file = 'web/data/demo-pharmacy/11440.json', orig = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(orig), updated: '2020-01-01T00:00:00Z' }));
    try {
      const { p, errors } = await open({});
      ok('다른 세대 지역 파일은 실패 처리', (await feedText(p)).includes('받지 못했어요') && !(await p.$('.care-card')));
      ok('세대 검사 오류 0', !errors.length, errors.join(','));
      await p.close();
    } finally { fs.writeFileSync(file, orig); }
  }
} finally {
  await b.close();
  console.log(results.join('\n'));
  fs.writeFileSync('docs/design/review-current/care-verify.txt', results.join('\n') + '\n');
}

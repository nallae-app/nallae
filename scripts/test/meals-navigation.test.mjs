import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const web = new URL('../../web/', import.meta.url);
const base = new URL('https://example.test/nallae/');
const html = name => fs.readFileSync(new URL(name, web), 'utf8');

function destinations(markup, document) {
  return Array.from(markup.matchAll(/<a\b[^>]*\bhref="([^"]+)"/gi), ([, href]) =>
    new URL(href.replaceAll('&amp;', '&'), new URL(document, base)));
}

test('설치 후 기본 시작은 식사 홈이고, 네 가지 기존 지도 화면을 직접 열고 홈으로 돌아올 수 있다', () => {
  const manifest = JSON.parse(html('manifest.webmanifest'));
  assert.equal(new URL(manifest.start_url, base).href, base.href);
  assert.equal(new URL(manifest.id, base).href, base.href);

  const home = html('index.html');
  const explore = html('explore.html');
  const mapPage = new URL('explore.html', base);
  const routes = destinations(home, 'index.html')
    .filter(url => url.origin === mapPage.origin && url.pathname === mapPage.pathname)
    .map(url => url.searchParams.get('view'));
  for (const view of ['courses', 'places', 'saved', 'utilities']) {
    assert.ok(routes.includes(view), view);
  }
  assert.ok(destinations(explore, 'explore.html').some(url => url.href === new URL('?home=1', base).href), '지도의 홈 링크');
  assert.match(explore, /id="map"/);
  assert.doesNotMatch(home, /\bsrc="(?:[^"]*\/)?leaflet(?:\.min)?\.js\b/, '지도 로딩과 독립적인 첫 화면');
});

test('홈에는 오늘과 내일, 집에서 먹기와 외식, 조리법까지 입력 없이 탐색할 수 있다', () => {
  const home = html('index.html');
  for (const offset of [0, 1]) assert.ok(home.includes('data-offset="' + offset + '"'));
  for (const mode of ['cook', 'dine']) assert.ok(home.includes('data-mode="' + mode + '"'));
  assert.match(home, /<dialog\b[^>]*id="recipe"/);
  assert.match(home, /<button\b[^>]*\bdata-open\b/);
  assert.match(home, /<a\b[^>]*\bid="map-search"/);
  assert.doesNotMatch(home, /<(?:input|select|textarea)\b[^>]*\brequired\b/i);
});

test('기존 지도 링크·시작 동네는 보존하며 홈 직접 선택과 일반 업데이트는 식사 홈을 연다', () => {
  const home = html('index.html');
  const setup = [...home.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]).join('\n');
  const favorites = JSON.stringify({version: 1, startCode: '11440', regions: [{code: '11440'}]});

  function navigate(suffix, stored = null) {
    const current = new URL(suffix, base);
    let destination = current;
    vm.runInNewContext(setup, {
      URL, URLSearchParams,
      location: {
        href: current.href, search: current.search, hash: current.hash,
        replace: value => { destination = new URL(value, current); },
      },
      localStorage: {getItem: key => key === 'nallae-favorites-v1' ? stored : null},
      document: {documentElement: {dataset: {}}},
    });
    return destination.href;
  }

  for (const query of ['', '?appv=95', '?utm_source=search']) {
    assert.equal(navigate(query), new URL(query, base).href);
  }
  for (const query of ['?travel=1&appv=95#map', '?demo&rain&near=11440&open', '?debug', '?view=saved']) {
    assert.equal(navigate(query), new URL('explore.html' + query, base).href);
  }
  assert.equal(navigate('', favorites), new URL('explore.html', base).href);
  assert.equal(navigate('?home=1', favorites), new URL('?home=1', base).href);
  assert.equal(navigate('', 'broken json'), base.href);
});

test('홈에서 연 생활·맛집은 각 자료가 실패해도 원래 화면에서 다시 시도할 수 있다', () => {
  const app = html('app.js');
  const render = app.match(/function renderExplore\([^]*?\n}/)?.[0];
  assert.ok(render);
  for (const [view, layer] of [['utilities', 'weather'], ['places', 'places']]) {
    const context = {
      sectionEntry: true, exploreChoiceChanged: false, exploreReady: false,
      requestedView: view, exploreLayer: layer,
      availableLayers: () => [['outing', '코스']],
      exploreTools: {querySelector: () => null}, panel: {dataset: {}}, feedEl: {},
      newButton: {}, titleEl: {}, subEl: {}, syncCategories() {}, syncModeNavigation() {},
    };
    vm.createContext(context);
    vm.runInContext(render, context);
    context.renderExplore();
    assert.equal(context.panel.dataset.exploreLayer, layer);
    assert.match(context.feedEl.innerHTML, /role="status"/);
    context.exploreReady = true;
    context.renderExplore();
    assert.equal(context.panel.dataset.exploreLayer, layer);
    assert.match(context.feedEl.innerHTML, /<button\b[^>]*data-entry-retry/);
  }
});

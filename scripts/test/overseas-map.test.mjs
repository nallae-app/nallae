import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const code = readFileSync(new URL('../../web/overseas-map.js', import.meta.url), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));
const style = { version: 8, sources: {}, layers: [] };

function fixture(t, { styleResponse, refuseContext = false, brokenAdapter = false, renderer = null, cities, safeCenter, visibleArea, boundsRadius = 3 } = {}) {
  const layers = new Set(), panes = {}, requests = [], renders = [], states = [], events = {};
  let themeChange, zoom = 4, disposalCount = 0, center = { lat: 34.69, lng: 135.5 };
  let viewCenter = safeCenter, safeArea = visibleArea;
  const convertedPoints = [];
  const groups = [], controls = [], selected = [];
  function node() { return { style: {}, children: [], attributes: {}, hidden: false,
    setAttribute(name, value) { this.attributes[name] = value; },
    appendChild(child) { this.children.push(child); }, replaceChildren() { this.children = []; },
    addEventListener(name, fn) { this[name] = fn; }
  }; }
  const group = () => ({
    items: [],
    addTo() { layers.add(this); return this; },
    clearLayers() { this.items = []; }, setStyle() {}
  });
  const map = {
    getPane: name => panes[name],
    createPane: name => (panes[name] = { style: {}, replaceChildren() {} }),
    getZoom: () => zoom, hasLayer: layer => layers.has(layer),
    getCenter: () => center, getBounds: () => ({ contains: ([lat, lon]) => Math.abs(lat - center.lat) < boundsRadius && Math.abs(lon - center.lng) < boundsRadius }),
    containerPointToLatLng(point) { convertedPoints.push(point); return viewCenter || center; },
    getSize: () => ({ x: 412, y: 800 }),
    on(names, fn) { for (const name of names.split(' ')) events[name] = fn; },
    off(names) { for (const name of names.split(' ')) delete events[name]; },
    removeLayer(layer) {
      layers.delete(layer);
      if (layer.vector) {
        if (brokenAdapter) throw new Error('Adapter removal failed');
        layer.gl?.remove(); layer.gl = null;
      }
    },
    attributionControl: { addAttribution() {}, removeAttribution() {} }
  };
  const L = {
    layerGroup() { const g = group(); groups.push(g); return g; }, geoJSON: group, divIcon: value => value,
    marker: (point, options) => ({ point, options, on(name, fn) { this[name] = fn; return this; }, addTo(g) { g.items.push(this); return this; }, setIcon() {} }),
    control() { const c = { addTo() { this.node = this.onAdd(); return this; }, remove() {} }; controls.push(c); return c; },
    maplibreGL(options) {
      const handlers = {};
      const gl = {
        _removed: false,
        on(name, fn) { handlers[name] = fn; }, off(name) { delete handlers[name]; },
        once(name, fn) { handlers[name] = fn; },
        getCanvas: () => ({
          addEventListener() {}, removeEventListener() {},
          getContext: () => ({
            getExtension: () => renderer === null ? null : { UNMASKED_RENDERER_WEBGL: 1 },
            getParameter: () => renderer
          })
        }),
        emit(name, value) { handlers[name]?.(value); },
        remove() { disposalCount++; this._removed = true; }
      };
      renders.push({ options, gl });
      return {
        vector: true, gl,
        addTo() {
          layers.add(this);
          if (refuseContext) throw new Error('WebGL refused');
          return this;
        },
        getMaplibreMap() { return this.gl; }
      };
    }
  };
  const document = {
    baseURI: 'https://local.test/nallae/', documentElement: { dataset: { theme: 'light' } },
    createElement: node
  };
  const window = {
    maplibregl: {}, MutationObserver: class {
      constructor(fn) { themeChange = fn; }
      observe() {} disconnect() { themeChange = null; }
    }
  };
  vm.runInNewContext(code, {
    window, document, URL, AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => {
      requests.push({ url: String(url), options });
      if (String(url).startsWith(document.baseURI)) {
        return { ok: true, json: async () => ({ type: 'FeatureCollection', features: [] }) };
      }
      return styleResponse ? styleResponse(url, options) : { ok: true, json: async () => style };
    }
  });
  const api = window.JippiOverseasMap.create({
    map, L, cities: cities || [{ id: 'osaka', nameKo: '오사카', nameLocal: '大阪', lat: 34.69, lon: 135.5 }],
    onStatus: value => states.push(value.state), onCitySelect: id => selected.push(id),
    getVisibleArea: visibleArea ? () => safeArea : undefined
  });
  t.after(() => api.destroy());
  return {
    api, layers, requests, renders, states, groups, controls, selected, convertedPoints,
    external: () => requests.filter(request => !request.url.startsWith(document.baseURI)),
    theme() { document.documentElement.dataset.theme = 'dark'; themeChange?.(); },
    zoom(value) { zoom = value; events.zoomend?.(); },
    center(lat, lng) { center = { lat, lng }; events.moveend?.(); },
    safeCenter(lat, lng) { viewCenter = { lat, lng }; events.moveend?.(); },
    area(rect) { safeArea = rect; events.resize?.(); },
    get disposalCount() { return disposalCount; }
  };
}

test('preview keeps local coast/city layers without contacting a map provider', async t => {
  const f = fixture(t);
  f.api.setVisible(true, { basemap: true });
  await settle();
  assert.equal(f.external().length, 0);
  assert.equal(f.renders.length, 0);
  assert.equal(f.layers.size, 3);
  f.theme(); await settle();
  assert.equal(f.external().length, 0);
});

test('domestic return disposes GL and prevents theme requests until foreign re-entry', async t => {
  const f = fixture(t);
  f.api.setVisible(true, { basemap: true }); f.api.enableBasemap();
  await settle(); f.renders[0].gl.emit('load');
  f.api.setVisible(true, { basemap: false });
  assert.equal(f.disposalCount, 1);
  const requests = f.external().length;
  f.theme(); await settle();
  assert.equal(f.external().length, requests);
  assert.equal(f.renders.length, 1);
  f.zoom(8); assert.equal(f.layers.size, 2); // local coast/cities, no country label
  f.api.setVisible(true, { basemap: true }); await settle();
  assert.equal(f.renders.length, 2);
});

test('late style response after domestic return cannot recreate the vector layer', async t => {
  let finish;
  const f = fixture(t, { styleResponse: () => new Promise(resolve => { finish = resolve; }) });
  f.api.setVisible(true, { basemap: true }); f.api.enableBasemap(); await settle();
  const request = f.external()[0];
  f.api.setVisible(true, { basemap: false });
  assert.equal(request.options.signal.aborted, true);
  finish({ ok: true, json: async () => style }); await settle();
  assert.equal(f.renders.length, 0);
  assert.equal(f.states.at(-1), 'preview');
  assert.equal(f.layers.size, 3);
});

test('a post-load tile error keeps GL, but renderer failure restores the local coast', async t => {
  const f = fixture(t);
  f.api.setVisible(true, { basemap: true }); f.api.enableBasemap(); await settle();
  const gl = f.renders[0].gl; gl.emit('load');
  gl.emit('error', { sourceId: 'openmaptiles' });
  assert.equal(f.states.at(-1), 'ready'); assert.equal(f.disposalCount, 0);
  gl.emit('error', { error: new Error('Renderer failure') }); await settle();
  assert.equal(f.states.at(-1), 'fallback'); assert.equal(f.disposalCount, 1);
  assert.equal(f.layers.size, 3);
});

test('startup source failure and refused GPU contexts preserve local navigation', async t => {
  const f = fixture(t);
  f.api.setVisible(true, { basemap: true }); f.api.enableBasemap(); await settle();
  f.renders[0].gl.emit('error', { sourceId: 'openmaptiles' }); await settle();
  assert.equal(f.states.at(-1), 'fallback'); assert.equal(f.layers.size, 3);
  const gpu = fixture(t, { refuseContext: true, brokenAdapter: true });
  gpu.api.setVisible(true, { basemap: true }); gpu.api.enableBasemap(); await settle();
  assert.equal(gpu.renders[0].options.canvasContextAttributes.failIfMajorPerformanceCaveat, true);
  assert.equal(gpu.states.at(-1), 'fallback'); assert.equal(gpu.layers.size, 3);
  assert.equal(gpu.disposalCount, 1);
});

test('turning details off revokes requests across subsequent theme changes and re-entry', async t => {
  const f = fixture(t);
  f.api.setVisible(true, { basemap: true }); f.api.enableBasemap(); await settle();
  f.renders[0].gl.emit('load'); f.api.disableBasemap(); await settle();
  assert.equal(f.states.at(-1), 'preview'); assert.equal(f.disposalCount, 1);
  const count = f.external().length;
  f.theme(); f.api.setVisible(false); f.api.setVisible(true, { basemap: true }); await settle();
  assert.equal(f.external().length, count); assert.equal(f.renders.length, 1);
  assert.equal(f.layers.size, 3);
});

test('only the observed Android emulator software driver falls back; other GPUs remain available', async t => {
  for (const [renderer, unsupported] of [
    ['Android Emulator OpenGL ES Translator (ANGLE SwiftShader driver)', true],
    ['Android Emulator OpenGL ES Translator (lavapipe)', true],
    ['ANGLE (Google, SwiftShader driver)', false],
    ['Android Emulator OpenGL ES Translator (Hardware GPU)', false],
    ['ANGLE (Samsung, Mali-G78)', false], [null, false]
  ]) {
    const f = fixture(t, { renderer });
    f.api.setVisible(true, { basemap: true }); f.api.enableBasemap(); await settle();
    if (unsupported) {
      assert.equal(f.states.at(-1), 'fallback'); assert.equal(f.disposalCount, 1);
      assert.equal(f.layers.size, 3);
    } else {
      f.renders[0].gl.emit('load'); assert.equal(f.states.at(-1), 'ready');
      assert.equal(f.disposalCount, 0);
    }
    f.api.destroy();
  }
});

test('domestic viewport suppresses foreign geographic labels; edge exploration never moves their coordinates', async t => {
  const f = fixture(t, { cities: [
    { id: 'osaka', nameKo: '오사카', nameLocal: '大阪', lat: 34.69, lon: 135.5 },
    { id: 'shanghai', nameKo: '상하이', nameLocal: '上海', lat: 31.2, lon: 121.5 }
  ] });
  f.api.setVisible(true, { basemap: false }); await settle();
  f.zoom(7); f.center(36.4, 127.4);
  assert.equal(f.groups[0].items.length, 0);
  assert.equal(f.layers.has(f.groups[1]), false);
  assert.equal(f.controls[0].node.hidden, true);
  f.center(37, 125.5);
  const hint = f.controls[0].node.children[0];
  assert.match(hint.textContent, /中国/);
  assert.match(hint.attributes['aria-label'], /지리적 위치 표식이 아닌/);
  hint.click(); assert.deepEqual(f.selected, ['shanghai']);
  assert.equal(f.groups[0].items.length, 0);
  f.center(31.2, 121.5);
  assert.equal(f.controls[0].node.hidden, true);
  assert.equal(f.groups[0].items.length, 1);
  assert.deepEqual(Array.from(f.groups[0].items[0].point), [31.2, 121.5]);
  const marker = f.groups[0].items[0];
  f.center(31.21, 121.51); f.zoom(6.5);
  assert.equal(f.groups[0].items[0], marker, 'native Leaflet marker survives camera motion without DOM recreation');
});

test('edge hints follow the unobscured viewport midpoint and remain absent at national zoom', async t => {
  const f = fixture(t, { safeCenter: { lat: 36.4, lng: 127.4 },
    visibleArea: { left: 20, right: 392, top: 100, bottom: 380 },
    cities: [{ id: 'shanghai', nameKo: '상하이', nameLocal: '上海', lat: 31.2, lon: 121.5 }] });
  f.api.setVisible(true); await settle();
  f.center(35.1, 129); f.zoom(7);
  assert.equal(f.controls[0].node.hidden, true, 'container center in Busan cannot trigger a hint when visible Korea remains centered');
  assert.deepEqual(Array.from(f.convertedPoints.at(-1)), [206, 240]);
  f.safeCenter(37, 125.5); f.zoom(6.25);
  assert.equal(f.controls[0].node.hidden, true);
  f.zoom(7); assert.match(f.controls[0].node.children[0].textContent, /中国/);
  f.area({ left: 20, right: 392, top: 100, bottom: 180 });
  assert.equal(f.controls[0].node.hidden, true, 'sheet-obscured map has no hint');
  f.area({ left: 20, right: 392, top: 240, bottom: 180 });
  assert.equal(f.controls[0].node.hidden, true, 'an entirely covered safe area cannot fall back to larger default padding');
});

test('explicit travel overview exposes real city coordinates without changing the initial domestic view or starting external requests', async t => {
  const f = fixture(t, { safeCenter: { lat: 36.4, lng: 127.4 }, boundsRadius: 15,
    cities: [
      { id: 'osaka', nameKo: '오사카', nameLocal: '大阪', lat: 34.69, lon: 135.5 },
      { id: 'shanghai', nameKo: '상하이', nameLocal: '上海', lat: 31.2, lon: 121.5 }
    ] });
  f.center(36.4, 127.4); f.zoom(5.25);
  f.api.setVisible(true, { basemap: false }); await settle();
  assert.equal(f.groups[0].items.length, 0);
  assert.equal(f.layers.has(f.groups[1]), false);
  f.api.setVisible(true, { basemap: true });
  assert.equal(f.groups[0].items.length, 2);
  assert.equal(f.layers.has(f.groups[1]), true);
  assert.deepEqual(Array.from(f.groups[0].items[0].point), [34.69, 135.5]);
  assert.equal(f.groups[0].items[0].options.icon.html.textContent, '大阪');
  f.groups[0].items[0].click(); assert.deepEqual(f.selected, ['osaka']);
  assert.equal(f.external().length, 0);
  assert.equal(f.controls[0].node.hidden, true);
  f.api.setVisible(true, { basemap: false });
  assert.equal(f.groups[0].items.length, 0);
  assert.equal(f.layers.has(f.groups[1]), false);
});

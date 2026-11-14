import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const code = readFileSync(new URL('../../web/overseas-map.js', import.meta.url), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));
const style = { version: 8, sources: {}, layers: [] };

function fixture(t, { styleResponse, refuseContext = false, brokenAdapter = false, renderer = null, cities, safeCenter, visibleArea, boundsRadius = 3, persistentCoast = false, coastResponse, initialTheme = 'light' } = {}) {
  const layers = new Set(), panes = {}, requests = [], renders = [], states = [], events = {};
  let themeChange, zoom = 4, disposalCount = 0, center = { lat: 34.69, lng: 135.5 };
  let viewCenter = safeCenter, safeArea = visibleArea;
  const convertedPoints = [];
  const groups = [], controls = [], selected = [], coasts = [];
  function node() { return { style: {}, children: [], attributes: {}, hidden: false,
    setAttribute(name, value) { this.attributes[name] = value; },
    appendChild(child) { this.children.push(child); }, replaceChildren() { this.children = []; },
    addEventListener(name, fn) { this[name] = fn; }
  }; }
  const group = () => ({
    items: [],
    addTo() { layers.add(this); return this; },
    clearLayers() { this.items = []; }, setStyle(value) { this.style = value; }
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
    layerGroup() { const g = group(); groups.push(g); return g; },
    geoJSON(data, options) { const g = group(); g.style = options.style; coasts.push(g); return g; },
    divIcon: value => value,
    marker: (point, options) => ({ point, options, on(name, fn) { this[name] = fn; return this; }, addTo(g) { g.items.push(this); return this; }, setIcon() {} }),
    control() { const c = { addTo() { this.node = this.onAdd(); return this; }, remove() {} }; controls.push(c); return c; },
    maplibreGL(options) {
      const handlers = {};
      const paintChanges = [];
      const subscriptions = {};
      let loaded = false, tileBusy = false, structureReady = true, paintFails = false;
      const gl = {
        _removed: false,
        on(name, fn) { subscriptions[name] = (subscriptions[name] || 0) + 1; handlers[name] = fn; }, off(name) { delete handlers[name]; },
        once(name, fn) { handlers[name] = fn; },
        getCanvas: () => ({
          addEventListener() {}, removeEventListener() {},
          getContext: () => ({
            getExtension: () => renderer === null ? null : { UNMASKED_RENDERER_WEBGL: 1 },
            getParameter: () => renderer
          })
        }),
        isStyleLoaded: () => loaded && !tileBusy,
        getStyle: () => structureReady ? options.style : undefined,
        getLayer: id => structureReady ? options.style.layers.find(layer => layer.id === id) : undefined,
        setTileBusy(value) { tileBusy = value; },
        setStructureReady(value) { structureReady = value; },
        setPaintFailures(value) { paintFails = value; },
        listenerCount: name => handlers[name] ? 1 : 0,
        subscriptions,
        setPaintProperty(id, property, value) {
          if (typeof paintFails === 'function' ? paintFails(id, property, value) : paintFails) throw new Error('Style paint temporarily unavailable');
          paintChanges.push({ id, property, value });
          options.style.layers.find(layer => layer.id === id).paint[property] = value;
        },
        emit(name, value) { if (name === 'load') loaded = true; handlers[name]?.(value); },
        remove() { disposalCount++; this._removed = true; }
      };
      renders.push({ options, gl, paintChanges });
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
    baseURI: 'https://local.test/nallae/', documentElement: { dataset: { theme: initialTheme } },
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
        if (coastResponse) return coastResponse(url, options);
        return { ok: true, json: async () => ({ type: 'FeatureCollection', features: [] }) };
      }
      return styleResponse ? styleResponse(url, options) : { ok: true, json: async () => style };
    }
  });
  const api = window.JippiOverseasMap.create({
    map, L, cities: cities || [{ id: 'osaka', nameKo: '오사카', nameLocal: '大阪', lat: 34.69, lon: 135.5 }],
    onStatus: value => states.push(value.state), onCitySelect: id => selected.push(id),
    getVisibleArea: visibleArea ? () => safeArea : undefined, persistentCoast
  });
  t.after(() => api.destroy());
  return {
    api, layers, requests, renders, states, groups, controls, selected, convertedPoints, coasts,
    external: () => requests.filter(request => !request.url.startsWith(document.baseURI)),
    theme(value = 'dark') { document.documentElement.dataset.theme = value; themeChange?.(); },
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

test('theme changes keep a successful GL layer and its geometry even when another style request would fail', async t => {
  const colors = { version: 8, sources: { openmaptiles: { type: 'vector', url: 'https://tiles.test/planet' } }, layers: [
    { id: 'water', type: 'fill', 'source-layer': 'water', paint: { 'fill-color': '#102030' } },
    { id: 'road', type: 'line', 'source-layer': 'transportation', paint: { 'line-color': ['match', ['get', 'class'], 'major', '#999999', '#AAAAAA'] } }
  ] };
  let failNetwork = false;
  const f = fixture(t, { initialTheme: 'dark', styleResponse: async () => ({ ok: !failNetwork, json: async () => colors }) });
  f.api.setVisible(true, { basemap: true }); f.api.enableBasemap(); await settle();
  const render = f.renders[0]; render.gl.emit('load');
  assert.equal(render.options.style.layers[0].paint['fill-color'], '#0E2135');
  const activeLayers = [...f.layers], marker = f.groups[0].items[0], requestCount = f.requests.length;
  failNetwork = true;
  f.theme('light'); await settle();
  assert.equal(f.renders.length, 1); assert.equal(f.disposalCount, 0);
  assert.equal(f.states.at(-1), 'ready'); assert.equal(f.requests.length, requestCount);
  assert.deepEqual([...f.layers], activeLayers); assert.equal(f.groups[0].items[0], marker);
  assert.equal(render.options.style.layers[0].paint['fill-color'], '#102030');
  assert.equal(render.options.style.sources.openmaptiles.url, 'https://tiles.test/planet');
  assert.equal(JSON.stringify(render.options.style.layers[1].paint['line-color']), JSON.stringify(colors.layers[1].paint['line-color']));
  f.theme('dark'); await settle();
  assert.equal(render.options.style.layers[0].paint['fill-color'], '#0E2135');
  assert.equal(colors.layers[0].paint['fill-color'], '#102030', 'supplied style/cache remains unmodified');
});

test('a theme switch while a style is pending neither aborts it nor creates another request', async t => {
  let finish;
  const f = fixture(t, { styleResponse: () => new Promise(resolve => { finish = resolve; }) });
  f.api.setVisible(true, { basemap: true }); f.api.enableBasemap(); await settle();
  const request = f.external()[0];
  f.theme('dark'); await settle();
  assert.equal(request.options.signal.aborted, false); assert.equal(f.external().length, 1);
  finish({ ok: true, json: async () => ({ version: 8, sources: {}, layers: [
    { id: 'water', type: 'fill', 'source-layer': 'water', paint: { 'fill-color': '#ABCDEF' } }
  ] }) });
  await settle(); f.renders[0].gl.emit('load');
  assert.equal(f.renders.length, 1); assert.equal(f.states.at(-1), 'ready');
  assert.equal(f.renders[0].options.style.layers[0].paint['fill-color'], '#0E2135', 'latest theme applies when the existing request finishes');
});

test('persistent local coast survives inactive modes and recolors without contacting an external provider', async t => {
  const f = fixture(t, { persistentCoast: true });
  await settle();
  const coast = f.coasts[0], requests = f.requests.length;
  assert.equal(f.layers.has(coast), true); assert.equal(f.layers.size, 1);
  f.api.setVisible(true, { basemap: false }); f.api.setVisible(false, { basemap: false });
  assert.equal(f.layers.has(coast), true); assert.equal(f.layers.size, 1);
  f.theme('dark'); await settle();
  assert.equal(f.coasts[0], coast); assert.equal(coast.style.fillColor, '#263c50');
  assert.equal(f.requests.length, requests); assert.equal(f.external().length, 0);
  assert.equal(f.states.at(-1), 'hidden');
  f.api.destroy(); assert.equal(f.layers.size, 0);
});

test('persistent coast finishing after a mode change is retained instead of aborted', async t => {
  let finish;
  const f = fixture(t, { persistentCoast: true, coastResponse: () => new Promise(resolve => { finish = resolve; }) });
  const request = f.requests[0];
  f.api.setVisible(true, { basemap: false }); f.api.setVisible(false, { basemap: false });
  assert.equal(request.options.signal.aborted, false);
  f.theme('dark');
  finish({ ok: true, json: async () => ({ type: 'FeatureCollection', features: [] }) });
  await settle();
  assert.equal(f.coasts.length, 1); assert.equal(f.layers.has(f.coasts[0]), true);
  assert.equal(f.coasts[0].style.fillColor, '#263c50'); assert.equal(f.layers.size, 1);
});

test('persistent coast returns when foreign GL is removed, while city controls remain hidden', async t => {
  const f = fixture(t, { persistentCoast: true });
  f.api.setVisible(true, { basemap: true }); f.api.enableBasemap(); await settle();
  f.renders[0].gl.emit('load');
  const coast = f.coasts[0]; assert.equal(f.layers.has(coast), false);
  f.api.setVisible(false, { basemap: false });
  assert.equal(f.disposalCount, 1); assert.equal(f.layers.has(coast), true);
  assert.equal(f.layers.has(f.groups[0]), false); assert.equal(f.layers.has(f.groups[1]), false);
  assert.equal(f.layers.size, 1);
});

test('dark-first and light-first share one canonical rich style, including POIs and airport labels', async t => {
  const richStyle = { version: 8, sources: { openmaptiles: { type: 'vector', url: 'https://tiles.test/planet' } }, layers: [
    { id: 'label_city', type: 'symbol', 'source-layer': 'place', layout: { 'text-field': ['get', 'name'] }, paint: { 'text-color': '#222222' } },
    { id: 'label_poi', type: 'symbol', 'source-layer': 'poi', layout: { 'text-field': ['get', 'name'] }, paint: { 'text-color': '#333333' } },
    { id: 'label_airport', type: 'symbol', 'source-layer': 'aerodrome_label', layout: { 'text-field': ['get', 'name'] }, paint: { 'text-color': '#444444' } }
  ] };
  const fixtures = ['light', 'dark'].map(initialTheme => fixture(t, {
    initialTheme,
    styleResponse: async url => ({ ok: true, json: async () => String(url).endsWith('/dark')
      ? { ...richStyle, layers: richStyle.layers.slice(0, 1) } : richStyle })
  }));
  for (const [i, f] of fixtures.entries()) {
    f.api.setVisible(true, { basemap: true }); f.api.enableBasemap(); await settle();
    assert.equal(f.external()[0].url, 'https://tiles.openfreemap.org/styles/liberty');
    const render = f.renders[0];
    assert.equal(render.options.style.layers.filter(layer => layer.type === 'symbol' && layer.layout['text-field']).length, 3);
    assert.ok(render.options.style.layers.some(layer => layer.id === 'label_poi'));
    assert.ok(render.options.style.layers.some(layer => layer.id === 'label_airport'));
    render.gl.emit('load');
    const requests = f.requests.length;
    f.theme(i === 0 ? 'dark' : 'light'); await settle();
    assert.equal(f.requests.length, requests); assert.equal(f.renders.length, 1);
    assert.equal(f.disposalCount, 0); assert.equal(f.states.at(-1), 'ready');
  }
  const structure = f => f.renders[0].options.style.layers.map(layer => ({ id: layer.id, type: layer.type, sourceLayer: layer['source-layer'], layout: layer.layout }));
  assert.equal(JSON.stringify(structure(fixtures[0])), JSON.stringify(structure(fixtures[1])));
});

const paintableStyle = { version: 8, sources: {}, layers: [
  { id: 'water', type: 'fill', 'source-layer': 'water', paint: { 'fill-color': '#DFEAED' } },
  { id: 'road', type: 'line', 'source-layer': 'transportation', paint: { 'line-color': '#FFFFFF' } }
] };
const paintFixture = t => fixture(t, { styleResponse: async () => ({ ok: true, json: async () => paintableStyle }) });

test('busy tiles after initial load do not delay theme painting or require another load event', async t => {
  const f = paintFixture(t);
  f.api.setVisible(true, { basemap: true }); f.api.enableBasemap(); await settle();
  const render = f.renders[0], gl = render.gl; gl.emit('load'); gl.setTileBusy(true);
  assert.equal(gl.isStyleLoaded(), false);
  const requests = f.requests.length;
  f.theme('dark');
  assert.equal(render.options.style.layers[0].paint['fill-color'], '#0E2135');
  assert.equal(gl.listenerCount('idle'), 0); assert.equal(f.disposalCount, 0);
  f.theme('light');
  assert.equal(render.options.style.layers[0].paint['fill-color'], '#DFEAED');
  assert.equal(f.requests.length, requests); assert.equal(f.renders.length, 1);
});

test('unready style structure retries once per renderer and removes subscriptions after success', async t => {
  const f = paintFixture(t);
  f.api.setVisible(true, { basemap: true }); f.api.enableBasemap(); await settle();
  const render = f.renders[0], gl = render.gl; gl.emit('load'); gl.setStructureReady(false);
  f.theme('dark'); f.theme('dark'); gl.emit('idle');
  assert.equal(gl.subscriptions['style.load'], 1); assert.equal(gl.subscriptions.idle, 1);
  assert.equal(render.options.style.layers[0].paint['fill-color'], '#DFEAED');
  gl.setStructureReady(true); gl.emit('style.load');
  assert.equal(render.options.style.layers[0].paint['fill-color'], '#0E2135');
  assert.equal(gl.listenerCount('style.load'), 0); assert.equal(gl.listenerCount('idle'), 0);
  assert.equal(f.states.at(-1), 'ready'); assert.equal(f.disposalCount, 0);
});

test('partial paint failure is not marked complete and switching back restores successful partial writes too', async t => {
  const f = paintFixture(t);
  f.api.setVisible(true, { basemap: true }); f.api.enableBasemap(); await settle();
  const render = f.renders[0], gl = render.gl; gl.emit('load');
  gl.setPaintFailures(id => id === 'road'); f.theme('dark');
  assert.equal(render.options.style.layers[0].paint['fill-color'], '#0E2135');
  assert.equal(render.options.style.layers[1].paint['line-color'], '#FFFFFF');
  f.theme('light');
  assert.equal(render.options.style.layers[0].paint['fill-color'], '#DFEAED');
  gl.setPaintFailures(false); gl.emit('idle');
  assert.equal(gl.listenerCount('idle'), 0); assert.equal(gl.listenerCount('style.load'), 0);
  const writes = render.paintChanges.length; f.theme('light');
  assert.equal(render.paintChanges.length, writes);
});

test('pending theme retries are removed on GL disposal and cannot repaint an old renderer', async t => {
  const f = paintFixture(t);
  f.api.setVisible(true, { basemap: true }); f.api.enableBasemap(); await settle();
  const render = f.renders[0], gl = render.gl; gl.emit('load'); gl.setPaintFailures(true);
  f.theme('dark'); assert.equal(gl.listenerCount('idle'), 1);
  f.api.setVisible(false);
  assert.equal(gl.listenerCount('idle'), 0); assert.equal(gl.listenerCount('style.load'), 0);
  const writes = render.paintChanges.length;
  gl.setPaintFailures(false); gl.emit('idle'); gl.emit('style.load');
  assert.equal(render.paintChanges.length, writes); assert.equal(f.layers.size, 0);
});

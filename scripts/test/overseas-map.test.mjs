import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const code = readFileSync(new URL('../../web/overseas-map.js', import.meta.url), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));
const style = { version: 8, sources: {}, layers: [] };

function fixture(t, { styleResponse, refuseContext = false, brokenAdapter = false, renderer = null } = {}) {
  const layers = new Set(), panes = {}, requests = [], renders = [], states = [], events = {};
  let themeChange, zoom = 4, disposalCount = 0;
  const group = () => ({
    addTo() { layers.add(this); return this; },
    clearLayers() {}, setStyle() {}
  });
  const map = {
    getPane: name => panes[name],
    createPane: name => (panes[name] = { style: {}, replaceChildren() {} }),
    getZoom: () => zoom, hasLayer: layer => layers.has(layer),
    on(name, fn) { events[name] = fn; }, off(name) { delete events[name]; },
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
    layerGroup: group, geoJSON: group, divIcon: value => value,
    marker: () => ({ on() { return this; }, addTo() { return this; }, setIcon() {} }),
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
    createElement: () => ({ style: {} })
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
    map, L, cities: [{ id: 'osaka', nameKo: '오사카', nameLocal: '大阪', lat: 34.69, lon: 135.5 }],
    onStatus: value => states.push(value.state)
  });
  t.after(() => api.destroy());
  return {
    api, layers, requests, renders, states,
    external: () => requests.filter(request => !request.url.startsWith(document.baseURI)),
    theme() { document.documentElement.dataset.theme = 'dark'; themeChange?.(); },
    zoom(value) { zoom = value; events.zoomend?.(); },
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

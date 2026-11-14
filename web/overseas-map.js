/* Optional vector background; Leaflet remains the owner of selection and gestures.
 * Sources: https://openfreemap.org/quick_start/
 * https://github.com/maplibre/maplibre-gl-leaflet
 * https://maplibre.org/maplibre-style-spec/expressions/
 */
(function (global) {
  'use strict';
  const ATTRIBUTION = '<a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a> · <a href="https://openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>';
  const LABEL_ZOOM = 6;
  const TIMEOUT = 12000;
  const SCRIPT_BASE = new URL('.', document.currentScript?.src || document.baseURI);
  let vendorPromise = null;
  function ensureVendor(L) {
    if (global.maplibregl && typeof L.maplibreGL === 'function') return Promise.resolve();
    if (vendorPromise) return vendorPromise;
    function asset(tag, file) {
      return new Promise((resolve, reject) => {
        const element = document.createElement(tag);
        const timer = setTimeout(() => { element.remove(); reject(new Error('Map library timeout')); }, 9000);
        element.onload = () => { clearTimeout(timer); resolve(); };
        element.onerror = () => { clearTimeout(timer); element.remove(); reject(new Error('Map library unavailable')); };
        if (tag === 'link') { element.rel = 'stylesheet'; element.href = new URL(file, SCRIPT_BASE).href; }
        else { element.src = new URL(file, SCRIPT_BASE).href; element.async = true; }
        document.head.appendChild(element);
      });
    }
    vendorPromise = (async () => {
      await asset('link', 'vendor/maplibre/maplibre-gl.css');
      if (!global.maplibregl) await asset('script', 'vendor/maplibre/maplibre-gl.js');
      if (typeof L.maplibreGL !== 'function') await asset('script', 'vendor/maplibre/maplibre-gl-leaflet.js');
      if (!global.maplibregl || typeof L.maplibreGL !== 'function') throw new Error('Map adapter unavailable');
    })().catch(error => { vendorPromise = null; throw error; });
    return vendorPromise;
  }

  function nativeName() {
    return ['coalesce', ['get', 'name'], ['get', 'name:nonlatin'], ['get', 'name:latin'], ''];
  }
  function bilingualName() {
    const local = nativeName();
    // coalesce alone does not reject an empty Korean translation.
    const ko = ['coalesce', ['get', 'name:ko'], ''];
    return ['case', ['==', ko, ''], local,
      ['any', ['==', ko, local], ['==', local, '']], ko,
      ['concat', ko, '\n', local]];
  }
  function localizeStyle(original, cities, domesticGeometry) {
    if (!original || original.version !== 8 || !original.sources || !Array.isArray(original.layers)) {
      throw new Error('Invalid vector style');
    }
    const style = JSON.parse(JSON.stringify(original));
    // If a precise domestic mask is unavailable, only the pilot cities' surroundings
    // receive vector place labels. Never guess a Korean administrative boundary.
    const pilotGeometry = { type: 'MultiPolygon', coordinates: cities.map(city => [[
      [city.lon - 2, city.lat - 2], [city.lon + 2, city.lat - 2],
      [city.lon + 2, city.lat + 2], [city.lon - 2, city.lat + 2], [city.lon - 2, city.lat - 2]
    ]]) };
    const outsideDomestic = domesticGeometry
      ? ['!', ['within', domesticGeometry]] : ['within', pilotGeometry];
    for (const layer of style.layers) {
      if (layer['source-layer'] === 'boundary' ||
          (layer.type === 'symbol' && ['water_name', 'waterway'].includes(layer['source-layer']))) {
        layer.layout = { ...layer.layout, visibility: 'none' };
      }
      if (layer.type !== 'symbol' || !layer.layout || !layer.layout['text-field']) continue;
      if(document.documentElement.dataset.theme==='dark'){layer.paint={...layer.paint,'text-color':'#b7c4d3','text-halo-color':'#101b2b','text-halo-width':1.2};}
      if(layer['source-layer']==='transportation_name'&&/name/i.test(layer.id||'')&&!/ref|shield/i.test(layer.id||''))layer.layout['text-field']=nativeName();
      if (layer['source-layer'] === 'place') {
        const allowed = ['all', outsideDomestic, ['!=', ['get', 'class'], 'island'], ['!=', ['get', 'class'], 'country']];
        layer.layout['text-field'] = ['step', ['zoom'], ['case', allowed, nativeName(), ''],
          LABEL_ZOOM, ['case', allowed, bilingualName(), '']];
      }
    }
    return style;
  }
  function normalizeCity(city) {
    if (!city || typeof city.id !== 'string' || !city.id) return null;
    const lat = Number(city.lat ?? city.center?.[0]);
    const lon = Number(city.lon ?? city.lng ?? city.center?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -85 || lat > 85 || lon < -180 || lon > 180) return null;
    return { ...city, lat, lon, nameKo: String(city.nameKo || city.name || city.id), nameLocal: String(city.nameLocal || city.localName || city.nameKo || city.name || city.id) };
  }
  function create(options) {
    const { map, L, onCitySelect, onStatus } = options || {};
    if (!map || !L) throw new Error('A Leaflet map and L are required');
    const cities = (options.cities || []).map(normalizeCity).filter(Boolean);
    const byId = new Map(cities.map(city => [city.id, city]));
    let visible = false, destroyed = false, basemapEnabled = false, basemapAllowed = false, generation = 0, layer = null, gl = null;
    let controller = null, timeout = null, lastStatus = '';
    const styleCache = new Map();
    let coastLayer = null, coastData = null, coastController = null, coastTimer = null;
    let contextCanvas = null, contextLostHandler = null, glErrorHandler = null;
    const cityMarkers = [], countryMarkers = [];
    let citySignature = null;
    const group = L.layerGroup(), fallback = L.layerGroup();
    const paneName = 'jippi-overseas-background';
    const pinPaneName = 'jippi-overseas-cities';
    const pane = map.getPane(paneName) || map.createPane(paneName);
    pane.style.zIndex = '190';
    pane.style.pointerEvents = 'none';
    const coastPaneName = 'jippi-overseas-coast';
    const coastPane = map.getPane(coastPaneName) || map.createPane(coastPaneName);
    coastPane.style.zIndex = '180'; coastPane.style.pointerEvents = 'none';
    const pinPane = map.getPane(pinPaneName) || map.createPane(pinPaneName);
    pinPane.style.zIndex = '450';
    let edgeControl = null, edgeNode = null;
    if (typeof L.control === 'function') {
      edgeControl = L.control({ position: 'topleft' });
      edgeControl.onAdd = () => {
        edgeNode = document.createElement('div');
        edgeNode.className = 'overseas-edge-hints';
        edgeNode.setAttribute('role', 'group');
        edgeNode.setAttribute('aria-label', '해외 여행 지도 탐험');
        L.DomEvent?.disableClickPropagation(edgeNode);
        L.DomEvent?.disableScrollPropagation(edgeNode);
        return edgeNode;
      };
      edgeControl.addTo(map);
    }

    function status(state, message) {
      if (destroyed || lastStatus === state) return;
      lastStatus = state;
      if (typeof onStatus === 'function') onStatus({ state, message });
    }
    function labelNode(text, kind) {
      const node = document.createElement('span');
      node.textContent = text;
      node.className = 'overseas-map-label overseas-map-label-' + kind;
      Object.assign(node.style, {
        display: 'block', width: '100%', boxSizing: 'border-box', whiteSpace: 'pre-line',
        font: (kind === 'city' ? '600 11px' : '500 13px') + ' system-ui, sans-serif',
        lineHeight: '1.4', textAlign: 'center'
      });
      return node;
    }
    function cityLabel(city) {
      return map.getZoom() < LABEL_ZOOM || city.nameKo === city.nameLocal
        ? city.nameLocal : city.nameKo + '\n' + city.nameLocal;
    }
    function icon(text, kind) {
      const width = Math.min(160, Math.max(54, Math.max(...text.split('\n').map(line => Array.from(line).length)) * 12 + 24));
      return L.divIcon({ className: 'overseas-map-marker', html: labelNode(text, kind), iconSize: [width, 42], iconAnchor: [width / 2, 21] });
    }
    for (const country of [
      { point: [35, 119], name: '中国', ko: '중국' },
      { point: [39, 140], name: '日本', ko: '일본' },
      { point: [36, 127.5], name: '대한민국', ko: '대한민국' }
    ]) {
      const marker = L.marker(country.point, { pane: pinPaneName, interactive: false, keyboard: false, icon: icon(country.name, 'country') }).addTo(fallback);
      countryMarkers.push({ marker, country, text: country.name });
    }
    function visibleArea() {
      const size = map.getSize?.();
      if (!size) return null;
      const explicit = typeof options.getVisibleArea === 'function' ? options.getVisibleArea() : null;
      if (explicit && [explicit.left, explicit.right, explicit.top, explicit.bottom].every(Number.isFinite)) return explicit;
      const padding = typeof options.getPadding === 'function' ? options.getPadding() : {};
      const start = padding.paddingTopLeft || padding.padding || [8, 96];
      const end = padding.paddingBottomRight || padding.padding || [8, 8];
      return { left: start[0], top: start[1], right: size.x - end[0], bottom: size.y - end[1] };
    }
    function visibleCenter() {
      const area = visibleArea();
      return area && typeof map.containerPointToLatLng === 'function'
        ? map.containerPointToLatLng([(area.left + area.right) / 2, (area.top + area.bottom) / 2])
        : map.getCenter?.();
    }
    function foreignCenter() {
      const center = visibleCenter();
      return Boolean(center && (center.lng < 124.1 || center.lng > 132.3));
    }
    function geographicLabelsVisible() {
      return foreignCenter() || (basemapAllowed && map.getZoom() <= 5.5);
    }
    function updateEdgeHint() {
      if (!edgeNode) return;
      edgeNode.replaceChildren();
      edgeNode.hidden = true;
      if (!visible || destroyed || foreignCenter()) return;
      const center = visibleCenter(), zoom = map.getZoom();
      if (!center || zoom < 6.75 || zoom > 8) return;
      const west = center.lng >= 124.1 && center.lng <= 126.2 && center.lat >= 33 && center.lat <= 39;
      const east = !west && center.lng >= 128 && center.lng <= 132.3 && center.lat >= 32 && center.lat <= 36.5;
      const city = west ? cities.find(c => /shanghai|상하이/i.test(c.id + c.nameKo))
        : east ? cities.find(c => /osaka|오사카/i.test(c.id + c.nameKo)) : null;
      if (!city) return;
      const area = visibleArea();
      if (!area || area.bottom - area.top < 120 || area.right - area.left < 150) return;
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'overseas-edge-hint';
      button.textContent = west ? '← 中国 · 상하이' : '日本 · 오사카·교토 →';
      button.setAttribute('aria-label', (west ? '중국 상하이' : '일본 오사카') + ' 여행 코스 보기. 지리적 위치 표식이 아닌 지도 탐험 버튼');
      button.addEventListener('click', () => { if (visible && typeof onCitySelect === 'function') onCitySelect(city.id); });
      edgeNode.appendChild(button);
      Object.assign(edgeNode.style, { position: 'absolute', left: (area.left + 8) + 'px',
        top: (area.top + 10) + 'px', width: (area.right - area.left - 16) + 'px',
        display: 'flex', justifyContent: west ? 'flex-start' : 'flex-end', pointerEvents: 'none' });
      edgeNode.hidden = false;
    }
    function updateLabels() {
      if (!visible || destroyed) return;
      const clusters = [];
      for (const city of cities) {
        const bounds = map.getBounds?.();
        if (!geographicLabelsVisible() || (bounds && !bounds.contains([city.lat, city.lon]))) continue;
        const point = map.latLngToContainerPoint?.([city.lat, city.lon]);
        const near = point && clusters.find(cluster => cluster.point && Math.hypot(cluster.point.x - point.x, cluster.point.y - point.y) < 85);
        if (near) near.cities.push(city);
        else clusters.push({ point, cities: [city] });
      }
      const signature = clusters.map(cluster => cluster.cities.map(city => city.id + ':' + cityLabel(city)).join('|')).join(';');
      // Leaflet already moves existing markers with the map. Keep their DOM while
      // panning/zooming unless membership or language actually changes.
      if (signature !== citySignature) {
        citySignature = signature;
        group.clearLayers(); cityMarkers.length = 0;
        for (const cluster of clusters) {
        const xs = cluster.cities, single = xs.length === 1;
        const point = [xs.reduce((n, c) => n + c.lat, 0) / xs.length, xs.reduce((n, c) => n + c.lon, 0) / xs.length];
        const text = single ? cityLabel(xs[0]) : xs.map(c => map.getZoom() < LABEL_ZOOM ? c.nameLocal : c.nameKo).join(' · ');
        const title = xs.map(c => c.nameKo).join(' · ') + (single ? ' 여행 코스 보기' : ' 확대해서 고르기');
        const marker = L.marker(point, { pane: pinPaneName, title, alt: title, keyboard: true, icon: icon(text, 'city') }).addTo(group);
        marker.on('click', () => {
          if (!visible) return;
          if (single) { if (typeof onCitySelect === 'function') onCitySelect(xs[0].id); }
          else {
            const padding = typeof options.getPadding === 'function' ? options.getPadding() : { padding: [72, 72] };
            map.fitBounds(L.latLngBounds(xs.map(c => [c.lat, c.lon])), { ...padding, maxZoom: 10, animate: false });
          }
        });
        cityMarkers.push({ marker, city: single ? xs[0] : null });
        }
      }
      for (const entry of countryMarkers) {
        const { marker, country } = entry;
        const text = map.getZoom() < LABEL_ZOOM || country.ko === country.name ? country.name : country.ko + '\n' + country.name;
        if (entry.text !== text) { marker.setIcon(icon(text, 'country')); entry.text = text; }
      }
      if (geographicLabelsVisible() && map.getZoom() < 7) { if (!map.hasLayer(fallback)) fallback.addTo(map); }
      else if (map.hasLayer(fallback)) map.removeLayer(fallback);
      updateEdgeHint();
    }
    map.on('zoomend moveend resize', updateLabels);

    function coastStyle(){return document.documentElement.dataset.theme==='dark'?{color:'#4b6477',weight:0.8,fillColor:'#263c50',fillOpacity:1}:{color:'#a5ad9b',weight:0.8,fillColor:'#e7e7d8',fillOpacity:1};}
    async function showCoast() {
      if (!visible || destroyed || lastStatus === 'ready') return;
      if (coastLayer) { coastLayer.setStyle(coastStyle());if (!map.hasLayer(coastLayer)) coastLayer.addTo(map); return; }
      if (coastController) return;
      const request = new AbortController(); coastController = request;
      coastTimer = setTimeout(() => request.abort(), TIMEOUT);
      try {
        if (!coastData) {
          const response = await fetch(new URL('data/world-land.json', SCRIPT_BASE).href, { signal: request.signal, credentials: 'same-origin' });
          if (!response.ok) throw new Error('Local coast unavailable');
          coastData = await response.json();
        }
        if (!visible || destroyed || request.signal.aborted || lastStatus === 'ready') return;
        coastLayer = L.geoJSON(coastData, { pane: coastPaneName, interactive: false,
          style: coastStyle() }).addTo(map);
      } catch (_) {
        // City markers and course lists remain usable even if the local coast is unavailable.
      } finally {
        if (coastController === request) { clearTimeout(coastTimer); coastTimer = null; coastController = null; }
      }
    }

    function clearTimer() { if (timeout !== null) { clearTimeout(timeout); timeout = null; } }
    function removeVector() {
      if (contextCanvas && contextLostHandler) contextCanvas.removeEventListener('webglcontextlost', contextLostHandler);
      if (gl && glErrorHandler) gl.off('error', glErrorHandler);
      contextCanvas = null; contextLostHandler = null; glErrorHandler = null;
      // Adapter 0.1.4 can throw during removal after a refused WebGL context.
      if (layer) {
        try { map.removeLayer(layer); }
        catch (_) {
          // Only use the emergency path if the adapter did not finish disposing GL.
          const stranded = layer.getMaplibreMap?.() || gl;
          if (stranded && !stranded._removed) { try { stranded.remove(); } catch (_) {} }
        }
      }
      layer = null; gl = null;
      pane.replaceChildren();
      map.attributionControl?.removeAttribution(ATTRIBUTION);
    }
    function showFallback(token, message) {
      if (!visible || !basemapAllowed || destroyed || token !== generation) return;
      clearTimer(); controller?.abort(); controller = null;
      removeVector();
      if (geographicLabelsVisible() && map.getZoom() < 7 && !map.hasLayer(fallback)) fallback.addTo(map);
      status('fallback', message || '배경지도를 받지 못했어요. 도시를 고르면 준비한 코스는 볼 수 있어요.');
      void showCoast();
    }
    async function loadVector(token) {
      if (!visible || !basemapAllowed || destroyed || token !== generation) return;
      status('loading', '해외 배경지도를 불러오는 중이에요.');
      controller = new AbortController();
      const requestController = controller;
      const theme = document.documentElement?.dataset.theme === 'dark' ? 'dark' : 'liberty';
      timeout = setTimeout(() => showFallback(token), TIMEOUT);
      try {
        await ensureVendor(L);
        if (!visible || !basemapAllowed || destroyed || token !== generation || requestController.signal.aborted) return;
        if (!styleCache.has(theme)) {
          const response = await fetch('https://tiles.openfreemap.org/styles/' + theme, { signal: requestController.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
          if (!response.ok) throw new Error('Vector style unavailable');
          styleCache.set(theme, localizeStyle(await response.json(), cities, options.domesticGeometry));
        }
        if (!visible || !basemapAllowed || destroyed || token !== generation || requestController.signal.aborted) return;
        layer = L.maplibreGL({
          style: styleCache.get(theme), pane: paneName, interactive: false, attributionControl: false,
          canvasContextAttributes: { failIfMajorPerformanceCaveat: true },
          localIdeographFontFamily: 'sans-serif', renderWorldCopies: false,
          transformRequest: url => ({ url, credentials: 'omit' })
        });
        layer.addTo(map);
        gl = layer.getMaplibreMap();
        if (!gl) throw new Error('Vector renderer unavailable');
        // This particular Android emulator software driver reports a healthy context
        // but produces an empty composed frame. Do not block ordinary software GPUs.
        let unsupportedEmulator = false;
        try {
          const canvas = gl.getCanvas();
          const context = canvas.getContext?.('webgl2') || canvas.getContext?.('webgl');
          const debug = context?.getExtension('WEBGL_debug_renderer_info');
          const renderer = debug ? String(context.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : '';
          unsupportedEmulator = /^Android Emulator/.test(renderer) && /SwiftShader|lavapipe/i.test(renderer);
        } catch (_) { /* Missing diagnostics must not disable a working map. */ }
        if (unsupportedEmulator) {
          showFallback(token, '이 환경에서는 기본 지도로 보여드려요. 코스와 저장은 계속 쓸 수 있어요.');
          return;
        }
        map.attributionControl?.addAttribution(ATTRIBUTION);
        let loaded = false;
        glErrorHandler = event => {
          // A single unavailable tile after startup is recoverable by MapLibre.
          // Failed initial styles/sources and renderer failures still need fallback.
          if (loaded && event?.sourceId) return;
          showFallback(token);
        };
        gl.on('error', glErrorHandler);
        contextCanvas = gl.getCanvas();
        contextLostHandler = event => { event.preventDefault(); showFallback(token); };
        contextCanvas.addEventListener('webglcontextlost', contextLostHandler);
        gl.once('load', () => {
          if (!visible || !basemapAllowed || destroyed || token !== generation || !gl) return;
          loaded = true;
          clearTimer();
          if (coastLayer && map.hasLayer(coastLayer)) map.removeLayer(coastLayer);
          // Local country labels stay authoritative even when vector tiles work.
          status('ready', '확대하면 제공되는 한국어 지명을 현지어와 함께 보여줘요.');
        });
      } catch (_) { showFallback(token); }
    }
    function setVisible(value, visibilityOptions) {
      const nextVisible = Boolean(value);
      const nextAllowed = visibilityOptions && Object.hasOwn(visibilityOptions, 'basemap')
        ? Boolean(visibilityOptions.basemap) : basemapAllowed;
      if (destroyed) return;
      if (visible === nextVisible && basemapAllowed === nextAllowed) {
        if (visible) updateLabels();
        return;
      }
      visible = nextVisible; basemapAllowed = nextAllowed; generation++;
      clearTimer(); controller?.abort(); controller = null; removeVector();
      if (visible) {
        group.addTo(map); fallback.addTo(map); updateLabels();
        status(basemapEnabled && basemapAllowed ? 'loading' : 'preview', '도시를 고르면 준비한 해외 코스를 볼 수 있어요.');
        void showCoast();
        if (basemapEnabled && basemapAllowed) void loadVector(generation);
      } else {
        clearTimer(); controller?.abort(); controller = null;
        coastController?.abort(); coastController = null; clearTimeout(coastTimer); coastTimer = null;
        if (coastLayer && map.hasLayer(coastLayer)) map.removeLayer(coastLayer);
        map.removeLayer(group); map.removeLayer(fallback);
        if (edgeNode) { edgeNode.hidden = true; edgeNode.replaceChildren(); }
        status('hidden', '');
      }
    }
    function enableBasemap() {
      if (destroyed) return;
      const wasEnabled = basemapEnabled;
      basemapEnabled = true;
      if (visible && basemapAllowed && (!wasEnabled || lastStatus === 'fallback')) {
        generation++; clearTimer(); controller?.abort(); removeVector();
        void loadVector(generation);
      }
    }
    function disableBasemap(){if(destroyed)return;basemapEnabled=false;generation++;clearTimer();controller?.abort();controller=null;removeVector();status('preview','상세지도를 껐어요. 도시와 코스는 계속 볼 수 있어요.');if(visible)void showCoast();}
    const themeObserver = typeof global.MutationObserver === 'function' ? new global.MutationObserver(() => {
      coastLayer?.setStyle(coastStyle());
      if (!visible || !basemapAllowed || !basemapEnabled || destroyed) return;
      generation++; clearTimer(); controller?.abort(); controller = null; removeVector();
      status('loading', '화면에 맞는 배경지도를 불러오는 중이에요.');
      void showCoast(); void loadVector(generation);
    }) : null;
    if (themeObserver && document.documentElement) themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    function focusCity(cityId) {
      const city = byId.get(cityId);
      if (!city || destroyed) return false;
      setVisible(true, { basemap: true });
      const reduce = typeof global.matchMedia === 'function' && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const padding = typeof options.getPadding === 'function' ? options.getPadding() : { padding: [72, 72] };
      map.fitBounds(L.latLng(city.lat, city.lon).toBounds(10000), { ...padding, maxZoom: 10, animate: !reduce });
      return true;
    }
    function destroy() {
      if (destroyed) return;
      setVisible(false); destroyed = true; generation++;
      themeObserver?.disconnect();
      map.off('zoomend moveend resize', updateLabels); group.clearLayers(); fallback.clearLayers();
      edgeControl?.remove();
    }
    return Object.freeze({ setVisible, focusCity, enableBasemap, disableBasemap, destroy });
  }
  global.JippiOverseasMap = Object.freeze({ create });
})(window);

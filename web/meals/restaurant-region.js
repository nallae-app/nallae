// 승인된 위치를 공개 행정경계와 기기 안에서 대조한다. 주소나 좌표를 요청에 싣지 않는다.
(() => {
  'use strict';
  let boundaries;

  function containsPoint(geometry, [lon, lat]) {
    if (!geometry || !Number.isFinite(lon) || !Number.isFinite(lat)) return false;
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] :
      geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
    return polygons.some(polygon => {
      let inside = false;
      for (const ring of polygon) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [x1, y1] = ring[j], [x2, y2] = ring[i];
          const cross = (lon - x1) * (y2 - y1) - (lat - y1) * (x2 - x1);
          if (Math.abs(cross) < 1e-12 &&
            lon >= Math.min(x1, x2) && lon <= Math.max(x1, x2) &&
            lat >= Math.min(y1, y2) && lat <= Math.max(y1, y2)) return false;
          if ((y1 > lat) !== (y2 > lat) && lon < (x2 - x1) * (lat - y1) / (y2 - y1) + x1) inside = !inside;
        }
      }
      return inside;
    });
  }

  async function loadBoundaries() {
    const controller = new AbortController();
    let timeout;
    const deadline = new Promise((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new Error('행정경계 응답 시간 초과'));
      }, 6000);
    });
    try {
      const data = fetch('data/regions.json', { signal: controller.signal }).then(response => {
        if (!response.ok) throw new Error('행정경계를 불러오지 못했습니다.');
        return response.json();
      });
      const decoder = globalThis.topojson || import('../vendor/topojson-client.min.js');
      const [topology] = await Promise.race([Promise.all([data, decoder]), deadline]);
      return globalThis.topojson.feature(topology, topology.objects.sgg).features;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function find(point) {
    if (!Number.isFinite(point?.lat) || !Number.isFinite(point?.lon)) return null;
    if (!boundaries) boundaries = loadBoundaries().catch(() => {
      boundaries = undefined;
      return [];
    });
    const features = await boundaries;
    return features.find(f => containsPoint(f.geometry, [point.lon, point.lat]))?.properties.code || null;
  }

  globalThis.JippiRestaurantRegion = Object.freeze({ containsPoint, find });
})();

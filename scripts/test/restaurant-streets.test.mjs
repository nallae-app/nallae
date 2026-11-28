import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const base=new URL('../../web/data/',import.meta.url);
const json=name=>JSON.parse(readFileSync(new URL(name+'.json',base),'utf8'));
test('공식 OSM 도로를 식당 반경 안으로 제한하고 모든 확인 좌표가 있는 지역을 제공한다',()=>{
  const catalog=[...json('places').items,...json('heritage-restaurants').items];
  const points={...json('meal-restaurant-coordinates').items,...json('place-locations').items};
  const groups=new Map();
  for (const place of catalog) {
    const p=points[place.id];
    if (!p) continue;
    if (!groups.has(place.sgg)) groups.set(place.sgg,[]);
    groups.get(place.sgg).push({lat:p.lat,lon:p.lon,scale:Math.cos(p.lat*Math.PI/180),near:false});
  }
  const source=json('restaurant-streets/source');
  assert.deepEqual(source.districts,[...groups.keys()].sort());
  assert.equal(source.license,'https://opendatacommons.org/licenses/odbl/1-0/');
  assert.match(source.extract,/^https:\/\/download\.geofabrik\.de\/asia\/south-korea-\d{6}-free\.shp\.zip$/);
  let lineCount=0;
  for (const [code,stores] of groups) {
    const {version, attribution, license, roads}=json('restaurant-streets/'+code);
    assert.equal(version,1);
    assert.equal(license,source.license);
    assert.match(attribution,/OpenStreetMap contributors/);
    assert.ok(roads.length>0);
    for (const [kind,name,coords] of roads) {
      assert.ok(['major','local','path'].includes(kind));
      assert.equal(typeof name,'string');
      assert.ok(coords.length>=2);
      for (const [lon,lat] of coords) {
        let inCoverage=false;
        for (const p of stores) {
          const dx=(lon-p.lon)*p.scale*111195,dy=(lat-p.lat)*111195;
          const d2=dx*dx+dy*dy;
          if (d2<=1003**2) {inCoverage=true;p.near=true;}
        }
        assert.ok(inCoverage,'범위 밖 도로 '+code);
      }
    }
    assert.ok(stores.every(p=>p.near),'도로가 없는 식당 지도 '+code);
    lineCount+=roads.length;
  }
  assert.equal(lineCount,source.lineCount);
});

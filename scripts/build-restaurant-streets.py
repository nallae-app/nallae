#!/usr/bin/env python3
"""Build local street maps from the Geofabrik South Korea roads shapefile.

Install pyshp 3.x, shapely 2.x and numpy. Extract gis_osm_roads_free_1.{shp,shx,dbf,cpg}
from the dated archive below, then run:
    python scripts/build-restaurant-streets.py /path/to/gis_osm_roads_free_1.shp
For a newer extract, supply its dated --archive URL.
"""
import argparse
from collections import defaultdict
import json
import math
import mmap
from pathlib import Path
import struct

import numpy as np
import shapefile
import shapely
from shapely.geometry import Polygon, shape

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'web/data'
ARCHIVE = 'https://download.geofabrik.de/asia/south-korea-261127-free.shp.zip'
LICENSE = 'https://opendatacommons.org/licenses/odbl/1-0/'
RADIUS_METERS = 1000
MAJOR = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary'}
LOCAL = {'residential', 'unclassified', 'living_street', 'road'}


def load(name):
    return json.loads((DATA / (name + '.json')).read_text())['items']


def coverage(radius):
    places = {p['id']: p for key in ('places', 'heritage-restaurants') for p in load(key)}
    coords = {**load('meal-restaurant-coordinates'), **load('place-locations')}
    groups = defaultdict(list)
    for place_id, point in coords.items():
        p = places[place_id]
        lat, lon = point['lat'], point['lon']
        y_radius = radius / 111195
        x_radius = y_radius / math.cos(math.radians(lat))
        ring = [(lon + x_radius * math.cos(i * math.tau/48),
                 lat + y_radius * math.sin(i * math.tau/48)) for i in range(48)]
        groups[p['sgg']].append(Polygon(ring))
    return {code: shapely.union_all(polys) for code, polys in groups.items()}


def road_kind(fclass, name):
    if fclass.removesuffix('_link') in MAJOR:
        return 'major'
    if fclass in LOCAL or (name and fclass == 'service'):
        return 'local'
    if fclass == 'pedestrian' or fclass in {'service', 'footway', 'path', 'cycleway', 'steps'}:
        return 'path'
    return None


def line_parts(geom):
    if geom.geom_type == 'LineString' and not geom.is_empty:
        yield geom
    elif geom.geom_type in ('GeometryCollection', 'MultiLineString'):
        for part in geom.geoms:
            yield from line_parts(part)


def generate(source, output, archive):
    zones = coverage(RADIUS_METERS)
    access_zones = coverage(220)
    codes = sorted(zones)
    # Index the individual coverage islands. This avoids treating the entire
    # rectangle between two restaurants as relevant to the drawing.
    islands, owners = [], []
    for code in codes:
        parts = shapely.get_parts(zones[code])
        islands.extend(parts); owners.extend([code] * len(parts))
    tree = shapely.STRtree(islands)
    streets = {code: defaultdict(list) for code in codes}
    # SHX offsets point to each polyline's SHP record header. Read the four
    # standard bounding-box doubles first, decoding geometry/DBF only near a store.
    offsets = np.fromfile(source.with_suffix('.shx'), dtype='>u4', offset=100)[::2].astype(np.int64) * 2
    with source.open('rb') as fh, mmap.mmap(fh.fileno(), 0, access=mmap.ACCESS_READ) as shp, shapefile.Reader(str(source)) as reader:
        for start in range(0, len(offsets), 8192):
            batch = offsets[start:start+8192]
            boxes = [struct.unpack_from('<4d', shp, int(off)+12) for off in batch]
            pairs = tree.query(shapely.box(*np.array(boxes).T))
            candidates = defaultdict(set)
            for row, island in pairs.T:
                candidates[start + int(row)].add(owners[island])
            for idx, districts in candidates.items():
                rec = reader.record(idx, fields=['fclass', 'name'])
                name = (rec['name'] or '').strip()
                kind = road_kind(rec['fclass'], name)
                if not kind: continue
                geom = shape(reader.shape(idx).__geo_interface__)
                # Retain fine unnamed access paths in the final 220m near a store,
                # where campus and shopping-centre buildings may be off a main street.
                clip = access_zones if kind == 'path' and not name and rec['fclass'] != 'pedestrian' else zones
                for code in districts:
                    clipped = geom.intersection(clip[code])
                    streets[code][(kind,name)].extend(line_parts(clipped))
    output.mkdir(parents=True, exist_ok=True)
    total = 0
    for code, groups in streets.items():
        roads = []
        for (kind,name), pieces in sorted(groups.items()):
            if not pieces: continue
            # Join touching segments only if their class and actual OSM name agree.
            joined = shapely.line_merge(shapely.multilinestrings(pieces))
            for line in line_parts(joined):
                vertices = line.simplify(0.000045, preserve_topology=False).coords
                coords = []
                for x,y in vertices:
                    point = [round(x,5),round(y,5)]
                    if not coords or coords[-1] != point: coords.append(point)
                if len(coords) >= 2: roads.append([kind,name,coords])
        doc = {'version':1,'attribution':'© OpenStreetMap contributors','license':LICENSE,'roads':roads}
        (output/(code+'.json')).write_text(json.dumps(doc,ensure_ascii=False,separators=(',',':'))+'\n')
        total += len(roads)
    meta = {'version':1,'source':'© OpenStreetMap contributors','copyright':'https://www.openstreetmap.org/copyright',
            'license':LICENSE,'extract':archive,'radiusMeters':RADIUS_METERS,'unnamedAccessRadiusMeters':220,
            'description':'대한민국 Geofabrik 도로 추출본을 지삐 수록 식당·건물 주변으로 잘라 단순화한 파생 데이터베이스.',
            'districts':codes, 'lineCount':total}
    (output/'source.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2)+'\n')
    print(f'{len(codes)} districts, {total:,} road lines')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',type=Path)
    parser.add_argument('--output',type=Path,default=DATA/'restaurant-streets')
    parser.add_argument('--archive',default=ARCHIVE)
    args=parser.parse_args()
    generate(args.source,args.output,args.archive)

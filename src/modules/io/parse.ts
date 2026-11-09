import { gpx, kml, tcx } from '@tmcw/togeojson';
import type { Coord } from '../../lib/geo/polyline';
import type { LngLat } from '../../model/types';
import { isBackup, type Backup } from './backup';
import { parseGoogleList, type UnlocatedPlace } from './google';

export interface ParsedTrack {
  name: string;
  /** Continuous pieces (e.g. GPX `trkseg`); timestamps are dropped, elevation kept. */
  parts: Coord[][];
}

export interface ParsedWaypoint {
  name: string;
  desc: string;
  lngLat: LngLat;
  links: string[];
}

export interface ParsedArea {
  name: string;
  desc: string;
  /** Outer ring first, then holes; rings are open (no repeated first point). */
  polygon: LngLat[][];
  link?: string;
}

export interface ParsedFile {
  name: string;
  tracks: ParsedTrack[];
  waypoints: ParsedWaypoint[];
  /** Polygons, imported as avoid or risk zones. */
  areas?: ParsedArea[];
  backup?: Backup;
  /** Places from a Google Maps list whose link has no position. */
  unlocated?: UnlocatedPlace[];
  error?: string;
}

export const ACCEPTED = '.gpx,.kml,.tcx,.geojson,.json,.csv';

const baseName = (file: string) => file.replace(/\.[^.]+$/, '');

const coord = (c: number[]): Coord | null => {
  const [lng, lat, ele] = c;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return Number.isFinite(ele) ? [lng!, lat!, ele!] : [lng!, lat!];
};

const line = (cs: number[][]): Coord[] => cs.map(coord).filter((c): c is Coord => !!c);

function text(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (v && typeof v === 'object' && 'value' in v) return text((v as { value: unknown }).value);
  return '';
}

function links(props: Record<string, unknown>): string[] {
  const out = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v === 'string' && /^https?:\/\//.test(v)) out.add(v);
    else if (v && typeof v === 'object' && 'href' in v) add((v as { href: unknown }).href);
    else if (Array.isArray(v)) v.forEach(add);
  };
  add(props.link);
  add(props.links);
  add(props.url);
  return [...out];
}

/** Tracks and waypoints from GeoJSON (as produced by togeojson, or a plain GeoJSON file). */
export function fromGeoJSON(data: GeoJSON.GeoJSON<GeoJSON.Geometry | null>, fileName: string): Pick<ParsedFile, 'tracks' | 'waypoints' | 'areas'> {
  type F = GeoJSON.Feature<GeoJSON.Geometry | null>;
  const features: F[] = !data
    ? []
    : data.type === 'FeatureCollection'
      ? (data as GeoJSON.FeatureCollection<GeoJSON.Geometry | null>).features
      : data.type === 'Feature'
        ? [data as F]
        : [{ type: 'Feature', properties: {}, geometry: data as GeoJSON.Geometry }];
  const tracks: ParsedTrack[] = [];
  const waypoints: ParsedWaypoint[] = [];
  const areas: ParsedArea[] = [];
  const fallback = baseName(fileName);
  const ring = (r: number[][]): LngLat[] => {
    const pts = r.map(coord).filter((c): c is Coord => !!c).map((c) => [c[0], c[1]] as LngLat);
    const [a, z] = [pts[0], pts.at(-1)];
    return a && z && a[0] === z[0] && a[1] === z[1] ? pts.slice(0, -1) : pts;
  };
  const area = (rings: number[][][], props: Record<string, unknown>) => {
    const polygon = rings.map(ring).filter((r) => r.length >= 3);
    if (!polygon.length) return;
    areas.push({ name: text(props.name) || fallback, desc: text(props.desc ?? props.description), polygon, link: links(props)[0] });
  };

  const visit = (g: GeoJSON.Geometry | null, props: Record<string, unknown>) => {
    if (!g) return;
    const name = text(props.name);
    switch (g.type) {
      case 'LineString': {
        const part = line(g.coordinates);
        if (part.length >= 2) tracks.push({ name, parts: [part] });
        break;
      }
      case 'MultiLineString': {
        const parts = g.coordinates.map(line).filter((p) => p.length >= 2);
        if (parts.length) tracks.push({ name, parts });
        break;
      }
      case 'Point': {
        const c = coord(g.coordinates);
        if (c) waypoints.push({ name, desc: text(props.desc ?? props.description), lngLat: [c[0], c[1]], links: links(props) });
        break;
      }
      case 'Polygon':
        area(g.coordinates, props);
        break;
      case 'MultiPolygon':
        for (const p of g.coordinates) area(p, props);
        break;
      case 'GeometryCollection':
        for (const child of g.geometries) visit(child, props);
        break;
    }
  };
  for (const f of features) visit(f.geometry, (f.properties ?? {}) as Record<string, unknown>);

  tracks.forEach((tr, i) => {
    if (!tr.name) tr.name = tracks.length > 1 ? `${fallback} ${i + 1}` : fallback;
  });
  return { tracks, waypoints, areas };
}

export function parseFile(fileName: string, content: string): ParsedFile {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  try {
    if (ext === 'csv') {
      const list = parseGoogleList(content);
      if (!list) throw new Error('Not a Google Maps list (expected Title, Note and URL columns).');
      return { name: fileName, tracks: [], waypoints: list.waypoints, unlocated: list.unlocated };
    }
    if (ext === 'json' || ext === 'geojson') {
      const data = JSON.parse(content) as unknown;
      if (isBackup(data)) return { name: fileName, tracks: [], waypoints: [], backup: data };
      return { name: fileName, ...fromGeoJSON(data as GeoJSON.GeoJSON, fileName) };
    }
    const doc = new DOMParser().parseFromString(content, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Not a valid XML file.');
    const root = doc.documentElement.nodeName.toLowerCase();
    const fc = root === 'kml' ? kml(doc) : root === 'trainingcenterdatabase' ? tcx(doc) : gpx(doc);
    return { name: fileName, ...fromGeoJSON(fc, fileName) };
  } catch (err) {
    return { name: fileName, tracks: [], waypoints: [], error: err instanceof Error ? err.message : String(err) };
  }
}

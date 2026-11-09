import type { OsmCategory } from '../../config/pois';
import { tilePixel } from '../../lib/dem';
import type { LngLat } from '../../model/types';

/** Data is fetched and cached per tile of this zoom level (about 15 × 20 km in Europe). */
export const TILE_ZOOM = 11;

export interface OsmPlace {
  /** e.g. "node/123" */
  key: string;
  type: 'node' | 'way' | 'relation';
  id: number;
  lngLat: LngLat;
  tags: Record<string, string>;
  category: string;
}

export type Tile = `${number}/${number}`;

export function tileBounds(tile: Tile): { west: number; south: number; east: number; north: number } {
  const [x, y] = tile.split('/').map(Number) as [number, number];
  const n = 2 ** TILE_ZOOM;
  const lat = (yy: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * yy) / n))) * 180) / Math.PI;
  return { west: (x / n) * 360 - 180, east: ((x + 1) / n) * 360 - 180, north: lat(y), south: lat(y + 1) };
}

export function tileAt(lngLat: LngLat): Tile {
  const { x, y } = tilePixel(lngLat[0], lngLat[1], TILE_ZOOM);
  return `${x}/${y}`;
}

/** Tiles covering a bounding box. */
export function tilesInBounds(west: number, south: number, east: number, north: number, max = 64): Tile[] {
  const a = tilePixel(west, north, TILE_ZOOM);
  const b = tilePixel(east, south, TILE_ZOOM);
  const out: Tile[] = [];
  for (let x = a.x; x <= b.x; x++) for (let y = a.y; y <= b.y; y++) out.push(`${x}/${y}`);
  return out.slice(0, max);
}

/** Tiles a line passes through, plus their neighbours when the line runs close to an edge. */
export function tilesAlongLine(coords: readonly (readonly number[])[], marginM = 1500): Tile[] {
  const tiles = new Set<Tile>();
  const dLat = marginM / 110_574;
  for (let i = 0; i < coords.length; i++) {
    const [lng, lat] = coords[i] as [number, number];
    const dLng = marginM / (111_320 * Math.cos((lat * Math.PI) / 180));
    for (const [ox, oy] of [[0, 0], [-dLng, 0], [dLng, 0], [0, -dLat], [0, dLat]] as const) tiles.add(tileAt([lng + ox, lat + oy]));
    // Fill in tiles skipped by long straight edges.
    const next = coords[i + 1];
    if (next) {
      const steps = Math.ceil(Math.max(Math.abs(next[0]! - lng), Math.abs(next[1]! - lat)) / 0.05);
      for (let s = 1; s < steps; s++) tiles.add(tileAt([lng + ((next[0]! - lng) * s) / steps, lat + ((next[1]! - lat) * s) / steps]));
    }
  }
  return [...tiles];
}

export function buildQuery(tile: Tile, categories: OsmCategory[]): string {
  const { west, south, east, north } = tileBounds(tile);
  const bbox = [south, west, north, east].map((v) => v.toFixed(5)).join(',');
  const statements = categories.flatMap((c) => c.filters.map((f) => `${f}(${bbox});`));
  return `[out:json][timeout:25];(${statements.join('')});out center tags qt;`;
}

interface Element {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Overpass elements, each assigned to the first requested category it matches. */
export function parseElements(json: { elements?: Element[] }, categories: OsmCategory[]): OsmPlace[] {
  const out: OsmPlace[] = [];
  for (const el of json.elements ?? []) {
    const tags = el.tags ?? {};
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    const category = categories.find((c) => c.match(tags));
    if (lat === undefined || lon === undefined || !category) continue;
    out.push({ key: `${el.type}/${el.id}`, type: el.type, id: el.id, lngLat: [lon, lat], tags, category: category.id });
  }
  return out;
}

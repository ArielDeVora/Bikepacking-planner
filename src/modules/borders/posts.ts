import { cacheGet, cachePut } from '../../lib/cache';
import { distance } from '../../lib/geo/geo';
import { overpassQuery } from '../../lib/overpass';
import type { LngLat } from '../../model/types';

/** An OSM border control (`barrier=border_control`). */
export interface BorderPost {
  type: 'node' | 'way';
  id: number;
  lngLat: LngLat;
  name: string;
  tags: Record<string, string>;
  /** From the crossing it was found for, in metres. */
  distM: number;
}

const RADIUS_M = 8000;
const TTL_MS = 30 * 24 * 3600 * 1000;
const GAP_MS = 1500;

export function postsQuery([lng, lat]: LngLat): string {
  const around = `(around:${RADIUS_M},${lat.toFixed(5)},${lng.toFixed(5)})`;
  return `[out:json][timeout:25];(node${around}["barrier"="border_control"];way${around}["barrier"="border_control"];);out center tags;`;
}

interface Element {
  type: 'node' | 'way';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Border posts in an Overpass answer, nearest to `p` first. */
export function parsePosts(json: { elements?: unknown[] }, p: LngLat): BorderPost[] {
  return ((json.elements ?? []) as Element[])
    .flatMap((e) => {
      const lat = e.lat ?? e.center?.lat;
      const lon = e.lon ?? e.center?.lon;
      if (lat === undefined || lon === undefined) return [];
      const tags = e.tags ?? {};
      const lngLat: LngLat = [lon, lat];
      return [{ type: e.type, id: e.id, lngLat, name: tags['name:en'] ?? tags.name ?? '', tags, distM: distance(p, lngLat) }];
    })
    .sort((a, b) => a.distM - b.distM);
}

const memory = new Map<string, Promise<BorderPost[] | null>>();
let queue: Promise<unknown> = Promise.resolve();
let endpoint = 0;

/**
 * Border posts within 8 km of a crossing. One Overpass request at a time, cached for 30 days.
 * Null when Overpass couldn't be reached (try again later).
 */
export function postsNear(p: LngLat): Promise<BorderPost[] | null> {
  const key = `border|${p[0].toFixed(2)}|${p[1].toFixed(2)}`;
  let hit = memory.get(key);
  if (hit) return hit;
  hit = (async () => {
    const cached = await cacheGet<BorderPost[]>(key, TTL_MS);
    if (cached) return cached;
    const run = queue.then(async () => {
      const res = await overpassQuery(postsQuery(p), endpoint);
      endpoint = res.endpoint;
      await new Promise((r) => setTimeout(r, GAP_MS));
      return parsePosts(res.json, p);
    });
    queue = run.catch(() => {});
    try {
      const posts = await run;
      void cachePut(key, posts);
      return posts;
    } catch {
      memory.delete(key);
      return null;
    }
  })();
  memory.set(key, hit);
  return hit;
}

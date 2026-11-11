import type { Map as MapLibreMap, VectorTileSource } from 'maplibre-gl';
import type { TileId } from './tiles';

/** Where the service worker keeps map tiles (see scripts/sw-template.js). */
export const TILE_CACHE = 'map-tiles';
/** OpenFreeMap asks offline downloads to use at most 4 requests at a time. */
const PARALLEL = 4;

/** A tile's address without OpenFreeMap's weekly version, as the service worker stores it. */
export const tileKey = (url: string) => url.replace(/\/planet\/[^/]+\/(\d+\/\d+\/\d+\.pbf)$/, '/planet/$1');

/** Saving tiles works when the service worker serves them (production build, HTTPS or localhost). */
export const canSaveOffline = () => typeof caches !== 'undefined' && !!navigator.serviceWorker?.controller;

/** The base map's tile address template ({z}/{x}/{y}), once the map has loaded its style. */
export function tileTemplate(map: MapLibreMap): string | null {
  for (const [id, spec] of Object.entries(map.getStyle()?.sources ?? {})) {
    if (spec.type !== 'vector') continue;
    const tiles = (map.getSource(id) as VectorTileSource | undefined)?.tiles;
    const url = tiles?.find((u) => u.includes('openfreemap'));
    if (url) return url;
  }
  return null;
}

/** Downloads tiles not saved yet into the tile cache; returns how many were fetched. */
export async function saveTiles(
  template: string,
  tiles: TileId[],
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<number> {
  const cache = await caches.open(TILE_CACHE);
  let done = 0;
  let fetched = 0;
  const queue = [...tiles];
  const worker = async () => {
    for (let id = queue.shift(); id && !signal.aborted; id = queue.shift()) {
      const [z, x, y] = id.split('/');
      const url = template.replace('{z}', z!).replace('{x}', x!).replace('{y}', y!);
      const key = tileKey(url);
      if (!(await cache.match(key, { ignoreVary: true }))) {
        const res = await fetch(url, { signal }).catch(() => null);
        if (res?.ok) {
          await cache.put(key, res);
          fetched++;
        }
      }
      onProgress(++done, tiles.length);
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  return fetched;
}

/** Tiles kept for offline use, and roughly how much space they take. */
export async function savedTiles(): Promise<{ count: number; bytes: number | null }> {
  if (typeof caches === 'undefined') return { count: 0, bytes: null };
  const count = (await (await caches.open(TILE_CACHE)).keys()).length;
  const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
  return { count, bytes: estimate?.usage ?? null };
}

export async function clearTiles(): Promise<void> {
  if (typeof caches !== 'undefined') await caches.delete(TILE_CACHE);
}

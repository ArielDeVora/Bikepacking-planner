/**
 * Which map tiles to save for using the map offline along a route: a corridor along the line at
 * each zoom level, within OpenFreeMap's limits for one download (3,000 tiles or 50 MB).
 */

/** Tiles a download may take: well under OpenFreeMap's 3,000 tiles and 50 MB (tiles average ~25 kB). */
export const TILE_BUDGET = 1800;
/** Rough size of a vector tile, for estimates. */
export const TILE_KB = 25;

export type TileId = `${number}/${number}/${number}`;

export function tileAt(lng: number, lat: number, z: number): [number, number] {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const r = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return [Math.min(n - 1, Math.max(0, x)), Math.min(n - 1, Math.max(0, y))];
}

/** Tiles along a line at one zoom level, with `spread` tiles on each side (0: just the line's). */
export function corridor(coords: readonly (readonly number[])[], z: number, spread: number): Set<TileId> {
  const out = new Set<TileId>();
  const n = 2 ** z;
  const add = (x: number, y: number) => {
    for (let dx = -spread; dx <= spread; dx++)
      for (let dy = -spread; dy <= spread; dy++) {
        const tx = (x + dx + n) % n;
        const ty = y + dy;
        if (ty >= 0 && ty < n) out.add(`${z}/${tx}/${ty}`);
      }
  };
  for (let i = 0; i < coords.length; i++) {
    const [lng, lat] = coords[i]!;
    add(...tileAt(lng!, lat!, z));
    // Fill long edges so no tile along them is skipped (steps of a third of a tile).
    const next = coords[i + 1];
    if (!next) continue;
    const step = 360 / n / 3;
    const steps = Math.ceil(Math.max(Math.abs(next[0]! - lng!), Math.abs(next[1]! - lat!)) / step);
    for (let k = 1; k < steps; k++) add(...tileAt(lng! + ((next[0]! - lng!) * k) / steps, lat! + ((next[1]! - lat!) * k) / steps, z));
  }
  return out;
}

export interface TilePlan {
  tiles: TileId[];
  /** Highest zoom level saved. */
  maxZoom: number;
  /** Over the budget even without the closest zoom: save a shorter part. */
  tooBig: boolean;
}

/**
 * Tiles to save along a line: zooms 6 to 12 with a tile on each side, and 13 along the line itself,
 * leaving out zoom 13 (then 12) if that's more than the budget.
 */
export function planTiles(coords: readonly (readonly number[])[], budget = TILE_BUDGET): TilePlan {
  const levels = (max: number) => {
    const all = new Set<TileId>();
    for (let z = 6; z <= max; z++) for (const t of corridor(coords, z, z === 13 ? 0 : 1)) all.add(t);
    return [...all];
  };
  for (const max of [13, 12, 11]) {
    const tiles = levels(max);
    if (tiles.length <= budget) return { tiles, maxZoom: max, tooBig: false };
  }
  const tiles = levels(11);
  return { tiles, maxZoom: 11, tooBig: true };
}

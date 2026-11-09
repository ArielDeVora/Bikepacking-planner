import { TERRAIN_DEM } from '../config/terrain';

const TILE = 256;

/** Tile and pixel position of a point in the Web Mercator tile grid. */
export function tilePixel(lng: number, lat: number, z: number): { x: number; y: number; px: number; py: number } {
  const n = 2 ** z;
  const wrapped = ((((lng + 180) % 360) + 360) % 360) - 180;
  const fx = ((wrapped + 180) / 360) * n;
  const s = Math.sin((Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180);
  const fy = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  const x = Math.min(n - 1, Math.floor(fx));
  const y = Math.min(n - 1, Math.floor(fy));
  return { x, y, px: (fx - x) * TILE, py: (fy - y) * TILE };
}

/** Elevations in metres from Terrarium RGBA pixels: (R × 256 + G + B / 256) − 32768. */
export function decodeTerrarium(rgba: Uint8ClampedArray): Float32Array {
  const out = new Float32Array(rgba.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4]! * 256 + rgba[i * 4 + 1]! + rgba[i * 4 + 2]! / 256 - 32768;
  return out;
}

/** Bilinear interpolation inside one tile (edges are clamped). */
export function bilinear(grid: Float32Array, px: number, py: number): number {
  const x = Math.max(0, Math.min(TILE - 1.001, px - 0.5));
  const y = Math.max(0, Math.min(TILE - 1.001, py - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const at = (xx: number, yy: number) => grid[yy * TILE + xx]!;
  const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
  const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}

async function loadTile(url: string): Promise<Float32Array | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bitmap = await createImageBitmap(await res.blob());
    const canvas = new OffscreenCanvas(TILE, TILE);
    const g = canvas.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(bitmap, 0, 0);
    return decodeTerrarium(g.getImageData(0, 0, TILE, TILE).data);
  } catch {
    return null;
  }
}

/**
 * Elevation lookups from Terrarium tiles at a fixed zoom (z12 ≈ 30 m per pixel), with the
 * decoded tiles cached in memory.
 */
export class Dem {
  #tiles = new Map<string, Promise<Float32Array | null>>();

  constructor(
    private template: string,
    private zoom = 12,
    private cacheSize = 128,
    private load: (url: string) => Promise<Float32Array | null> = loadTile,
  ) {}

  #tile(x: number, y: number): Promise<Float32Array | null> {
    const key = `${x}/${y}`;
    let tile = this.#tiles.get(key);
    if (tile) {
      this.#tiles.delete(key);
    } else {
      const url = this.template.replace('{z}', String(this.zoom)).replace('{x}', String(x)).replace('{y}', String(y));
      tile = this.load(url);
    }
    this.#tiles.set(key, tile);
    if (this.#tiles.size > this.cacheSize) this.#tiles.delete(this.#tiles.keys().next().value!);
    return tile;
  }

  /** One elevation per point; NaN where no data could be loaded. */
  async sample(points: readonly (readonly number[])[]): Promise<number[]> {
    const pos = points.map((p) => tilePixel(p[0]!, p[1]!, this.zoom));
    const tiles = new Map<string, Promise<Float32Array | null>>();
    for (const { x, y } of pos) {
      const key = `${x}/${y}`;
      if (!tiles.has(key)) tiles.set(key, this.#tile(x, y));
    }
    const loaded = new Map<string, Float32Array | null>();
    await Promise.all([...tiles].map(async ([key, p]) => loaded.set(key, await p)));
    return pos.map(({ x, y, px, py }) => {
      const grid = loaded.get(`${x}/${y}`);
      return grid ? Math.round(bilinear(grid, px, py) * 10) / 10 : NaN;
    });
  }
}

/** Shared elevation lookups, so every module uses one tile cache. */
export const terrain = new Dem(TERRAIN_DEM.tiles[0]!);

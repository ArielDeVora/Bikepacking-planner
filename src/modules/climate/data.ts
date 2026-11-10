import { blendFor, cellIndex, colorAt, decodeByte, decodeTable, HEIGHT, inflate, undelta, WIDTH, type ClimateVar, type Scale } from './codec';

const cache = new Map<string, Promise<Uint8Array>>();

/** One variable's grid for one month (0–11), fetched once. */
export function loadMonth(variable: ClimateVar, month: number): Promise<Uint8Array> {
  const key = `${variable}-${String(month + 1).padStart(2, '0')}`;
  let p = cache.get(key);
  if (!p) {
    p = fetch(`./climate/${key}.bin`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then(inflate)
      .then((bytes) => undelta(bytes));
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

/** The value at a place on a day of the year (blended between months), or null (sea, no data). */
export async function valueAt(variable: ClimateVar, day: number, lng: number, lat: number): Promise<number | null> {
  const i = cellIndex(lng, lat);
  if (i === null) return null;
  const { a, b, w } = blendFor(day);
  const [ga, gb] = await Promise.all([loadMonth(variable, a), loadMonth(variable, b)]);
  const va = decodeByte(variable, ga[i]!);
  const vb = decodeByte(variable, gb[i]!);
  return va === null || vb === null ? null : va + (vb - va) * w;
}

export interface ClimateYear {
  tmax: (number | null)[];
  tmin: (number | null)[];
  ppt: (number | null)[];
}

/** The twelve monthly averages of each variable at a place. */
export async function yearAt(lng: number, lat: number): Promise<ClimateYear | null> {
  const i = cellIndex(lng, lat);
  if (i === null) return null;
  const read = (v: ClimateVar) => Promise.all(Array.from({ length: 12 }, (_, m) => loadMonth(v, m).then((g) => decodeByte(v, g[i]!))));
  const [tmax, tmin, ppt] = await Promise.all([read('tmax'), read('tmin'), read('ppt')]);
  return ppt.every((v) => v === null) && tmax.every((v) => v === null) ? null : { tmax, tmin, ppt };
}

export interface ClimateValues {
  tmax: number;
  tmin: number;
  ppt: number;
}

/**
 * Loads every month of every variable once, then answers lookups at once: the usual weather at
 * a place on a day of the year (0–364), or null at sea.
 */
export async function climateSampler(): Promise<(lng: number, lat: number, day: number) => ClimateValues | null> {
  const vars: ClimateVar[] = ['tmax', 'tmin', 'ppt'];
  const grids = await Promise.all(vars.map((v) => Promise.all(Array.from({ length: 12 }, (_, m) => loadMonth(v, m)))));
  return (lng, lat, day) => {
    const i = cellIndex(lng, lat);
    if (i === null) return null;
    const { a, b, w } = blendFor(day);
    const out: number[] = [];
    for (let k = 0; k < vars.length; k++) {
      const va = decodeByte(vars[k]!, grids[k]![a]![i]!);
      const vb = decodeByte(vars[k]!, grids[k]![b]![i]!);
      if (va === null || vb === null) return null;
      out.push(va + (vb - va) * w);
    }
    return { tmax: out[0]!, tmin: out[1]!, ppt: Math.max(0, out[2]!) };
  };
}

// Drawing ---------------------------------------------------------------------------------------

/** The map covers ±85.0511° in Web Mercator: a square. */
export const MAX_LAT = 85.0511287798066;
const SIZE = WIDTH;
const LUT_SIZE = 1024;

/** For each row of the Mercator canvas, the grid row at its latitude. */
const ROWS = (() => {
  const rows = new Int16Array(SIZE);
  for (let y = 0; y < SIZE; y++) {
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / SIZE))) * 180) / Math.PI;
    rows[y] = Math.min(HEIGHT - 1, Math.max(0, Math.floor(((90 - lat) / 180) * HEIGHT)));
  }
  return rows;
})();

/** Rain is coloured on a square-root axis, so dry and very wet places both get room. */
const axis = (variable: ClimateVar) => (variable === 'ppt' ? Math.sqrt : (v: number) => v);

/**
 * Draws one variable, blended between two months, onto a square Web Mercator canvas (one pixel
 * per grid column, sea transparent), shown on the map as an image.
 */
export class ClimateCanvas {
  readonly canvas: HTMLCanvasElement;
  #ctx: CanvasRenderingContext2D;
  #image: ImageData;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = SIZE;
    this.#ctx = this.canvas.getContext('2d')!;
    this.#image = this.#ctx.createImageData(SIZE, SIZE);
  }

  draw(variable: ClimateVar, scale: Scale, a: Uint8Array, b: Uint8Array, w: number): void {
    const dec = decodeTable(variable);
    const f = axis(variable);
    const lo = f(scale.stops[0]![0]);
    const hi = f(scale.stops.at(-1)![0]);
    const lut = new Uint8ClampedArray(LUT_SIZE * 4);
    for (let k = 0; k < LUT_SIZE; k++) {
      const x = lo + ((hi - lo) * k) / (LUT_SIZE - 1);
      lut.set(colorAt(scale, variable === 'ppt' ? x * x : x), k * 4);
    }
    const px = this.#image.data;
    const rain = variable === 'ppt';
    for (let y = 0; y < SIZE; y++) {
      const src = ROWS[y]! * WIDTH;
      let o = y * SIZE * 4;
      for (let x = 0; x < WIDTH; x++, o += 4) {
        const ba = a[src + x]!;
        const bb = b[src + x]!;
        if (!ba || !bb) {
          px[o + 3] = 0;
          continue;
        }
        const raw = dec[ba]! + (dec[bb]! - dec[ba]!) * w;
        const v = rain ? Math.sqrt(Math.max(0, raw)) : raw;
        const k = Math.min(LUT_SIZE - 1, Math.max(0, Math.round(((v - lo) / (hi - lo)) * (LUT_SIZE - 1)))) * 4;
        px[o] = lut[k]!;
        px[o + 1] = lut[k + 1]!;
        px[o + 2] = lut[k + 2]!;
        px[o + 3] = lut[k + 3]!;
      }
    }
    this.#ctx.putImageData(this.#image, 0, 0);
  }

  /** The drawing as an image URL (to revoke once replaced). */
  toUrl(): Promise<string> {
    return new Promise((resolve, reject) =>
      this.canvas.toBlob((blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error('Canvas export failed'))), 'image/png'),
    );
  }
}

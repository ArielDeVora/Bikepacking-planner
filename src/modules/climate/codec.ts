/**
 * The climate files written by scripts/fetch-climate.mjs: per variable and month, a 1/4° grid of
 * bytes (west to east from 180°W, north to south from 90°N), 0 where there is no data (sea).
 */

export type ClimateVar = 'tmax' | 'tmin' | 'ppt';

export const WIDTH = 1440;
export const HEIGHT = 720;
export const CELL = 360 / WIDTH;

/** Byte to physical value: °C for temperatures, mm per month for precipitation. Null: no data. */
export function decodeByte(variable: ClimateVar, b: number): number | null {
  if (!b) return null;
  return variable === 'ppt' ? ((b - 1) / 5.5) ** 2 : (b - 1) / 2 - 60;
}

/** Physical values for every byte, to decode a whole grid quickly. */
export function decodeTable(variable: ClimateVar): Float32Array {
  const out = new Float32Array(256);
  for (let b = 1; b < 256; b++) out[b] = decodeByte(variable, b)!;
  return out;
}

/** Undoes the row delta coding. */
export function undelta(bytes: Uint8Array, width = WIDTH): Uint8Array {
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = i % width === 0 ? bytes[i]! : (out[i - 1]! + bytes[i]!) & 255;
  return out;
}

export async function inflate(data: ArrayBuffer): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The grid cell of a position, or null outside the grid. */
export function cellIndex(lng: number, lat: number): number | null {
  const wrapped = ((((lng + 180) % 360) + 360) % 360) - 180;
  const row = Math.floor((90 - lat) / CELL);
  const col = Math.floor((wrapped + 180) / CELL);
  if (row < 0 || row >= HEIGHT || col < 0 || col >= WIDTH) return null;
  return row * WIDTH + col;
}

// Time of year -------------------------------------------------------------------------------

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MONTH_START = MONTH_DAYS.map((_, i) => MONTH_DAYS.slice(0, i).reduce((a, b) => a + b, 0));
/** The middle of each month, in days from 1 January (day 0). */
export const MONTH_MID = MONTH_DAYS.map((d, i) => MONTH_START[i]! + d / 2);
export const WEEKS = 52;

/** The day of the year (0–364) at the middle of a week (0–51). */
export const weekDay = (week: number) => Math.min(364, week * 7 + 3.5);

/** The week (0–51) of a date. */
export function weekOf(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const day = Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start) / 86_400_000);
  return Math.min(WEEKS - 1, Math.floor(Math.min(day, 364) / 7));
}

/**
 * The two monthly averages a day falls between, and how far towards the second (0–1): values for
 * a week are blended linearly between the middles of the months around it.
 */
export function blendFor(day: number): { a: number; b: number; w: number } {
  for (let i = 0; i < 12; i++) {
    const next = (i + 1) % 12;
    const from = MONTH_MID[i]!;
    const to = next ? MONTH_MID[next]! : MONTH_MID[0]! + 365;
    const d = day < MONTH_MID[0]! ? day + 365 : day;
    if (d >= from && d < to) return { a: i, b: next, w: (d - from) / (to - from) };
  }
  return { a: 0, b: 0, w: 0 };
}

// Colours ----------------------------------------------------------------------------------

export type Rgba = [number, number, number, number];

export interface Scale {
  /** Value at each stop, increasing; colours as [r, g, b, a] (0–255). */
  stops: [number, Rgba][];
  /** Ticks shown on the legend. */
  ticks: number[];
  unit: string;
}

export const TEMPERATURE: Scale = {
  stops: [
    [-30, [44, 26, 92, 230]],
    [-15, [59, 76, 192, 230]],
    [0, [143, 193, 232, 230]],
    [10, [191, 227, 180, 230]],
    [18, [246, 229, 141, 230]],
    [25, [248, 165, 66, 230]],
    [32, [228, 72, 44, 230]],
    [40, [139, 15, 43, 230]],
  ],
  ticks: [-20, -10, 0, 10, 20, 30, 40],
  unit: '°C',
};

export const PRECIPITATION: Scale = {
  stops: [
    [0, [246, 232, 195, 40]],
    [20, [237, 226, 160, 130]],
    [50, [199, 233, 180, 200]],
    [100, [127, 205, 187, 220]],
    [200, [65, 182, 196, 230]],
    [300, [29, 145, 192, 235]],
    [500, [34, 94, 168, 240]],
    [800, [37, 52, 148, 245]],
    [1200, [75, 15, 110, 250]],
  ],
  ticks: [0, 50, 100, 200, 300, 500, 800],
  unit: 'mm',
};

/** The colour of a value on a scale (linear between stops, clamped at the ends). */
export function colorAt(scale: Scale, v: number): Rgba {
  const { stops } = scale;
  if (v <= stops[0]![0]) return stops[0]![1];
  for (let i = 1; i < stops.length; i++) {
    const [x1, c1] = stops[i]!;
    if (v <= x1) {
      const [x0, c0] = stops[i - 1]!;
      const t = (v - x0) / (x1 - x0);
      return c0.map((c, k) => Math.round(c + (c1[k]! - c) * t)) as Rgba;
    }
  }
  return stops.at(-1)![1];
}

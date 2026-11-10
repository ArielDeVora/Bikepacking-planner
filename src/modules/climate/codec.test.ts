import { describe, expect, it } from 'vitest';
import { blendFor, cellIndex, colorAt, decodeByte, inflate, MONTH_MID, PRECIPITATION, TEMPERATURE, undelta, weekDay, weekOf, WIDTH } from './codec';

describe('climate files', () => {
  it('decodes the bytes written by the download script', () => {
    // Encoding in scripts/fetch-climate.mjs: temperatures 1 + round((c + 60) * 2), rain 1 + round(sqrt(mm) * 5.5).
    expect(decodeByte('tmax', 1 + Math.round((21.5 + 60) * 2))).toBe(21.5);
    expect(decodeByte('tmin', 1 + Math.round((-12 + 60) * 2))).toBe(-12);
    expect(decodeByte('ppt', 1 + Math.round(Math.sqrt(400) * 5.5))).toBeCloseTo(400, 0);
    expect(decodeByte('ppt', 0)).toBeNull();
  });

  it('undoes the row deltas and the deflate', async () => {
    const row = [0, 0, 10, 12, 255, 3];
    const delta = row.map((v, i) => (i ? (v - row[i - 1]!) & 255 : v));
    const stream = new Blob([Uint8Array.from([...delta, ...delta])]).stream().pipeThrough(new CompressionStream('deflate'));
    const packed = await new Response(stream).arrayBuffer();
    const out = undelta(await inflate(packed), 6);
    expect([...out]).toEqual([...row, ...row]);
  });

  it('finds the cell of a position', () => {
    expect(cellIndex(-180, 90)).toBe(0);
    expect(cellIndex(0.1, 0.1)).toBe(359 * WIDTH + 720);
    expect(cellIndex(360.1, 0.1)).toBe(cellIndex(0.1, 0.1));
    expect(cellIndex(0, -90.5)).toBeNull();
  });
});

describe('time of year', () => {
  it('blends between the months around a day', () => {
    expect(blendFor(MONTH_MID[6]!)).toEqual({ a: 6, b: 7, w: 0 });
    const mid = blendFor((MONTH_MID[6]! + MONTH_MID[7]!) / 2);
    expect(mid.a).toBe(6);
    expect(mid.w).toBeCloseTo(0.5);
    expect(blendFor(2)).toMatchObject({ a: 11, b: 0 });
    expect(blendFor(360)).toMatchObject({ a: 11, b: 0 });
  });

  it('turns dates into weeks and weeks into days', () => {
    expect(weekOf(new Date('2027-01-01'))).toBe(0);
    expect(weekOf(new Date('2027-07-15'))).toBe(27);
    expect(weekOf(new Date('2027-12-31'))).toBe(51);
    expect(weekDay(0)).toBe(3.5);
  });
});

describe('colour scales', () => {
  it('interpolates between stops and clamps at the ends', () => {
    expect(colorAt(TEMPERATURE, -50)).toEqual(TEMPERATURE.stops[0]![1]);
    expect(colorAt(TEMPERATURE, 100)).toEqual(TEMPERATURE.stops.at(-1)![1]);
    expect(colorAt(PRECIPITATION, 150)).toEqual([96, 194, 192, 225]);
  });
});

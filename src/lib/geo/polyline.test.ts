import { describe, expect, it } from 'vitest';
import { decodeLine, encodeLine } from './polyline';

describe('polyline codec', () => {
  it('round-trips 2D lines at 1e-5 precision', () => {
    const line: [number, number][] = [
      [2.35222, 48.85661],
      [-0.12776, 51.50735],
      [139.69171, 35.6895],
    ];
    expect(encodeLine(line)[0]).toBe('2');
    expect(decodeLine(encodeLine(line))).toEqual(line);
  });

  it('keeps elevation when every point has one', () => {
    const line: [number, number, number][] = [
      [7.0, 45.9, 1035.4],
      [7.001, 45.901, 1040.0],
      [7.002, 45.9, -12.3],
    ];
    const encoded = encodeLine(line);
    expect(encoded[0]).toBe('3');
    expect(decodeLine(encoded)).toEqual(line);
  });

  it('drops elevation if any point lacks it', () => {
    expect(decodeLine(encodeLine([[1, 2, 100], [3, 4]]))).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('handles empty lines and unwrapped longitudes', () => {
    expect(decodeLine(encodeLine([]))).toEqual([]);
    expect(decodeLine(encodeLine([[179.5, 50], [181.25, 51]]))).toEqual([
      [179.5, 50],
      [181.25, 51],
    ]);
  });
});

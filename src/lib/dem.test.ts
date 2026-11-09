import { describe, expect, it } from 'vitest';
import { bilinear, decodeTerrarium, Dem, tilePixel } from './dem';

describe('terrain tiles', () => {
  it('finds tiles and pixels', () => {
    expect(tilePixel(0, 0, 1)).toEqual({ x: 1, y: 1, px: 0, py: 0 });
    const t = tilePixel(7.6586, 45.9763, 12);
    expect([t.x, t.y]).toEqual([2135, 1457]);
    expect(t.px).toBeGreaterThanOrEqual(0);
    expect(t.px).toBeLessThan(256);
  });

  it('decodes Terrarium pixels', () => {
    // 4478 m: 4478 + 32768 = 37246 = 145 * 256 + 126.
    expect([...decodeTerrarium(new Uint8ClampedArray([145, 126, 0, 255, 128, 0, 128, 255]))]).toEqual([4478, 0.5]);
  });

  it('interpolates between pixels', () => {
    const grid = new Float32Array(256 * 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) grid[y * 256 + x] = x * 10;
    expect(bilinear(grid, 10.5, 3)).toBeCloseTo(100, 5);
    expect(bilinear(grid, 11, 3)).toBeCloseTo(105, 5);
  });

  it('samples points, loading each tile once', async () => {
    const urls: string[] = [];
    const dem = new Dem('t/{z}/{x}/{y}', 12, 8, async (url) => {
      urls.push(url);
      return url.endsWith('/1457') ? new Float32Array(256 * 256).fill(1000) : null;
    });
    const out = await dem.sample([
      [7.6586, 45.9763],
      [7.659, 45.977],
      [7.6586, -10],
    ]);
    expect(out.slice(0, 2)).toEqual([1000, 1000]);
    expect(out[2]).toBeNaN();
    expect(urls.filter((u) => u.endsWith('2135/1457'))).toHaveLength(1);
    await dem.sample([[7.6586, 45.9763]]);
    expect(urls).toHaveLength(2);
  });
});

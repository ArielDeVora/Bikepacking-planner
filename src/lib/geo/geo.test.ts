import { describe, expect, it } from 'vitest';
import { closestOnPolyline, distance, elevationGain, greatCircle, lineLength } from './geo';

describe('geo helpers', () => {
  it('measures distances', () => {
    // Paris to London, ~343.5 km.
    expect(distance([2.3522, 48.8566], [-0.1276, 51.5072]) / 1000).toBeCloseTo(343.5, 0);
    expect(lineLength([[0, 0], [1, 0], [1, 1]])).toBeCloseTo(2 * 111_195, -2);
  });

  it('builds great-circle arcs that bend towards the pole', () => {
    const arc = greatCircle([2.55, 49.01], [139.78, 35.55]);
    expect(arc[0]).toEqual([2.55, 49.01]);
    const end = arc.at(-1)!;
    expect(end[0]).toBeCloseTo(139.78, 6);
    expect(end[1]).toBeCloseTo(35.55, 6);
    expect(Math.max(...arc.map((c) => c[1]))).toBeGreaterThan(60);
  });

  it('unwraps longitudes across the antimeridian', () => {
    const arc = greatCircle([170, 50], [-170, 50]);
    for (let i = 1; i < arc.length; i++) expect(Math.abs(arc[i]![0] - arc[i - 1]![0])).toBeLessThan(10);
    expect(arc.at(-1)![0]).toBeCloseTo(190, 6);
  });

  it('ignores elevation noise below the threshold', () => {
    expect(elevationGain([100, 102, 99, 101, 100])).toEqual({ ascent: 0, descent: 0 });
    expect(elevationGain([100, 110, 120, 115, 100])).toEqual({ ascent: 20, descent: 20 });
    expect(elevationGain([])).toEqual({ ascent: 0, descent: 0 });
  });

  it('finds the closest point on a polyline', () => {
    const best = closestOnPolyline(
      [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      [12, 4],
    );
    expect(best).toEqual({ index: 1, point: [10, 4], dist: 2 });
  });
});

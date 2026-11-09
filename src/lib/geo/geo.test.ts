import { describe, expect, it } from 'vitest';
import { bbox, closestOnPolyline, densify, distance, distanceToLine, elevationGain, greatCircle, lineIntersectsPolygon, lineLength, pointInPolygon, segmentsIntersect, simplify } from './geo';

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

describe('simplify, densify, distanceToLine', () => {
  it('drops points on straight lines but keeps corners and climbs', () => {
    const line: [number, number, number][] = [];
    for (let i = 0; i <= 100; i++) line.push([7 + i * 0.0001, 45, 500]);
    for (let i = 1; i <= 100; i++) line.push([7.01, 45 + i * 0.0001, 500]);
    const out = simplify(line, 2);
    expect(out).toEqual([line[0], line[100], line[200]]);

    const hill: [number, number, number][] = [
      [7, 45, 500],
      [7.0005, 45, 560],
      [7.001, 45, 500],
    ];
    expect(simplify(hill, 2)).toHaveLength(3);
    expect(simplify([[1, 1], [1, 1], [2, 2]] as [number, number][])).toEqual([
      [1, 1],
      [2, 2],
    ]);
  });

  it('densifies straight lines', () => {
    const pts = densify([7, 45], [7.01, 45], 100);
    expect(pts[0]).toEqual([7, 45]);
    expect(pts.at(-1)).toEqual([7.01, 45]);
    expect(pts.length).toBeGreaterThanOrEqual(8);
    expect(densify([7, 45], [7, 45]).length).toBe(2);
  });

  it('measures the distance to a line', () => {
    expect(distanceToLine([7.005, 45.001], [[7, 45], [7.01, 45]])).toBeCloseTo(110.6, 0);
    expect(distanceToLine([7, 45], [[7, 45]])).toBe(0);
  });
});

describe('polygons', () => {
  const square: [number, number][][] = [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ],
    [
      [4, 4],
      [6, 4],
      [6, 6],
      [4, 6],
    ],
  ];

  it('tests points against polygons with holes', () => {
    expect(pointInPolygon([2, 2], square)).toBe(true);
    expect(pointInPolygon([5, 5], square)).toBe(false);
    expect(pointInPolygon([12, 5], square)).toBe(false);
  });

  it('detects lines entering polygons', () => {
    expect(lineIntersectsPolygon([[-5, 5], [15, 5]], square)).toBe(true);
    expect(lineIntersectsPolygon([[-5, -5], [-1, 20]], square)).toBe(false);
    expect(lineIntersectsPolygon([[2, 2], [3, 3]], square)).toBe(true);
    expect(lineIntersectsPolygon([[4.5, 4.5], [5.5, 5.5]], square)).toBe(false);
    expect(segmentsIntersect([0, 0], [2, 2], [0, 2], [2, 0])).toBe(true);
    expect(bbox([[1, 5], [3, -2]])).toEqual([1, -2, 3, 5]);
  });
});

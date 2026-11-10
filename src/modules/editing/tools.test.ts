import { describe, expect, it } from 'vitest';
import { encodeLine, type Coord } from '../../lib/geo/polyline';
import { segmentLength } from '../../model/edit-ops';
import type { Segment } from '../../model/types';
import { followPath } from './tools';

const seg = (coords: Coord[]): Segment => ({ legs: [{ line: encodeLine(coords) }] }) as unknown as Segment;

describe('follow path', () => {
  const mine = seg([[0, 45], [2, 45]]);
  const total = segmentLength(mine);

  it('takes the other segment’s stretch between the nearest points, in my direction', () => {
    const other = seg([[-1, 45.01], [0.5, 45.05], [1.5, 45.05], [3, 45.01]]);
    const path = followPath(mine, other, total / 4, (total * 3) / 4);
    expect(path[0]![0]).toBeCloseTo(0.5, 1);
    expect(path.at(-1)![0]).toBeCloseTo(1.5, 1);
    expect(path.every((c) => c[1] > 45.04)).toBe(true);
  });

  it('turns it round when the other segment runs the other way', () => {
    const other = seg([[3, 45.01], [1.5, 45.05], [0.5, 45.05], [-1, 45.01]]);
    const path = followPath(mine, other, total / 4, (total * 3) / 4);
    expect(path[0]![0]).toBeLessThan(path.at(-1)![0]);
  });
});

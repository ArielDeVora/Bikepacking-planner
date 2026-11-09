import { describe, expect, it } from 'vitest';
import type { Segment } from '../../model/types';
import { stage } from '../../test/fixtures';
import { computeStats } from './stats';

const seg = (mode: Segment['mode'], lengthM: number, ascentM: number, plannedDate?: string) =>
  ({ mode, stats: { lengthM, ascentM, descentM: 0 }, plannedDate }) as Segment;

describe('computeStats', () => {
  it('sums by mode, counts climb on bike and foot, and spans planned dates', () => {
    const s = computeStats(
      [stage('a', 'V', { plannedDate: '2027-03-15' }), stage('b', 'X', { plannedDate: '2027-03-20' })],
      [seg('train', 300_000, 900), seg('bike', 80_000, 1200), seg('bike', 60_000, 300, '2027-04-01'), seg('walk', 5_000, 100)],
    );
    expect(s.byMode.map((m) => [m.mode, m.lengthM, m.segments])).toEqual([
      ['bike', 140_000, 2],
      ['walk', 5_000, 1],
      ['train', 300_000, 1],
    ]);
    expect(s.lengthM).toBe(445_000);
    expect(s.ascentM).toBe(1600);
    expect(s.days).toEqual({ count: 18, from: '2027-03-15', to: '2027-04-01' });
  });

  it('has no days without planned dates', () => {
    expect(computeStats([stage('a', 'V')], []).days).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { buildSchedule, DEFAULT_SCHEDULE, type PlanSegment, type ScheduleSettings } from './schedule';

const bike = (id: string, km: number, ascentM = 0, over: Partial<PlanSegment> = {}): PlanSegment => ({ id, mode: 'bike', lengthM: km * 1000, ascentM, ...over });
const settings = (over: Partial<ScheduleSettings> = {}): ScheduleSettings => ({ ...DEFAULT_SCHEDULE, startDate: '2027-04-03', kmPerDay: 80, restEvery: 0, climbKm: 0, ...over });

describe('schedule', () => {
  it('rides a segment at the daily distance', () => {
    const s = buildSchedule([bike('a', 240)], settings());
    expect(s.days.map((d) => d.date)).toEqual(['2027-04-03', '2027-04-04', '2027-04-05']);
    expect(s.days.map((d) => d.parts[0]!.toKm)).toEqual([80, 160, 240]);
    expect(s.spans.get('a')).toMatchObject({ first: 0, last: 2, startKm: 0, endKm: 240 });
  });

  it('shares a day between segments, and leaves crumbs on the day before', () => {
    const s = buildSchedule([bike('a', 120), bike('b', 41), bike('c', 2)], settings());
    expect(s.days).toHaveLength(2);
    expect(s.days[1]!.parts.map((p) => p.segmentId)).toEqual(['a', 'b', 'c']);
    expect(s.spans.get('b')).toMatchObject({ first: 1, last: 1 });
  });

  it('counts climbing as extra distance', () => {
    const s = buildSchedule([bike('a', 160, 1600)], settings({ climbKm: 1 }));
    expect(s.days).toHaveLength(3); // 160 km + 16 km of climbing at 80 a day
  });

  it('takes a rest day after every few days of riding', () => {
    const s = buildSchedule([bike('a', 400)], settings({ restEvery: 2 }));
    expect(s.days.map((d) => d.kind)).toEqual(['ride', 'ride', 'rest', 'ride', 'ride', 'rest', 'ride']);
  });

  it('spends a whole day on each motorised journey, starting on a fresh day', () => {
    const s = buildSchedule([bike('a', 40), { id: 't', mode: 'train', lengthM: 900_000, ascentM: 0 }, bike('b', 80)], settings());
    expect(s.days.map((d) => d.kind)).toEqual(['ride', 'transport', 'ride']);
    expect(s.spans.get('t')).toMatchObject({ first: 1, last: 1 });
    const long = buildSchedule([{ id: 'f', mode: 'boat', lengthM: 1e6, ascentM: 0, days: 3 }], settings());
    expect(long.days.map((d) => d.kind)).toEqual(['transport', 'transport', 'transport']);
  });

  it('does not ride during rest periods', () => {
    const s = buildSchedule([bike('a', 240)], settings(), [{ from: '2027-04-04', to: '2027-04-05', name: 'Visa' }]);
    expect(s.days.map((d) => [d.date, d.kind, d.rest ?? ''])).toEqual([
      ['2027-04-03', 'ride', ''],
      ['2027-04-04', 'rest', 'Visa'],
      ['2027-04-05', 'rest', 'Visa'],
      ['2027-04-06', 'ride', ''],
      ['2027-04-07', 'ride', ''],
    ]);
  });

  it('waits for a fixed date, or says how late it is', () => {
    const wait = buildSchedule([bike('a', 80), bike('b', 80, 0, { fixed: '2027-04-06' })], settings());
    expect(wait.days.map((d) => d.kind)).toEqual(['ride', 'wait', 'wait', 'ride']);
    expect(wait.spans.get('b')).toMatchObject({ first: 3, fixed: '2027-04-06' });
    expect(wait.spans.get('b')!.late).toBeUndefined();
    const late = buildSchedule([bike('a', 400), bike('b', 80, 0, { fixed: '2027-04-04' })], settings());
    expect(late.spans.get('b')!.late).toBe(4);
  });

  it('starts on a rest period if the trip begins in one', () => {
    const s = buildSchedule([bike('a', 80)], settings(), [{ from: '2027-04-03', to: '2027-04-03', name: 'Party' }]);
    expect(s.days.map((d) => d.kind)).toEqual(['rest', 'ride']);
  });
});

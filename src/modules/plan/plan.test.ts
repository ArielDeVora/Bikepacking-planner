import { beforeEach, describe, expect, it } from 'vitest';
import { CommandStack } from '../../core/commands';
import { t } from '../../core/i18n';
import { TripStore } from '../../core/store';
import type { Group, Route, Segment } from '../../model/types';
import { stage, trip, TRIP_ID } from '../../test/fixtures';
import { addRestPeriodCommand, fixedDate, planPieces, planSchedule, planSegments, planSettings, planSources, restPeriods, setPartCommand, setScheduleCommand, TRIP_SOURCE } from './plan';
import type { PlanRow } from './rows';

let store: TripStore;
let commands: CommandStack;

const base = { tripId: TRIP_ID, updatedAt: 0, updatedBy: 'u1', deleted: false, notes: '' };
const seg = (id: string, stageId: string, order: string, over: Partial<Segment> = {}): Segment =>
  ({ ...base, id, type: 'segment', stageId, order, name: id, mode: 'bike', geomType: 'manual', anchors: [], legs: [], stats: { lengthM: 160_000, ascentM: 0, descentM: 0 }, ...over }) as Segment;

beforeEach(() => {
  store = new TripStore();
  const route: Route = { ...base, id: 'r1', type: 'route', order: 'a1', name: 'Plan B' };
  const group: Group = { ...base, id: 'g1', type: 'group', stageId: 's2', order: 'a1', name: 'G', plannedDate: '2027-05-01' };
  store.apply(
    [
      trip(),
      route,
      stage('s1', 'a0'),
      stage('s2', 'a2', { plannedDate: '2027-04-20' }),
      stage('s3', 'a1', { routeId: 'r1' }),
      group,
      seg('a', 's1', 'a1'),
      seg('b', 's2', 'a0'),
      seg('c', 's2', 'a2', { groupId: 'g1' }),
      seg('d', 's3', 'a1'),
    ],
    'load',
  );
  commands = new CommandStack(store, () => 'u1');
});

describe('planning a route', () => {
  it('offers the stages outside routes, then each route', () => {
    expect(planSources(store, t).map((s) => s.id)).toEqual([TRIP_SOURCE, 'r1']);
    expect(planSegments(store, TRIP_SOURCE).map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(planSegments(store, 'r1').map((s) => s.id)).toEqual(['d']);
  });

  it('takes fixed dates from segments, or from the first segment of a group or stage', () => {
    expect(fixedDate(store, store.get('a', 'segment')!)).toBeUndefined();
    expect(fixedDate(store, store.get('b', 'segment')!)).toBe('2027-04-20');
    expect(fixedDate(store, store.get('c', 'segment')!)).toBe('2027-05-01');
  });

  it('keeps settings and rest periods per route', () => {
    commands.run(setScheduleCommand(store, 'r1', { kmPerDay: 100 }, 'edit')!);
    expect(planSettings(store, 'r1').kmPerDay).toBe(100);
    expect(planSettings(store, TRIP_SOURCE).kmPerDay).toBe(80);
    const { command } = addRestPeriodCommand(store, { tripId: TRIP_ID, source: 'r1', from: '2027-04-10', to: '2027-04-05', name: 'Visa', label: 'add' });
    commands.run(command);
    expect(restPeriods(store, 'r1').map((r) => [r.from, r.to])).toEqual([['2027-04-05', '2027-04-10']]);
    expect(restPeriods(store, TRIP_SOURCE)).toEqual([]);
  });

  it('schedules the chosen route with its settings, fixed dates and rest periods', () => {
    const s = planSchedule(store, TRIP_SOURCE);
    expect(s.spans.get('b')!.first).toBe(17); // waits for 20 April from 3 April
    expect(s.spans.get('c')!.fixed).toBe('2027-05-01');
  });

  describe('line by line', () => {
    // Segment a (160 km) crosses two countries: 100 km in AA, then 60 km in BB.
    const rows = (): PlanRow[] => [
      { key: 'a:AA#0', part: 'AA#0', segmentId: 'a', stageId: 's1', name: 'a', mode: 'bike', country: { code: 'AA', name: 'AA' }, fromKm: 0, toKm: 100, mid: null },
      { key: 'a:BB#0', part: 'BB#0', segmentId: 'a', stageId: 's1', name: 'a', mode: 'bike', country: { code: 'BB', name: 'BB' }, fromKm: 100, toKm: 160, mid: null },
    ];

    it('schedules each line, with the segment’s settings shared out by length', () => {
      commands.run({ label: 'x', changes: [{ id: 'a', before: store.getRaw('a')!, after: { ...store.getRaw('a')!, planDays: 4 } as Segment }] });
      const pieces = planPieces(store, [store.get('a', 'segment')!], rows());
      expect(pieces.map((p) => [p.id, p.lengthM, p.days])).toEqual([
        ['a:AA#0', 100_000, 2.5],
        ['a:BB#0', 60_000, 1.5],
      ]);
    });

    it('gives a line its own fixed date, pace or days', () => {
      commands.run(setPartCommand(store, 'a', 'BB#0', { fixed: '2027-05-01', kmPerDay: 30 }, 'edit')!);
      const pieces = planPieces(store, [store.get('a', 'segment')!], rows());
      expect(pieces[1]).toMatchObject({ fixed: '2027-05-01', kmPerDay: 30 });
      const s = planSchedule(store, TRIP_SOURCE, rows());
      expect(s.spans.get('a:BB#0')).toMatchObject({ fixed: '2027-05-01' });
      commands.run(setPartCommand(store, 'a', 'BB#0', { fixed: undefined, kmPerDay: undefined }, 'clear')!);
      expect(store.get('a', 'segment')!.planParts).toBeUndefined();
    });
  });
});

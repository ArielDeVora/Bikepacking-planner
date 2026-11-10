import { beforeEach, describe, expect, it } from 'vitest';
import { CommandStack } from '../../core/commands';
import { t } from '../../core/i18n';
import { TripStore } from '../../core/store';
import type { Group, Route, Segment } from '../../model/types';
import { stage, trip, TRIP_ID } from '../../test/fixtures';
import { addRestPeriodCommand, fixedDate, planSchedule, planSegments, planSettings, planSources, restPeriods, setScheduleCommand, TRIP_SOURCE } from './plan';

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
});

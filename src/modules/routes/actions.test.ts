import { beforeEach, describe, expect, it } from 'vitest';
import { CommandStack } from '../../core/commands';
import { TripStore } from '../../core/store';
import { stage, trip } from '../../test/fixtures';
import { changeMode, createSegment, setProfile, setSnap } from './actions';

let store: TripStore;
let commands: CommandStack;

const profileOf = (s: { mode: string; profile?: string }) =>
  s.profile ?? ({ bike: 'trekking', walk: 'hiking-mountain' } as Record<string, string>)[s.mode];

function draw(stageId?: string, profile?: string) {
  const { command, segmentId } = createSegment(store, {
    tripId: 'trip-1',
    stageId,
    mode: 'bike',
    profile,
    points: [
      [0, 0],
      [1, 0],
    ],
    label: 'draw',
    segmentName: (n) => `S${n}`,
    stageName: 'Stage 1',
  });
  commands.run(command);
  return store.get(segmentId, 'segment')!;
}

beforeEach(() => {
  store = new TripStore();
  store.apply([trip()], 'load');
  commands = new CommandStack(store, () => 'u1');
});

describe('routes actions', () => {
  it('creates a stage when the trip has none', () => {
    const seg = draw();
    const stages = store.list('stage');
    expect(stages).toHaveLength(1);
    expect(seg.stageId).toBe(stages[0]!.id);
    commands.undo();
    expect(store.list('stage')).toHaveLength(0);
    expect(store.list('segment')).toHaveLength(0);
  });

  it('gives a new segment the chosen profile, else none (the mode default)', () => {
    expect(draw(undefined, 'gravel').profile).toBe('gravel');
    expect('profile' in draw()).toBe(false);
  });

  it('appends to the last stage, or the given one', () => {
    store.apply([stage('a', 'V'), stage('b', 'X')], 'load');
    expect(draw().stageId).toBe('b');
    const second = draw('a');
    expect(second.stageId).toBe('a');
    const third = draw('a');
    expect(third.order > second.order).toBe(true);
    expect(third.name).toBe('S2');
  });

  it('changes mode and redraws legs when the geometry type changes', () => {
    const seg = draw();
    commands.run(changeMode(store, seg, 'plane', profileOf, 'mode')!);
    const plane = store.get(seg.id, 'segment')!;
    expect(plane.geomType).toBe('greatCircle');
    expect(plane.legs[0]!.status).toBeUndefined();

    commands.run(changeMode(store, plane, 'bike', profileOf, 'mode')!);
    expect(store.get(seg.id, 'segment')!.legs[0]!.status).toBe('pending');
    expect(changeMode(store, store.get(seg.id, 'segment')!, 'bike', profileOf, 'mode')).toBeNull();
  });

  it('re-routes when the effective profile changes', () => {
    const routed = { ...draw() };
    store.apply([{ ...routed, legs: routed.legs.map((l) => ({ line: l.line })) }], 'load');
    const seg = store.get(routed.id, 'segment')!;
    const cmd = changeMode(store, seg, 'walk', profileOf, 'mode')!;
    expect((cmd.changes[0]!.after as typeof seg).legs[0]!.status).toBe('pending');
    const keep = changeMode(store, seg, 'car', () => 'trekking', 'mode')!;
    expect((keep.changes[0]!.after as typeof seg).legs[0]).toBe(seg.legs[0]);
  });

  it('toggles snapping and profile', () => {
    const seg = draw();
    commands.run(setSnap(store, seg, false, 'snap')!);
    expect(store.get(seg.id, 'segment')!.geomType).toBe('manual');
    expect(store.get(seg.id, 'segment')!.legs[0]!.status).toBeUndefined();
    expect(setSnap(store, store.get(seg.id, 'segment')!, false, 'snap')).toBeNull();

    commands.run(setSnap(store, store.get(seg.id, 'segment')!, true, 'snap')!);
    commands.run(setProfile(store, store.get(seg.id, 'segment')!, 'gravel', 'profile'));
    expect(store.get(seg.id, 'segment')!.profile).toBe('gravel');
  });
});

describe('imported segments', () => {
  it('keep their geometry when the mode changes', () => {
    const seg = draw();
    store.apply([{ ...seg, geomType: 'imported' }], 'load');
    const imported = store.get(seg.id, 'segment')!;
    commands.run(changeMode(store, imported, 'train', profileOf, 'mode')!);
    const after = store.get(seg.id, 'segment')!;
    expect(after.mode).toBe('train');
    expect(after.geomType).toBe('imported');
    expect(after.legs).toBe(imported.legs);
  });
});

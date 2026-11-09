import { beforeEach, describe, expect, it } from 'vitest';
import { CommandStack, edits } from '../../../core/commands';
import { TripStore } from '../../../core/store';
import { decodeLine } from '../../../lib/geo/polyline';
import { insertAnchor, moveAnchor } from '../../../model/segment';
import type { Segment } from '../../../model/types';
import { stage, trip } from '../../../test/fixtures';
import { createSegment } from '../actions';
import type { RouteRequest, RoutingProvider } from './provider';
import { RoutingError } from './provider';
import { RoutingQueue } from './queue';
import { createReconciler } from './reconcile';

let store: TripStore;
let commands: CommandStack;
let calls: RouteRequest[];
let fail: RoutingError | null;
let errors: RoutingError[];

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup() {
  const provider: RoutingProvider = {
    id: 'fake',
    label: 'Fake',
    profiles: { bike: [{ id: 'trekking', label: 'Trekking' }] },
    route: async (r) => {
      calls.push(r);
      if (fail) throw fail;
      return [
        [r.from[0], r.from[1], 100],
        [(r.from[0] + r.to[0]) / 2, 0.1, 150],
        [r.to[0], r.to[1], 100],
      ];
    },
  };
  const queue = new RoutingQueue(provider, { minGapMs: 0, sleep: async () => {} });
  const reconciler = createReconciler(store, commands, queue, (e) => errors.push(e));
  store.onChange(({ ids }) => reconciler.scan(ids.map((id) => store.get(id, 'segment')).filter((s) => !!s)));
  return reconciler;
}

function draw(points: [number, number][]): string {
  const { command, segmentId } = createSegment(store, {
    tripId: 'trip-1',
    mode: 'bike',
    points,
    label: 'draw',
    segmentName: (n) => `S${n}`,
    stageName: 'Stage',
  });
  commands.run(command);
  return segmentId;
}

const seg = (id: string) => store.get(id, 'segment')!;

beforeEach(() => {
  store = new TripStore();
  store.apply([trip(), stage('st', 'V')], 'load');
  commands = new CommandStack(store, () => 'u1');
  calls = [];
  fail = null;
  errors = [];
});

describe('reconciler', () => {
  it('routes pending legs without adding undo steps', async () => {
    setup();
    const id = draw([
      [0, 0],
      [1, 0],
    ]);
    await flush();
    expect(seg(id).legs[0]!.status).toBeUndefined();
    expect(seg(id).stats.ascentM).toBe(50);
    expect(calls).toHaveLength(1);

    commands.undo();
    expect(store.get(id)).toBeUndefined();
    commands.redo();
    await flush();
    expect(seg(id).legs[0]!.status).toBeUndefined();
    expect(calls).toHaveLength(1);
  });

  it('ignores results for legs that changed while waiting', async () => {
    setup();
    const id = draw([
      [0, 0],
      [1, 0],
    ]);
    commands.run({ label: 'move', changes: [edits.update<Segment>(store, id, moveAnchor(seg(id), 1, [2, 0]))] });
    await flush();
    const leg = seg(id).legs[0]!;
    expect(leg.status).toBeUndefined();
    expect(decodeLine(leg.line).at(-1)![0]).toBe(2);
    expect(calls.map((c) => c.to[0])).toEqual([1, 2]);
  });

  it('marks failed legs and reports the error', async () => {
    setup();
    fail = new RoutingError('noRoute', 'nothing');
    const id = draw([
      [0, 0],
      [1, 0],
    ]);
    await flush();
    expect(seg(id).legs[0]!.status).toBe('failed');
    expect(errors.map((e) => e.kind)).toEqual(['noRoute']);
  });

  it('routes only the new leg when a point is appended', async () => {
    setup();
    const id = draw([
      [0, 0],
      [1, 0],
    ]);
    await flush();
    commands.run({ label: 'add', changes: [edits.update<Segment>(store, id, insertAnchor(seg(id), 2, [2, 0]))] });
    await flush();
    expect(calls.map((c) => [c.from[0], c.to[0]])).toEqual([
      [0, 1],
      [1, 2],
    ]);
    expect(seg(id).legs.every((l) => !l.status)).toBe(true);
  });
});

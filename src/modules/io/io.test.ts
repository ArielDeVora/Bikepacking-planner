import { beforeEach, describe, expect, it } from 'vitest';
import { CommandStack } from '../../core/commands';
import { TripStore } from '../../core/store';
import { compareOrder } from '../../model/order';
import type { Comment, Segment } from '../../model/types';
import { stage, trip, TRIP_ID } from '../../test/fixtures';
import { isBackup, makeBackup, restoreBackup } from './backup';
import { safeFileName, toGpx } from './gpx';
import { buildImport, type ImportOptions } from './importer';
import { fromGeoJSON, type ParsedFile } from './parse';

const track = (name: string, lng = 7): ParsedFile['tracks'][number] => ({
  name,
  parts: [
    [
      [lng, 45, 100],
      [lng + 0.01, 45, 150],
    ],
  ],
});

describe('fromGeoJSON', () => {
  it('turns lines into tracks and points into waypoints', () => {
    const out = fromGeoJSON(
      {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { name: 'Day 1', coordinateProperties: { times: ['2027-03-15T08:00:00Z'] } },
            geometry: { type: 'LineString', coordinates: [[7, 45, 100], [7.1, 45.1, 120]] },
          },
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'MultiLineString', coordinates: [[[8, 46], [8.1, 46]], [[8.2, 46], [8.3, 46]], [[9, 9]]] },
          },
          {
            type: 'Feature',
            properties: { name: 'Spring', desc: 'Good water', link: { href: 'https://example.org/spring' } },
            geometry: { type: 'Point', coordinates: [7.05, 45.05, 300] },
          },
          { type: 'Feature', properties: { name: 'nothing' }, geometry: null },
        ],
      },
      'alps.gpx',
    );
    expect(out.tracks.map((tr) => tr.name)).toEqual(['Day 1', 'alps 2']);
    expect(out.tracks[0]!.parts).toEqual([[[7, 45, 100], [7.1, 45.1, 120]]]);
    expect(out.tracks[1]!.parts).toHaveLength(2);
    expect(out.waypoints).toEqual([{ name: 'Spring', desc: 'Good water', lngLat: [7.05, 45.05], links: ['https://example.org/spring'] }]);
  });

  it('accepts a bare geometry', () => {
    expect(fromGeoJSON({ type: 'LineString', coordinates: [[1, 2], [3, 4]] }, 'x.geojson').tracks[0]!.name).toBe('x');
  });
});

describe('buildImport', () => {
  let store: TripStore;
  let commands: CommandStack;
  const opts = (o: Partial<ImportOptions> = {}): ImportOptions => ({
    tripId: TRIP_ID,
    userId: 'u1',
    target: 'auto',
    mode: 'bike',
    waypoints: true,
    label: 'import',
    stageName: (n) => `Stage ${n}`,
    ...o,
  });
  const file = (name: string, tracks: ParsedFile['tracks'], waypoints = 0): ParsedFile => ({
    name,
    tracks,
    waypoints: Array.from({ length: waypoints }, (_, i) => ({ name: `W${i}`, desc: '', lngLat: [7, 45], links: [] })),
  });

  beforeEach(() => {
    store = new TripStore();
    store.apply([trip(), stage('a', 'V'), stage('b', 'X')], 'load');
    commands = new CommandStack(store, () => 'u1');
  });

  it('puts single-track files in the default stage and multi-track files in their own stage', () => {
    const res = buildImport(store, [file('one.gpx', [track('A')], 2), file('multi.gpx', [track('B'), track('C', 8)])], opts({ defaultStageId: 'a' }));
    commands.run(res.command);
    const segs = store.list('segment');
    expect(segs.find((s) => s.name === 'A')!.stageId).toBe('a');
    const multi = store.list('stage').find((s) => s.name === 'multi')!;
    expect(sortedNames(store, multi.id)).toEqual(['B', 'C']);
    expect(segs.every((s) => s.geomType === 'imported' && s.mode === 'bike')).toBe(true);
    expect(store.list('poi')).toHaveLength(2);
    expect(res.poiCount).toBe(2);

    commands.undo();
    expect(store.list('segment')).toHaveLength(0);
    expect(store.list('stage')).toHaveLength(2);
  });

  it('can import everything into one stage, or one stage per file', () => {
    commands.run(buildImport(store, [file('x.gpx', [track('A'), track('B')])], opts({ target: 'b' })).command);
    expect(sortedNames(store, 'b')).toEqual(['A', 'B']);
    commands.run(buildImport(store, [file('y.gpx', [track('C')]), file('z.gpx', [track('D')])], opts({ target: 'perFile', waypoints: false })).command);
    expect(store.list('stage').sort(compareOrder).map((s) => s.name)).toEqual(['a', 'b', 'y', 'z']);
  });

  it('creates a stage when the trip has none, and skips files with errors', () => {
    store = new TripStore();
    store.apply([trip()], 'load');
    const res = buildImport(store, [file('a.gpx', [track('A')]), { name: 'bad.gpx', tracks: [], waypoints: [], error: 'x' }], opts());
    expect(res.stageIds).toHaveLength(1);
    expect(res.segmentIds).toHaveLength(1);
  });
});

function sortedNames(store: TripStore, stageId: string): string[] {
  return store.list('segment', (s: Segment) => s.stageId === stageId).sort(compareOrder).map((s) => s.name);
}

describe('toGpx', () => {
  it('writes tracks and waypoints without timestamps', () => {
    const xml = toGpx(
      'Trip & co',
      [
        { name: 'Day <1>', type: 'bike', coords: [[7, 45, 100.04], [7.5, 45.25]] },
        { name: 'too short', coords: [[1, 1]] },
        { name: 'Flight', type: 'plane', coords: [[170, 50], [190.5, 50]] },
      ],
      [{ name: 'Spring', desc: 'water', lngLat: [7.123456789, 45], links: ['https://x.org/?a=1&b=2'] }],
    );
    expect(xml).toContain('<name>Trip &amp; co</name>');
    expect(xml).toContain('<trkpt lat="45" lon="7"><ele>100.0</ele></trkpt>');
    expect(xml).toContain('<trkpt lat="45.25" lon="7.5"></trkpt>');
    expect(xml).toContain('<name>Day &lt;1&gt;</name>');
    expect(xml).toContain('lon="-169.5"');
    expect(xml).toContain('<wpt lat="45" lon="7.123457"><name>Spring</name><desc>water</desc><link href="https://x.org/?a=1&amp;b=2"/></wpt>');
    expect(xml).not.toContain('too short');
    expect(xml).not.toContain('<time>');
  });

  it('makes safe file names', () => {
    expect(safeFileName('Paris / Tbilisi: day 1?', 'gpx')).toBe('Paris Tbilisi day 1.gpx');
    expect(safeFileName('  ', 'json')).toBe('trip.json');
  });
});

describe('backup', () => {
  it('restores as a new trip with all references remapped', () => {
    const seg = { id: 'g1', type: 'segment', tripId: TRIP_ID, stageId: 'a', order: 'V' } as unknown as Segment;
    const comment = { id: 'c1', type: 'comment', tripId: TRIP_ID, targetId: 'g1' } as unknown as Comment;
    const gone = { ...stage('z', 'Z'), deleted: true };
    const backup = makeBackup([trip(), stage('a', 'V'), seg, comment, gone], new Date('2027-01-01T00:00:00Z'));
    expect(backup.tripName).toBe('Test trip');
    expect(backup.entities).toHaveLength(4);
    expect(isBackup(JSON.parse(JSON.stringify(backup)))).toBe(true);
    expect(isBackup({ format: 'other' })).toBe(false);

    let n = 0;
    const restored = restoreBackup(backup, () => `new${++n}`);
    const byType = Object.fromEntries(restored.map((e) => [e.type, e]));
    expect(byType.trip!.id).toBe('new1');
    expect(restored.every((e) => e.tripId === 'new1')).toBe(true);
    expect((byType.segment as Segment).stageId).toBe(byType.stage!.id);
    expect((byType.comment as Comment).targetId).toBe(byType.segment!.id);
  });
});

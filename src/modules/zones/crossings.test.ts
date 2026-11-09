import { describe, expect, it } from 'vitest';
import { encodeLine } from '../../lib/geo/polyline';
import type { Segment, Zone } from '../../model/types';
import { rerouteThrough, segmentsCrossing, zonesCrossed } from './crossings';

const zone = (id: string, kind: Zone['kind'] = 'avoid'): Zone =>
  ({ id, kind, polygon: [[[7.4, 44.9], [7.6, 44.9], [7.6, 45.1], [7.4, 45.1]]], severity: 'nogo' }) as Zone;

const seg = (lngs: number[], geomType: Segment['geomType'] = 'routed'): Segment =>
  ({
    id: 's',
    geomType,
    anchors: lngs.map((lng, i) => ({ id: `a${i}`, lngLat: [lng, 45] })),
    legs: lngs.slice(1).map((lng, i) => ({ line: encodeLine([[lngs[i]!, 45], [lng, 45]]) })),
  }) as unknown as Segment;

describe('zone crossings', () => {
  it('finds the zones a segment enters, and the reverse', () => {
    const s = seg([7, 7.5, 8]);
    expect(zonesCrossed(s, [zone('z'), zone('r', 'risk')]).map((z) => z.id)).toEqual(['z']);
    expect(segmentsCrossing(zone('z'), [s, seg([8, 9])]).map((x) => x.anchors.length)).toEqual([3]);
  });

  it('sends only the crossing legs back to the router', () => {
    const s = seg([6, 7, 8]);
    const out = rerouteThrough(s, [zone('z')])!;
    expect(out.legs[0]).toBe(s.legs[0]);
    expect(out.legs[1]!.status).toBe('pending');
    expect(rerouteThrough(seg([6, 7]), [zone('z')])).toBeNull();
    expect(rerouteThrough(seg([7, 8], 'manual'), [zone('z')])).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { encodeLine } from '../../lib/geo/polyline';
import type { Group, Route, Segment, Stage } from '../../model/types';
import { legFeatures, segmentColor } from './render';

const seg = (over: Partial<Segment> = {}): Segment =>
  ({ id: 's', mode: 'bike', legs: [{ line: encodeLine([[7, 45], [7.1, 45]]) }], ...over }) as Segment;
const stage = { color: '#2f9e44' } as Stage;

describe('route styles', () => {
  it('uses the segment colour, else the stage colour for bike and walk, else the mode colour', () => {
    expect(segmentColor(seg(), stage)).toBe('#2f9e44');
    expect(segmentColor(seg({ color: '#123456' }), stage)).toBe('#123456');
    expect(segmentColor(seg({ mode: 'train' }), stage)).toBe('#343a40');
    expect(segmentColor(seg({ mode: 'train', color: '#123456' }), stage)).toBe('#123456');
  });

  it('prefers the route colour to the stage colour, and the group colour to both', () => {
    const route = { color: '#0000ff' } as Route;
    expect(segmentColor(seg(), stage, undefined, route)).toBe('#0000ff');
    expect(segmentColor(seg(), stage, { color: '#aa00aa' } as Group, route)).toBe('#aa00aa');
    expect(segmentColor(seg({ color: '#123456' }), stage, undefined, route)).toBe('#123456');
  });

  it('prefers the group colour to the stage colour', () => {
    const group = { color: '#aa00aa' } as Group;
    expect(segmentColor(seg(), stage, group)).toBe('#aa00aa');
    expect(segmentColor(seg(), stage, {} as Group)).toBe('#2f9e44');
    expect(segmentColor(seg({ mode: 'train' }), stage, group)).toBe('#343a40');
  });

  it('carries the width and pattern, falling back to the travel mode', () => {
    expect(legFeatures(seg(), '#fff')[0]!.properties).toMatchObject({ width: 4, dash: 'mode' });
    expect(legFeatures(seg({ lineWidth: 7, dash: 'dotted' }), '#fff')[0]!.properties).toMatchObject({ width: 7, dash: 'dotted' });
  });

  it('scales every width by the route thickness preference', () => {
    expect(legFeatures(seg(), '#fff', 1.5)[0]!.properties.width).toBe(6);
    expect(legFeatures(seg({ lineWidth: 2 }), '#fff', 2)[0]!.properties.width).toBe(4);
  });
});

import { describe, expect, it } from 'vitest';
import type { Entity } from '../model/types';
import { describeCommand } from './undo-notice';

const seg = (id: string, name: string, stageId: string) => ({ id, type: 'segment', name, stageId }) as unknown as Entity;
const names: Record<string, string> = { s1: 'Stage 1', s2: 'Stage 2' };

describe('describeCommand', () => {
  it('names what changed and where it went', () => {
    const cmd = { label: 'Move segment', changes: [{ id: 'a', before: seg('a', 'Segment 3', 's1'), after: seg('a', 'Segment 3', 's2') }] };
    expect(describeCommand(cmd, (id) => names[id])).toBe('Move segment: “Segment 3” → Stage 2');
  });

  it('shortens long lists and leaves out the target when moves differ', () => {
    const cmd = {
      label: 'Delete',
      changes: ['A', 'B', 'C'].map((n, i) => ({ id: n, before: seg(n, n, 's1'), after: { ...seg(n, n, 's1'), deleted: true } as Entity })).slice(0, 3),
    };
    expect(describeCommand(cmd, (id) => names[id])).toBe('Delete: “A”, “B” +1');
  });

  it('is the label alone for unnamed items', () => {
    expect(describeCommand({ label: 'Vote', changes: [{ id: 'v', before: null, after: { id: 'v', type: 'vote' } as unknown as Entity }] }, () => undefined)).toBe('Vote');
  });
});

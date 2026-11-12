import { describe, expect, it } from 'vitest';
import { visibleIds, type TreeNode } from './filter';

const n = (id: string, name: string, children: TreeNode[] = []): TreeNode => ({ id, name, children });
const tree = [
  n('r1', 'EuroVelo 6', [n('s1', 'France', [n('a', 'Nantes → Tours'), n('b', 'Tours → Orléans')]), n('s2', 'Hungary', [n('c', 'Budapest')])]),
  n('s3', 'China', [n('g1', 'Tibet', [n('d', 'Manigango → Yushu')])]),
];

describe('trip tree search', () => {
  it('lists matches with what they are in', () => {
    expect([...visibleIds(tree, 'tours')!].sort()).toEqual(['a', 'b', 'r1', 's1'].sort());
    expect([...visibleIds(tree, 'yushu')!].sort()).toEqual(['d', 'g1', 's3'].sort());
  });

  it('lists everything inside a matching stage', () => {
    expect([...visibleIds(tree, 'hungary')!].sort()).toEqual(['c', 'r1', 's2'].sort());
  });

  it('is off without a search', () => {
    expect(visibleIds(tree, '')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { lineStyleOf } from './line-style';

describe('lineStyleOf', () => {
  it('reports shared values, undefined for defaults and null where segments differ', () => {
    expect(lineStyleOf([{ color: '#f00', lineWidth: 5 }, { color: '#f00', dash: 'dotted' }])).toEqual({ color: '#f00', width: null, dash: null });
    expect(lineStyleOf([{}, {}])).toEqual({ color: undefined, width: undefined, dash: undefined });
  });
});

import { describe, expect, it } from 'vitest';
import { matchesQuery } from './text';

describe('matchesQuery', () => {
  it('ignores case and accents, and needs every word', () => {
    expect(matchesQuery('zurich', 'Zürich HB')).toBe(true);
    expect(matchesQuery('ev6 danube', 'EV6', 'Along the Danube')).toBe(true);
    expect(matchesQuery('ev6 rhine', 'EV6', 'Along the Danube')).toBe(false);
    expect(matchesQuery('  ', 'anything')).toBe(true);
  });
});

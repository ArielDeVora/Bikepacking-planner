import { describe, expect, it } from 'vitest';
import { t } from '../core/i18n';
import { timeAgo } from './time';

describe('timeAgo', () => {
  const now = Date.UTC(2027, 2, 15, 12);
  it('rounds down to minutes, hours and days', () => {
    expect(timeAgo(t, now - 20_000, now)).toBe('just now');
    expect(timeAgo(t, now - 5 * 60_000, now)).toBe('5 min ago');
    expect(timeAgo(t, now - 3 * 3_600_000, now)).toBe('3 h ago');
    expect(timeAgo(t, now - 50 * 3_600_000, now)).toBe('2 d ago');
  });
});

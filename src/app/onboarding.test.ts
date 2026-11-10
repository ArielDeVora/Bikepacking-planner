import { describe, expect, it, vi } from 'vitest';

vi.mock('./Guide.svelte', () => ({ default: {} }));
vi.mock('./WhatsNew.svelte', () => ({ default: {} }));

const { pendingReleases } = await import('./onboarding');

const r = (id: string) => ({ id, title: id, items: ['x'] });
const releases = [r('2026-12-01'), r('2026-11-20b'), r('2026-11-20'), r('2026-11-01')];

describe("what's new", () => {
  it('shows the releases since the last one seen', () => {
    expect(pendingReleases(releases, '2026-11-20', true).map((x) => x.id)).toEqual(['2026-12-01', '2026-11-20b']);
    expect(pendingReleases(releases, '2026-12-01', true)).toEqual([]);
  });

  it('shows only the latest to earlier users, and nothing on a first visit', () => {
    expect(pendingReleases(releases, null, true).map((x) => x.id)).toEqual(['2026-12-01']);
    expect(pendingReleases(releases, null, false)).toEqual([]);
  });

  it('shows at most four', () => {
    expect(pendingReleases([...releases, r('2026-10-01')], '2000-01-01', true)).toHaveLength(4);
  });
});

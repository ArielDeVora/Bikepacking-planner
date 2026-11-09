import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import { OSM_CATEGORIES } from '../../config/pois';
import { OverpassLoader, type Transport } from './loader';
import { tileAt } from './overpass';

const cats = OSM_CATEGORIES.filter((c) => c.id === 'water' || c.id === 'camp');
const flush = () => new Promise((r) => setTimeout(r, 0));

function transport(responses: (() => unknown)[]): Transport & { queries: string[] } {
  const queries: string[] = [];
  return {
    queries,
    async query(q) {
      queries.push(q);
      const next = responses.shift();
      return (next ? next() : { elements: [] }) as { elements?: unknown[] };
    },
    sleep: async () => {},
  };
}

describe('OverpassLoader', () => {
  it('fetches each tile once for all missing categories and keeps the results', async () => {
    const tr = transport([
      () => ({
        elements: [
          { type: 'node', id: 1, lat: 45, lon: 7, tags: { amenity: 'drinking_water' } },
          { type: 'node', id: 2, lat: 45, lon: 7, tags: { tourism: 'camp_site' } },
        ],
      }),
    ]);
    const onLoaded = vi.fn();
    const loader = new OverpassLoader(cats, onLoaded, tr, Promise.resolve(null));
    const tile = tileAt([7, 45]);
    await loader.ensure([tile], ['water', 'camp']);
    await flush();
    expect(tr.queries).toHaveLength(1);
    expect(loader.places(new Set(['water'])).map((p) => p.key)).toEqual(['node/1']);
    expect(loader.places(new Set(['water', 'camp']))).toHaveLength(2);

    await loader.ensure([tile], ['water']);
    await flush();
    expect(tr.queries).toHaveLength(1);
    expect(onLoaded).toHaveBeenCalled();
  });

  it('puts a tile back and reports when Overpass is busy', async () => {
    const tr = transport([
      () => {
        throw Object.assign(new Error('x'), { status: 429 });
      },
    ]);
    const loader = new OverpassLoader(cats, () => {}, { ...tr, sleep: () => new Promise(() => {}) }, Promise.resolve(null));
    await loader.ensure([tileAt([7, 45])], ['water']);
    await flush();
    expect(tr.queries).toHaveLength(1);
    expect(get(loader.state).error).toBe('failed');
    expect(get(loader.state).queued).toBe(1);
    expect(get(loader.state).busyUntil).toBeGreaterThan(Date.now());
  });

  it('forgets queued tiles that are no longer wanted', async () => {
    const tr = transport([]);
    const loader = new OverpassLoader(cats, () => {}, { ...tr, sleep: () => new Promise(() => {}) }, Promise.resolve(null));
    await loader.ensure([tileAt([7, 45]), tileAt([9, 45])], ['water']);
    loader.keepOnly(new Set([tileAt([7, 45])]));
    expect(get(loader.state).queued).toBeLessThanOrEqual(1);
  });
});

import { describe, expect, it } from 'vitest';
import { parsePosts, postsQuery } from './posts';

describe('border posts', () => {
  it('queries border controls around a point', () => {
    const q = postsQuery([44.5, 41.2]);
    expect(q).toContain('node(around:8000,41.20000,44.50000)["barrier"="border_control"]');
    expect(q).toContain('way(around:8000');
  });

  it('parses posts nearest first, preferring English names', () => {
    const posts = parsePosts(
      {
        elements: [
          { type: 'way', id: 2, center: { lat: 41.25, lon: 44.5 }, tags: { name: 'Far' } },
          { type: 'node', id: 1, lat: 41.201, lon: 44.5, tags: { name: 'Sadakhlo', 'name:en': 'Sadakhlo border' } },
          { type: 'node', id: 3 },
        ],
      },
      [44.5, 41.2],
    );
    expect(posts.map((p) => [p.id, p.name])).toEqual([
      [1, 'Sadakhlo border'],
      [2, 'Far'],
    ]);
    expect(posts[0]!.distM).toBeCloseTo(111, -1);
  });
});

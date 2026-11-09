import { describe, expect, it, vi } from 'vitest';
import type { Coord } from '../../../lib/geo/polyline';
import { RoutingError, type RouteRequest, type RoutingProvider } from './provider';
import { RoutingCancelled, RoutingQueue } from './queue';

const req = (from: number, to: number, profile = 'trekking'): RouteRequest => ({
  from: [from, 0],
  to: [to, 0],
  profile,
  nogos: [],
});

function fakeProvider(impl?: (r: RouteRequest) => Promise<Coord[]>) {
  const route = vi.fn(impl ?? (async (r: RouteRequest) => [r.from, [0.5, 0.5], r.to] as Coord[]));
  const provider: RoutingProvider = { id: 'fake', label: 'Fake', profiles: {}, route };
  return { provider, route };
}

const opts = { minGapMs: 0, sleep: async () => {} };

describe('RoutingQueue', () => {
  it('sends requests one at a time, in order', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const order: number[] = [];
    const { provider } = fakeProvider(async (r) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((res) => setTimeout(res, 1));
      order.push(r.from[0]);
      inFlight--;
      return [r.from, r.to];
    });
    const queue = new RoutingQueue(provider, opts);
    await Promise.all([queue.request(req(1, 2)), queue.request(req(2, 3)), queue.request(req(3, 4))]);
    expect(maxInFlight).toBe(1);
    expect(order).toEqual([1, 2, 3]);
  });

  it('shares identical requests and caches results', async () => {
    const { provider, route } = fakeProvider();
    const queue = new RoutingQueue(provider, opts);
    const [a, b] = await Promise.all([queue.request(req(1, 2)), queue.request(req(1, 2))]);
    expect(a).toBe(b);
    expect(await queue.request(req(1, 2))).toBe(a);
    expect(queue.cached(req(1, 2))).toBe(a);
    await queue.request(req(1, 2, 'fastbike'));
    expect(route).toHaveBeenCalledTimes(2);
  });

  it('drops requests nobody needs any more', async () => {
    const { provider, route } = fakeProvider();
    const queue = new RoutingQueue(provider, opts);
    await expect(queue.request(req(1, 2), () => false)).rejects.toBeInstanceOf(RoutingCancelled);
    expect(route).not.toHaveBeenCalled();
  });

  it('passes errors on and pauses after a rate limit', async () => {
    const sleep = vi.fn(async () => {});
    const { provider } = fakeProvider(async () => {
      throw new RoutingError('rateLimit', 'busy');
    });
    const queue = new RoutingQueue(provider, { minGapMs: 0, rateLimitPauseMs: 10_000, sleep });
    const first = queue.request(req(1, 2));
    const second = queue.request(req(2, 3));
    await expect(first).rejects.toMatchObject({ kind: 'rateLimit' });
    await expect(second).rejects.toMatchObject({ kind: 'rateLimit' });
    expect(sleep).toHaveBeenCalledTimes(1);
    expect((sleep.mock.calls[0] as unknown as [number])[0]).toBeGreaterThan(9_000);
  });

  it('evicts the oldest cache entries', async () => {
    const { provider, route } = fakeProvider();
    const queue = new RoutingQueue(provider, { ...opts, cacheSize: 2 });
    await queue.request(req(1, 2));
    await queue.request(req(2, 3));
    await queue.request(req(3, 4));
    expect(queue.cached(req(1, 2))).toBeUndefined();
    expect(queue.cached(req(3, 4))).toBeDefined();
    expect(route).toHaveBeenCalledTimes(3);
  });
});

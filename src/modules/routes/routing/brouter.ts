import type { Coord } from '../../../lib/geo/polyline';
import { RoutingError, type RouteRequest, type RoutingProvider } from './provider';

// Public instance, run on donations: requests are sent one at a time and cached (see queue.ts).
const ENDPOINT = 'https://brouter.de/brouter';

const fmt = (n: number) => n.toFixed(6);

export function brouterUrl(req: RouteRequest, endpoint = ENDPOINT): string {
  const params = new URLSearchParams({
    lonlats: [req.from, req.to].map(([lng, lat]) => `${fmt(lng)},${fmt(lat)}`).join('|'),
    profile: req.profile,
    alternativeidx: '0',
    format: 'geojson',
  });
  if (req.nogos.length) {
    params.set('polygons', req.nogos.map((ring) => ring.map(([lng, lat]) => `${fmt(lng)},${fmt(lat)}`).join(',')).join('|'));
  }
  return `${endpoint}?${params}`;
}

export function classifyError(status: number, body: string): RoutingError {
  const text = body.trim().slice(0, 200);
  if (status === 429 || status === 503 || /retry later/i.test(text)) return new RoutingError('rateLimit', text || `HTTP ${status}`);
  if (/not found|no track|target island|from-position|to-position|datafile/i.test(text)) return new RoutingError('noRoute', text);
  return new RoutingError('server', text || `HTTP ${status}`);
}

export const brouter: RoutingProvider = {
  id: 'brouter',
  label: 'BRouter',
  profiles: {
    bike: [
      { id: 'trekking', label: 'Trekking' },
      { id: 'fastbike', label: 'Road (fast)' },
      { id: 'fastbike-lowtraffic', label: 'Road (low traffic)' },
      { id: 'gravel', label: 'Gravel' },
      { id: 'mtb', label: 'Mountain bike' },
      { id: 'safety', label: 'Safety first' },
      { id: 'shortest', label: 'Shortest' },
    ],
    walk: [
      { id: 'hiking-mountain', label: 'Hiking' },
      { id: 'shortest', label: 'Shortest' },
    ],
    train: [{ id: 'rail', label: 'Railway' }],
    bus: [
      { id: 'car-fast', label: 'Car (fast)' },
      { id: 'car-eco', label: 'Car (eco)' },
    ],
    car: [
      { id: 'car-fast', label: 'Car (fast)' },
      { id: 'car-eco', label: 'Car (eco)' },
    ],
  },

  async route(req, signal) {
    let res: Response;
    try {
      res = await fetch(brouterUrl(req), { signal });
    } catch (err) {
      if (signal.aborted) throw new RoutingError('timeout', 'The routing service took too long.');
      throw new RoutingError('network', err instanceof Error ? err.message : String(err));
    }
    if (!res.ok) throw classifyError(res.status, await res.text().catch(() => ''));
    const json = (await res.json()) as { features?: { geometry?: { coordinates?: number[][] } }[] };
    const coords = json.features?.[0]?.geometry?.coordinates;
    if (!coords || coords.length < 2) throw new RoutingError('noRoute', 'No route found.');
    return coords.map((c) => (c.length >= 3 ? [c[0]!, c[1]!, c[2]!] : [c[0]!, c[1]!]) as Coord);
  },
};

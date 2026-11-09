/**
 * Overpass API requests with failover. The main server (overpass-api.de: about 10,000 requests
 * and 1 GB a day per user, often overloaded) is tried first; the two others state no request
 * limits. Callers send one request at a time and back off when all servers fail.
 */
export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

const TIMEOUT_MS = 40_000;

export class OverpassError extends Error {
  constructor(readonly status: number) {
    super(`Overpass HTTP ${status}`);
    this.name = 'OverpassError';
  }

  /** The server is overloaded or rate-limiting (worth retrying later). */
  get busy(): boolean {
    return this.status === 429 || this.status >= 502;
  }
}

export async function overpassFetch(query: string, endpoint: string): Promise<{ elements?: unknown[] }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, { method: 'POST', body: new URLSearchParams({ data: query }), signal: ctrl.signal });
    if (!res.ok) throw new OverpassError(res.status);
    return (await res.json()) as { elements?: unknown[] };
  } catch (err) {
    throw ctrl.signal.aborted ? new OverpassError(504) : err;
  } finally {
    clearTimeout(timer);
  }
}

/** Tries each server in turn, starting with `start`; returns the result and the server that answered. */
export async function overpassQuery(query: string, start = 0): Promise<{ json: { elements?: unknown[] }; endpoint: number }> {
  let last: unknown;
  for (let i = 0; i < OVERPASS_ENDPOINTS.length; i++) {
    const endpoint = (start + i) % OVERPASS_ENDPOINTS.length;
    try {
      return { json: await overpassFetch(query, OVERPASS_ENDPOINTS[endpoint]!), endpoint };
    } catch (err) {
      last = err;
    }
  }
  throw last;
}

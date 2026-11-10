import { poiCategoryFromTags } from '../config/pois';
import type { LngLat, PoiCategory } from '../model/types';

export { parseCoordinates } from './geo/coordinates';

// Public Photon instance (komoot): fair use, so queries are debounced and cached.
const ENDPOINT = 'https://photon.komoot.io/api/';

export interface SearchResult {
  name: string;
  /** Where it is: street, city, country… */
  detail: string;
  kind: string;
  lngLat: LngLat;
  /** [west, south, east, north] for areas such as cities and countries. */
  bbox?: [number, number, number, number];
  osm?: { type: 'node' | 'way' | 'relation'; id: number; tags: Record<string, string> };
  category: PoiCategory;
}


export function photonUrl(q: string, near?: LngLat, limit = 7): string {
  const params = new URLSearchParams({ q, limit: String(limit), lang: 'en' });
  if (near) {
    params.set('lat', near[1].toFixed(4));
    params.set('lon', near[0].toFixed(4));
  }
  return `${ENDPOINT}?${params}`;
}

const OSM_TYPES = { N: 'node', W: 'way', R: 'relation' } as const;
const human = (s: string) => s.replace(/_/g, ' ');

interface PhotonProps {
  name?: string;
  osm_type?: keyof typeof OSM_TYPES;
  osm_id?: number;
  osm_key?: string;
  osm_value?: string;
  street?: string;
  housenumber?: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
  extent?: [number, number, number, number];
}

export function toResults(json: { features?: { properties?: PhotonProps; geometry?: { coordinates?: number[] } }[] }): SearchResult[] {
  return (json.features ?? []).flatMap((f) => {
    const p = f.properties ?? {};
    const c = f.geometry?.coordinates;
    if (!c || c.length < 2) return [];
    const street = [p.street, p.housenumber].filter(Boolean).join(' ');
    const name = p.name || street || p.city || p.country || '';
    const detail = [street !== name ? street : '', p.city !== name ? p.city : '', p.state, p.country !== name ? p.country : '']
      .filter(Boolean)
      .join(', ');
    const tags = p.osm_key && p.osm_value ? { [p.osm_key]: p.osm_value } : {};
    const osmType = p.osm_type ? OSM_TYPES[p.osm_type] : undefined;
    const e = p.extent;
    return [
      {
        name,
        detail,
        kind: p.osm_value ? human(p.osm_value) : '',
        lngLat: [c[0]!, c[1]!] as LngLat,
        bbox: e ? ([e[0], e[3], e[2], e[1]] as [number, number, number, number]) : undefined,
        osm: osmType && p.osm_id ? { type: osmType, id: p.osm_id, tags } : undefined,
        category: poiCategoryFromTags(tags),
      },
    ];
  });
}

export class Photon {
  #cache = new Map<string, SearchResult[]>();

  async search(q: string, near: LngLat | undefined, signal: AbortSignal): Promise<SearchResult[]> {
    const url = photonUrl(q, near);
    const key = `${q}|${near ? near.map((v) => v.toFixed(1)).join(',') : ''}`;
    const hit = this.#cache.get(key);
    if (hit) return hit;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Search failed (${res.status})`);
    const results = toResults(await res.json());
    this.#cache.set(key, results);
    if (this.#cache.size > 200) this.#cache.delete(this.#cache.keys().next().value!);
    return results;
  }
}

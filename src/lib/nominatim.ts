/**
 * OpenStreetMap's Nominatim, under its usage policy
 * (https://operations.osmfoundation.org/policies/nominatim/): at most one request per second
 * for the whole app, only when someone asks for it (never search as you type), results cached.
 * Every request goes through `throttled`.
 */
import { poiCategoryFromTags } from '../config/pois';
import type { LngLat } from '../model/types';
import type { SearchResult } from './photon';

/** Set to false to stop using Nominatim for place search (place details keep their own lookups). */
export const NOMINATIM_SEARCH = true;

const SEARCH = 'https://nominatim.openstreetmap.org/search';
const MIN_GAP_MS = 1100;

let queue: Promise<unknown> = Promise.resolve();
let last = 0;

/** Runs requests one after another, at most one per MIN_GAP_MS. */
export function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = last + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    return fn();
  });
  queue = run.catch(() => {});
  return run;
}

export function nominatimSearchUrl(q: string, limit = 7): string {
  const params = new URLSearchParams({ q, format: 'jsonv2', limit: String(limit), addressdetails: '1', 'accept-language': 'en' });
  return `${SEARCH}?${params}`;
}

/** Words that are rarely part of a place's name in OpenStreetMap ("Bokty Mountain" is tagged "Бокты"). */
const GENERIC = /\b(mountains?|mount|mt|mont|monte|hills?)\b\.?/gi;

/** The query without generic words, or null when it has none (or nothing else). */
export function withoutGenericWords(q: string): string | null {
  const rest = q.replace(GENERIC, ' ').replace(/\s+/g, ' ').trim();
  return rest && rest !== q.trim() ? rest : null;
}

interface NominatimPlace {
  osm_type?: string;
  osm_id?: number;
  lat?: string;
  lon?: string;
  category?: string;
  type?: string;
  name?: string;
  display_name?: string;
  /** [south, north, west, east] */
  boundingbox?: string[];
  address?: Record<string, string>;
}

const OSM_TYPES = new Set(['node', 'way', 'relation']);
const human = (s: string) => s.replace(/_/g, ' ');

export function toNominatimResults(json: NominatimPlace[]): SearchResult[] {
  return json.flatMap((p) => {
    const lng = Number(p.lon);
    const lat = Number(p.lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return [];
    const parts = (p.display_name ?? '').split(', ').filter(Boolean);
    const name = p.name || parts[0] || '';
    const a = p.address ?? {};
    const street = [a.road, a.house_number].filter(Boolean).join(' ');
    const town = a.city ?? a.town ?? a.village ?? a.hamlet;
    const detail = [street, town, a.state, a.country].filter((v) => v && v !== name).join(', ');
    const tags = p.category && p.type ? { [p.category]: p.type } : {};
    const b = p.boundingbox?.map(Number);
    const bbox = b && b.length === 4 && b.every(Number.isFinite) ? ([b[2], b[0], b[3], b[1]] as [number, number, number, number]) : undefined;
    const type = p.osm_type && OSM_TYPES.has(p.osm_type) ? (p.osm_type as 'node' | 'way' | 'relation') : undefined;
    return [
      {
        name,
        detail,
        kind: p.type ? human(p.type) : '',
        lngLat: [lng, lat] as LngLat,
        bbox,
        osm: type && p.osm_id ? { type, id: p.osm_id, tags } : undefined,
        category: poiCategoryFromTags(tags),
      },
    ];
  });
}

export class NominatimSearch {
  #cache = new Map<string, Promise<SearchResult[]>>();

  /** Tries the query as typed, then once more without generic words if nothing matched. */
  async search(q: string): Promise<SearchResult[]> {
    const found = await this.#get(q.trim());
    const shorter = withoutGenericWords(q);
    return found.length || !shorter ? found : this.#get(shorter);
  }

  #get(text: string): Promise<SearchResult[]> {
    const key = text.toLowerCase();
    let p = this.#cache.get(key);
    if (!p) {
      p = throttled(async () => {
        const res = await fetch(nominatimSearchUrl(text));
        if (!res.ok) throw new Error(`Search failed (${res.status})`);
        return toNominatimResults((await res.json()) as NominatimPlace[]);
      });
      p.catch(() => this.#cache.delete(key));
      this.#cache.set(key, p);
      if (this.#cache.size > 100) this.#cache.delete(this.#cache.keys().next().value!);
    }
    return p;
  }
}

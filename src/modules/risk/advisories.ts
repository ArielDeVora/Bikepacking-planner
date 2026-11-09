import { cacheGet, cachePut } from '../../lib/cache';

export interface TripCountries {
  status: 'idle' | 'loading' | 'ready' | 'error';
  countries: { code: string; name: string }[];
}

export interface UsAdvisory {
  codes: string[];
  country: string;
  /** 1 normal precautions, 2 increased caution, 3 reconsider travel, 4 do not travel. */
  level: number;
  url: string;
  updated: string;
}

export interface UsAdvisories {
  fetchedAt: string;
  /** The advisory for a country, by name (the State Department's codes are FIPS, not ISO). */
  lookup(name: string): UsAdvisory | undefined;
}

// Natural Earth names that differ from the State Department's.
const US_ALIASES: Record<string, string> = {
  'people s republic of china': 'china',
  'republic of the congo': 'republic of the congo',
  'democratic republic of the congo': 'democratic republic of the congo',
  myanmar: 'burma',
  'the bahamas': 'bahamas',
  'republic of serbia': 'serbia',
  'east timor': 'timor leste',
  'ivory coast': 'cote d ivoire',
  eswatini: 'eswatini',
  czechia: 'czech republic',
};

export function usLookup(items: UsAdvisory[]): (name: string) => UsAdvisory | undefined {
  const byName = new Map<string, UsAdvisory>();
  for (const a of items) {
    // "Burma (Myanmar)" is found as "burma (myanmar)", "burma" and "myanmar".
    const full = a.country;
    const outside = full.replace(/\s*\(.*\)\s*/g, ' ');
    const inside = /\(([^)]+)\)/.exec(full)?.[1];
    for (const n of [full, outside, inside]) if (n) byName.set(norm(n), a);
  }
  return (name) => {
    const n = norm(name);
    return byName.get(n) ?? byName.get(norm(US_ALIASES[n] ?? '')) ?? byName.get(n.replace(/^the /, ''));
  };
}

let us: Promise<UsAdvisories | null> | null = null;

/** US State Department levels, fetched at build time (see scripts/fetch-advisories.mjs). */
export function usAdvisories(): Promise<UsAdvisories | null> {
  us ??= fetch('./data/us-advisories.json')
    .then((r) => (r.ok ? (r.json() as Promise<{ fetchedAt: string; items: UsAdvisory[] }>) : null))
    .then((d) => (d ? { fetchedAt: d.fetchedAt, lookup: usLookup(d.items) } : null))
    .catch(() => null);
  return us;
}

// GOV.UK (UK Foreign, Commonwealth & Development Office), Open Government Licence v3.0.
const GOVUK = 'https://www.gov.uk/api/content/foreign-travel-advice';
const DAY_MS = 24 * 3600 * 1000;

export type FcdoAlert =
  | 'avoid_all_travel_to_whole_country'
  | 'avoid_all_but_essential_travel_to_whole_country'
  | 'avoid_all_travel_to_parts'
  | 'avoid_all_but_essential_travel_to_parts';

export interface FcdoAdvice {
  country: string;
  url: string;
  alerts: FcdoAlert[];
  /** Areas named under "Areas where FCDO advises against travel". */
  areas: string[];
  updated: string;
  mapImage?: string;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]+/g, ' ').trim();

interface IndexChild {
  base_path: string;
  details?: { country?: { name: string; slug: string; synonyms?: string[] } };
}

/** Country name (and synonyms) → GOV.UK slug. */
export function fcdoSlugs(index: { links?: { children?: IndexChild[] } }): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of index.links?.children ?? []) {
    const country = c.details?.country;
    const slug = country?.slug ?? c.base_path.split('/').pop()!;
    for (const name of [country?.name, ...(country?.synonyms ?? [])]) if (name) map.set(norm(name), slug);
  }
  return map;
}

// Natural Earth names that differ from GOV.UK's.
const ALIASES: Record<string, string> = {
  'united states of america': 'usa',
  'people s republic of china': 'china',
  'republic of the congo': 'congo',
  'democratic republic of the congo': 'democratic republic of the congo',
  'czech republic': 'czechia',
  turkey: 'turkey',
  'north macedonia': 'north macedonia',
};

export function findSlug(slugs: Map<string, string>, name: string): string | undefined {
  const n = norm(name);
  return slugs.get(n) ?? slugs.get(norm(ALIASES[n] ?? '')) ?? slugs.get(n.replace(/^the /, ''));
}

/** The areas named in the "Warnings and insurance" part, from its HTML. */
export function areasFromHtml(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: string[] = [];
  let inside = false;
  for (const el of doc.body.querySelectorAll('h2, h3')) {
    if (el.tagName === 'H2') inside = /advises against/i.test(el.textContent ?? '');
    else if (inside) out.push((el.textContent ?? '').trim());
  }
  return out.filter(Boolean);
}

let slugs: Promise<Map<string, string>> | null = null;

async function cachedJson<T>(url: string): Promise<T> {
  const hit = await cacheGet<T>(url, DAY_MS);
  if (hit) return hit;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as T;
  void cachePut(url, json);
  return json;
}

/** UK travel advice for a country (by Natural Earth name), cached for a day. Null if unknown. */
export async function fcdoAdvice(countryName: string): Promise<FcdoAdvice | null> {
  slugs ??= cachedJson<{ links?: { children?: IndexChild[] } }>(GOVUK).then(fcdoSlugs).catch((err) => {
    slugs = null;
    throw err;
  });
  const slug = findSlug(await slugs, countryName);
  if (!slug) return null;
  const d = await cachedJson<{
    title: string;
    base_path: string;
    public_updated_at: string;
    details: { alert_status?: FcdoAlert[]; image?: { url?: string }; country?: { name: string }; parts?: { slug: string; body?: string }[] };
  }>(`${GOVUK}/${slug}`);
  const warnings = d.details.parts?.find((p) => p.slug === 'warnings-and-insurance')?.body ?? '';
  return {
    country: d.details.country?.name ?? countryName,
    url: `https://www.gov.uk${d.base_path}`,
    alerts: d.details.alert_status ?? [],
    areas: warnings ? areasFromHtml(warnings) : [],
    updated: d.public_updated_at,
    mapImage: d.details.image?.url,
  };
}

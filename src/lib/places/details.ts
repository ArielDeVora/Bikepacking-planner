/**
 * Details for an OSM object: its tags (from Nominatim) and, when it links to Wikipedia or
 * Wikidata, a short summary with a photo.
 *
 * Nominatim's policy: at most one request per second for the whole app, user-triggered only,
 * results cached. Lookups here happen only when a card is opened, one at a time, and are cached
 * for the session.
 */

export type OsmType = 'node' | 'way' | 'relation';

export interface OsmDetails {
  tags: Record<string, string>;
  address: string;
}

export interface WikiSummary {
  title: string;
  extract: string;
  image?: string;
  url: string;
}

const NOMINATIM = 'https://nominatim.openstreetmap.org/lookup';
const MIN_GAP_MS = 1100;

const details = new Map<string, Promise<OsmDetails | null>>();
const summaries = new Map<string, Promise<WikiSummary | null>>();
let queue: Promise<unknown> = Promise.resolve();
let last = 0;

/** Runs requests one after another, at most one per MIN_GAP_MS. */
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = last + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    return fn();
  });
  queue = run.catch(() => {});
  return run;
}

export function nominatimUrl(type: OsmType, id: number): string {
  const params = new URLSearchParams({
    osm_ids: `${type[0]!.toUpperCase()}${id}`,
    format: 'jsonv2',
    extratags: '1',
    addressdetails: '1',
    'accept-language': 'en',
  });
  return `${NOMINATIM}?${params}`;
}

interface NominatimResult {
  category?: string;
  type?: string;
  name?: string;
  extratags?: Record<string, string> | null;
  address?: Record<string, string>;
}

export function parseNominatim(json: NominatimResult[]): OsmDetails | null {
  const r = json[0];
  if (!r) return null;
  const tags: Record<string, string> = { ...(r.extratags ?? {}) };
  if (r.category && r.type) tags[r.category] = r.type;
  if (r.name) tags.name = r.name;
  const a = r.address ?? {};
  const street = [a.road, a.house_number].filter(Boolean).join(' ');
  const town = a.city ?? a.town ?? a.village ?? a.hamlet;
  const address = [street, a.postcode, town, a.country].filter(Boolean).join(', ');
  return { tags, address };
}

export function osmDetails(type: OsmType, id: number): Promise<OsmDetails | null> {
  const key = `${type}/${id}`;
  let p = details.get(key);
  if (!p) {
    p = throttled(async () => {
      const res = await fetch(nominatimUrl(type, id));
      if (!res.ok) return null;
      return parseNominatim((await res.json()) as NominatimResult[]);
    }).catch(() => null);
    details.set(key, p);
  }
  return p;
}

/** "en:Eiffel Tower" → language and title. */
export function parseWikipediaTag(tag: string): { lang: string; title: string } | null {
  const m = tag.match(/^([a-z-]{2,12}):(.+)$/);
  return m ? { lang: m[1]!, title: m[2]! } : null;
}

async function wikipediaSummary(lang: string, title: string): Promise<WikiSummary | null> {
  const res = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`);
  if (!res.ok) return null;
  const j = (await res.json()) as { title?: string; extract?: string; thumbnail?: { source?: string }; content_urls?: { desktop?: { page?: string } } };
  if (!j.extract) return null;
  return { title: j.title ?? title, extract: j.extract, image: j.thumbnail?.source, url: j.content_urls?.desktop?.page ?? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}` };
}

/** Wikidata: the English (or first) Wikipedia article, else just the photo. */
async function wikidataSummary(qid: string): Promise<WikiSummary | null> {
  const res = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`);
  if (!res.ok) return null;
  const j = (await res.json()) as {
    entities?: Record<string, { sitelinks?: Record<string, { title: string }>; claims?: { P18?: { mainsnak?: { datavalue?: { value?: string } } }[] }; labels?: Record<string, { value: string }>; descriptions?: Record<string, { value: string }> }>;
  };
  const e = j.entities?.[qid];
  if (!e) return null;
  const site = e.sitelinks?.enwiki ? 'enwiki' : Object.keys(e.sitelinks ?? {}).find((k) => /^[a-z]{2,3}wiki$/.test(k));
  if (site) {
    const summary = await wikipediaSummary(site.replace(/wiki$/, ''), e.sitelinks![site]!.title);
    if (summary) return summary;
  }
  const file = e.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  const label = e.labels?.en?.value ?? Object.values(e.labels ?? {})[0]?.value ?? qid;
  const description = e.descriptions?.en?.value ?? '';
  if (!file && !description) return null;
  return {
    title: label,
    extract: description,
    image: file ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=400` : undefined,
    url: `https://www.wikidata.org/wiki/${qid}`,
  };
}

/**
 * A summary and photo for a place tagged with `wikidata` or `wikipedia`, if it has one. Wikidata
 * comes first because it leads to the English article; the `wikipedia` tag is often the local one.
 */
export function wikiSummary(tags: Record<string, string>): Promise<WikiSummary | null> {
  const wp = tags.wikipedia ? parseWikipediaTag(tags.wikipedia) : null;
  const qid = tags.wikidata && /^Q\d+$/.test(tags.wikidata) ? tags.wikidata : null;
  const key = `${qid ?? ''}|${tags.wikipedia ?? ''}`;
  if (!qid && !wp) return Promise.resolve(null);
  let p = summaries.get(key);
  if (!p) {
    p = (async () => (qid ? await wikidataSummary(qid) : null) ?? (wp ? await wikipediaSummary(wp.lang, wp.title) : null))().catch(() => null);
    summaries.set(key, p);
  }
  return p;
}

/**
 * OpenFreeMap (OpenMapTiles) feature ids encode the OSM object: id × 10 + 1 for nodes, 2 for
 * ways, 3 for relations.
 */
export function osmFromTileId(featureId: number | string | undefined): { type: OsmType; id: number } | null {
  const n = Number(featureId);
  if (!Number.isSafeInteger(n) || n < 10) return null;
  const type = ({ 1: 'node', 2: 'way', 3: 'relation' } as const)[n % 10 as 1 | 2 | 3];
  return type ? { type, id: Math.floor(n / 10) } : null;
}

import { parseCsv } from '../../lib/csv';
import type { LngLat } from '../../model/types';
import type { ParsedWaypoint } from './parse';

const NUM = '(-?\\d{1,3}\\.\\d+)';
const PATTERNS = [
  new RegExp(`!3d${NUM}!4d${NUM}`),
  new RegExp(`/maps/(?:search|place)/${NUM},\\s*\\+?${NUM}`),
  new RegExp(`[?&](?:q|query|ll|center|destination|daddr)=${NUM},\\s*\\+?${NUM}`),
  new RegExp(`@${NUM},${NUM}`),
];

/** Position from a Google Maps link, when the link contains one (many saved-place links don't). */
export function coordsFromGoogleUrl(url: string): LngLat | null {
  let s = url;
  try {
    s = decodeURIComponent(url);
  } catch {
    // Keep the raw link.
  }
  for (const re of PATTERNS) {
    const m = s.match(re);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return [lng, lat];
  }
  return null;
}

// Takeout names its columns in the account's language.
const TITLE = ['title', 'titre', 'titel', 'titulo', 'titolo', 'titulo', 'nome', 'naam', 'tytul', 'nazvanie', 'название'];
const NOTE = ['note', 'notiz', 'nota', 'notitie', 'notatka', 'заметка'];
const COMMENT = ['comment', 'commentaire', 'kommentar', 'comentario', 'commento', 'opmerking', 'komentarz', 'комментарий'];

export interface UnlocatedPlace {
  name: string;
  desc: string;
  url: string;
}

/**
 * A Google Takeout "Saved" list (CSV with Title, Note, URL columns). Null if the CSV isn't one.
 * Places whose link has no position are returned separately, to be looked up by name.
 */
export function parseGoogleList(text: string): { waypoints: ParsedWaypoint[]; unlocated: UnlocatedPlace[] } | null {
  const rows = parseCsv(text);
  const header = rows[0]?.map((h) => h.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')) ?? [];
  const col = (names: string[]) => header.findIndex((h) => names.includes(h));
  const title = col(TITLE);
  const url = col(['url']);
  if (title < 0 || url < 0) return null;
  const note = col(NOTE);
  const comment = col(COMMENT);
  const waypoints: ParsedWaypoint[] = [];
  const unlocated: UnlocatedPlace[] = [];
  for (const row of rows.slice(1)) {
    const name = row[title]?.trim() ?? '';
    const link = row[url]?.trim() ?? '';
    const desc = [row[note], row[comment]].map((v) => v?.trim()).filter(Boolean).join('\n');
    if (!name && !link) continue;
    const lngLat = link ? coordsFromGoogleUrl(link) : null;
    const links = link ? [link] : [];
    if (lngLat) waypoints.push({ name: name || 'Place', desc, lngLat, links });
    else unlocated.push({ name, desc, url: link });
  }
  return { waypoints, unlocated };
}

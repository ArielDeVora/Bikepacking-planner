// Fetches the US State Department travel advisory levels (public domain) into
// public/data/us-advisories.json. Run at build time: the API doesn't allow requests from browsers.
import { mkdir, writeFile } from 'node:fs/promises';

const URL = 'https://cadataapi.state.gov/api/TravelAdvisories';
const OUT = new globalThis.URL('../public/data/us-advisories.json', import.meta.url);

try {
  const res = await fetch(URL, { headers: { 'User-Agent': 'bikepacking-planner build (github.io)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const list = await res.json();
  const items = list.flatMap((a) => {
    const level = Number(/Level (\d)/.exec(a.Title ?? '')?.[1]);
    if (!level) return [];
    return [{ codes: a.Category ?? [], country: (a.Title ?? '').split(' - Level')[0].trim(), level, url: a.Link, updated: a.Updated }];
  });
  await mkdir(new globalThis.URL('.', OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify({ source: URL, fetchedAt: new Date().toISOString(), items }));
  console.log(`US travel advisories: ${items.length} countries`);
} catch (err) {
  // The app works without this file; it just won't show US levels.
  console.warn(`US travel advisories not updated: ${err.message}`);
}

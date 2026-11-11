// Service worker: lets the planner open and show its map without a connection. Built by
// scripts/sw-plugin.mjs, which fills in the build id and the list of the app's own files.
//
// - The app (its HTML, scripts, styles, icons) is kept for each build and served from the cache.
// - Map style, fonts and icons from OpenFreeMap: from the cache, refreshed in the background.
// - Map tiles from OpenFreeMap: every tile seen (and those saved along a stage) kept, served from
//   the cache first; kept under a weekly-changing address, so they're stored without the version.
// - Climate averages, travel advisories and country outlines: kept once fetched.
// - Everything else (the trip's database, routing, search, OpenStreetMap's own tiles, whose rules
//   don't allow keeping them) goes to the network as usual.

const BUILD = '__BUILD__';
const PRECACHE = __PRECACHE__;
const APP_CACHE = `app-${BUILD}`;
const STATIC_CACHE = 'map-static';
const TILE_CACHE = 'map-tiles';
const DATA_CACHE = 'data';
// Match stored copies by address only: servers send Vary headers (Origin, Accept-Encoding) that
// differ between how a file was stored and how the page asks for it.
const MATCH = { ignoreVary: true };
/** Seen tiles kept at most (saved ones count too); the oldest go first. */
const MAX_TILES = 12000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('app-') && k !== APP_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** A tile's address without OpenFreeMap's weekly version, so saved tiles keep matching. */
const tileKey = (url) => url.replace(/\/planet\/[^/]+\/(\d+\/\d+\/\d+\.pbf)$/, '/planet/$1');

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // The app's own files.
  if (url.origin === self.location.origin) {
    if (url.pathname.endsWith('/version.json')) return; // always asks the network (update checks)
    if (/\/(climate|data)\//.test(url.pathname)) return event.respondWith(cacheFirst(req, DATA_CACHE));
    if (req.mode === 'navigate') return event.respondWith(networkFirst(req, APP_CACHE, './index.html'));
    return event.respondWith(cacheFirst(req, APP_CACHE));
  }

  if (url.hostname === 'tiles.openfreemap.org') {
    if (url.pathname.endsWith('.pbf') && /\/planet\//.test(url.pathname)) return event.respondWith(tile(req));
    return event.respondWith(staleWhileRevalidate(req, STATIC_CACHE));
  }

  if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('natural-earth')) return event.respondWith(cacheFirst(req, DATA_CACHE));
});

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req, MATCH);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req, name, fallback) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(name)).put(fallback, res.clone());
    return res;
  } catch {
    return (await caches.match(fallback, MATCH)) ?? (await caches.match('./', MATCH)) ?? Response.error();
  }
}

async function staleWhileRevalidate(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req, MATCH);
  const fresh = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => hit ?? Response.error());
  return hit ?? fresh;
}

let stored = 0;
async function tile(req) {
  const cache = await caches.open(TILE_CACHE);
  const key = tileKey(req.url);
  const hit = await cache.match(key, MATCH);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok) {
      await cache.put(key, res.clone());
      if (++stored % 200 === 0) trim(cache);
    }
    return res;
  } catch {
    return new Response(null, { status: 204 }); // offline and not saved: an empty tile
  }
}

async function trim(cache) {
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_TILES))) await cache.delete(k);
}

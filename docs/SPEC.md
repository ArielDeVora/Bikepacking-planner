# Build a collaborative bikepacking trip planner (static web app on GitHub Pages)

## Context

I'm planning a ~1-year bikepacking trip starting mid-March 2027 with 3 friends: France → Mediterranean coast → Caucasus/Turkey → Central Asia (all the "-stans") → Mongolia → China (north to Vietnam, then back up the coast, partly by train) → Japan. That's roughly 15–25k km, dozens of borders, and a mix of bike, train, boat and plane legs.

We want **one shared map** that all 4 of us can edit, with gpx.studio-level editing tools. Ride with GPS paywalls the features we need, so we're building our own. It must be **free to run** and hosted as a **static site on GitHub Pages** (plus a free-tier backend for shared data).

Design goals, in priority order: **simple, lean, clean, modular, fast.** I will keep adding features for months, so the architecture matters more than feature count in v1. No bloat, no heavy UI framework kits, no premature abstractions — but a clear module boundary for every feature.

## How I want you to work

1. **Before writing code**, reply with a short plan: stack choices (with one-line justification each), folder structure, data model, module interface, and the milestone breakdown below. Flag anything in this spec that is unrealistic, costly, or legally dodgy. Wait for my OK.
2. Build milestone by milestone. At the end of each: it runs, it's committed, and you tell me what to test by hand.
3. Ask me before adding any dependency that isn't in the suggested stack, or any service that needs an API key or an account.
4. Never commit secrets. Only the Supabase anon key may be in the client (it's public by design; security comes from RLS).
5. Respect every third-party service's usage policy (tiles, Nominatim, Overpass, BRouter). Add caching, debouncing and a proper User-Agent / attribution everywhere. Never scrape sites that don't allow it.

## Suggested stack (challenge it if you have a better lean option)

- **TypeScript + Vite**, **Svelte 5** for UI (small, fast, what gpx.studio uses). Plain CSS with CSS variables; no CSS framework.
- **MapLibre GL JS** for the map (vector, WebGL, handles long routes).
- **Turf.js** (import only the functions used) for geometry: split, length, great-circle arcs, simplify, point-on-line.
- **@tmcw/togeojson** for GPX/KML import; write a small GPX exporter ourselves.
- **Supabase free tier**: Postgres + Realtime + Auth (magic link). Note: free projects pause after a week of inactivity — handle the "waking up" state gracefully and tell me how to keep it alive.
- **Vitest** for unit tests on the pure logic (geometry, GPX, commands, data model). No heavy E2E in v1.
- **GitHub Actions** → deploy to GitHub Pages on push to `main`.

## Architecture requirements

- **Core vs modules.** A small core owns: the map instance, the trip store, the command/undo system, selection state, persistence/sync, and a module registry. Everything else is a module.
- **Module interface** (adapt as needed): a module can register map sources/layers, a toolbar tool, a side-panel section, a popup renderer for its features, keyboard shortcuts, and settings. Adding a feature = adding a folder under `src/modules/` + one line in the registry. Modules talk through the store and a typed event bus, never by importing each other's internals.
- **All edits go through commands** (`do` / `undo`) so undo/redo works everywhere and every change maps to a sync operation.
- **Data model** — propose your own, but it must support:
  - `Trip` → ordered `Stage`s (e.g. a day or a leg) → ordered `Segment`s.
  - `Segment`: travel mode (`bike | walk | train | bus | boat | plane | car`), geometry type (`routed | manual | imported | greatCircle`), routing anchors (the user's control points), full-resolution geometry with elevation, name, notes, colour override, optional planned date.
  - `POI` / waypoint: category, name, notes, links, OSM id if from OSM, cached OSM tags, created by, status (idea / must-see / booked / skip).
  - `AvoidZone`: polygon, reason, severity, source, date added.
  - `BorderCrossing` annotation: linked to an OSM node if possible; our own status (open / closed to foreigners / unknown), notes, link to an external source (e.g. the Caravanistan page), last-verified date.
  - Every entity: `id` (uuid), `updatedAt`, `updatedBy`, soft delete.
- **Sync**: one row per entity (JSONB for geometry/properties is fine; PostGIS only if you can justify it). Optimistic local updates, Supabase Realtime to push changes to the others, last-write-wins per entity, and visible indicators of who changed what recently. Simple presence (who's online) is a nice-to-have.
- **Auth & sharing**: magic-link login, `trips` + `trip_members` tables, RLS so only members can read/write a trip. The trip owner can generate an invite link.
- **Performance**: the full trip will be tens of thousands of km. Keep full-resolution geometry in the store, but render simplified geometry at low zoom; split sources so editing one segment doesn't re-upload the whole trip to the GPU; debounce saves; lazy-load heavy modules.

## Features

### 1. Base maps & layers
- Background switcher: OpenFreeMap (vector, no key) as default, OSM standard, CyclOSM, OpenTopoMap, and a satellite option whose terms allow this use (check and tell me). Hillshading overlay if a free source exists.
- Layer panel to toggle every overlay, with per-layer opacity. Remember choices per user (localStorage, wrapped in try/catch).
- Search box for places (Photon or Nominatim, respecting their policies).

### 2. Route drawing that snaps to roads
- Click to add anchors; the segment between anchors is routed. Use **BRouter** (public brouter.de API, bike profiles like `trekking` / `fastbike` / gravel-ish profile) behind a `RoutingProvider` interface so I can swap in GraphHopper, OpenRouteService or a self-hosted BRouter later.
- Pass our **avoid zones as BRouter no-go polygons** so routing goes around them.
- Toggle per segment: snapped vs straight line (for tracks the router doesn't know).
- Only re-route the legs touched by an edit, cache routed legs, handle errors and rate limits gracefully (fall back to a straight line + warning).

### 3. Import / export
- Drag-and-drop **many GPX files at once** (also KML/GeoJSON). Each track becomes a segment (or a stage with segments, if the file has several tracks); GPX waypoints become POIs.
- Strip timestamps, keep elevation. Preview before confirming; let me choose which stage to import into.
- Export: whole trip, one stage, or one segment as GPX (track per segment, waypoints included), ready for Garmin/Wahoo. Also export/import a full trip backup as JSON.

### 4. Editing (gpx.studio-style)
- Select a segment → highlight it, show its stats and elevation profile.
- Drag anchors; drag the line to insert a new anchor; delete an anchor; insert/remove anchors in imported tracks (convert an imported track to editable anchors with sensible simplification).
- **Split** a segment at a point, **merge** adjacent segments, **reverse**, **duplicate**, **move** a segment to another stage, reorder segments and stages.
- Change a segment's travel mode, style and name.
- Erase a portion of a track (select a range on the map or the elevation profile).
- Full **undo/redo** (Ctrl+Z / Ctrl+Shift+Z) and keyboard shortcuts for the main tools.
- **Elevation profile** panel for a segment, a stage, or the whole trip: distance, D+, D−, max altitude, gradient colouring; hovering the profile shows the position on the map. Use elevation from BRouter for routed parts and a free DEM/terrain-tile source for imported or straight parts.
- Stats per stage and trip: km by travel mode, D+, number of days.

### 5. Travel-mode line styles
- Bike: solid line (colour per stage or per rider choice). Walk: thin dotted line.
- Train: dashed line in a rail style. Bus/car: distinct dash pattern.
- Boat: blue dashed line. Plane: **great-circle arc**, thin dashed, with a small plane icon at the midpoint.
- A legend that updates with the visible modes. Styles defined in one config file so I can tweak them.

### 6. POIs / things to see ("like Google Maps")
- Add a POI by clicking the map or from a search result; pick a category (sight, camp spot, water, food, bike shop, accommodation, visa/admin, border, other) with clean icons.
- Click any POI — ours or an OSM feature — to get an info card: name, category, notes, opening hours / phone / website from OSM tags if available, coordinates (copyable), elevation, distance from the route, and quick links (Google Maps, OSM, Wikipedia/Wikidata if tagged). Editable for our POIs.
- **OSM POI overlays** via Overpass, toggleable per category (bike shops, supermarkets, drinking water, campsites, hotels/guesthouses, pharmacies, ATMs). Query only for the current viewport above a minimum zoom, or along a corridor around a selected stage; cache results (IndexedDB) with a TTL; debounce; show a "zoom in to load" hint.

### 7. Avoid zones
- Draw / edit / delete polygons for areas we must not go through; reason + severity (no-go / caution). Rendered as red hatched fills with a label.
- Used by the router (see §2). Warn if an existing segment crosses an avoid zone.

### 8. Borders & border crossings (Caravanistan-like)
- Country borders clearly visible at every zoom, styled stronger than the base map (from the vector tiles' admin-level-2 boundaries, or Natural Earth as a fallback), with country labels. Optional: disputed boundaries styled differently.
- **Border crossing points** from OSM (`barrier=border_control` and related tags), loaded via Overpass for the viewport or the route corridor, with a dedicated icon.
- On click: OSM info + our own annotation layer (status open / closed to foreigners / unknown, notes, external link, last verified). Do **not** scrape Caravanistan; we'll paste links and notes ourselves.
- Show where the route crosses a border, and list all crossings along the trip in a panel.

### 9. Conflict / risk zones layer (research first)
- I'd like an overlay of current conflict / high-risk areas. **Research and propose 2–3 data sources** with their licence and update frequency (e.g. UCDP open data, ACLED with an account, government travel advisories such as France Diplomatie's "Conseils aux voyageurs" if a machine-readable form exists). Don't integrate anything whose terms forbid it.
- Fallback that must exist anyway: a manually maintained "risk zones" layer (like avoid zones, but informational, with a source link and a date) and GeoJSON import for it.
- Always show the data date and a disclaimer pointing to official travel advice.

### 10. Collaboration UX
- Each user has a colour; show who last edited a segment/POI and when.
- Comment threads on any segment, POI or zone (simple, stored in Supabase).
- Live updates when someone else edits; never lose an edit silently.

## UI

- Clean and minimal: the map takes the whole screen; a collapsible left panel (trip tree: stages → segments, POIs, zones); a slim toolbar; an elevation profile drawer at the bottom; an info card on selection.
- Light/dark theme. Desktop first, but usable on a phone for viewing.
- UI in English, with strings in one place so French can be added later.
- Units: metric.

## Milestones (adjust in your plan)

1. **Skeleton**: Vite + Svelte + TS, MapLibre with the base-map switcher, module registry, store, command/undo system, GitHub Pages deploy via Actions. Local-only persistence (IndexedDB).
2. **Routes**: draw snapped routes (BRouter), travel modes + line styles, segment selection, anchor editing, undo/redo.
3. **Import/export**: multi-GPX import, GPX/JSON export, elevation profile + stats.
4. **Advanced editing**: split / merge / reverse / move / erase range, editable imported tracks.
5. **POIs**: our POIs + info cards + search + Overpass overlays.
6. **Zones & borders**: avoid zones (with routing integration), borders, border crossings + annotations.
7. **Collaboration**: Supabase schema + RLS, auth, invites, realtime sync, presence, comments. Migration of local data into a shared trip.
8. **Risk layer**: per your research from §9.

For each milestone, add a short `docs/` entry (what was built, how the module works, how to extend it), and keep the `README` up to date with setup steps — including exactly what I need to click in Supabase and GitHub, since I'll be doing that part.

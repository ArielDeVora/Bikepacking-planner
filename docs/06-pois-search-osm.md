# Milestone 6: Places, search and OpenStreetMap overlays

## What was built

- **Our places (POIs)**: press `P` (or the pin button) and click the map. Each place has a category (sight, nature & landscape, camp spot, water, food, bike shop, accommodation, visa/admin, border, other) with its own icon and colour, a status (idea, must-see, booked, skip), notes and links. Must-see places get a gold ring, booked ones a green ring, skipped ones are faded. On shared trips, a small dot in someone's colour shows who added each place (it can be turned off in Settings); the **Places** list filters by status and by who added them, and **By country** groups the list by country (Natural Earth outlines, loaded on demand).
- **Folders** (Places list): the folder button adds one; drag places onto a folder (a selected place brings the other selected places along), onto **Not in a folder** to take them out, or pick the folder in the place card. Folders fold open and closed (remembered per browser), the eye hides a folder's places from the map, and clicking a folder selects it: its places are highlighted and its card renames or colours it. Deleting a folder keeps its places. Folders are shared like everything else (entity type `poiFolder`; a place's `folderId`). With **By country** ticked, the list is grouped by country instead. Drag a selected place to move it. `Delete` removes it. Comments work on places too.
- **Place card** (for our places, search results and OSM features): opening hours, phone, website and address when OSM has them, coordinates (click to copy), elevation, distance from the route (nearest segment), and links to Google Maps, OpenStreetMap, Wikipedia/Wikidata (when tagged), and Amap/Baidu for places in China (with the WGS84 flag, so the position isn't shifted).
- **Places list** in the side panel, filterable by status; click to select and fly there.
- **Search** box at the top of the map (`/` to focus): places worldwide via Photon, biased to the map's centre, or coordinates: decimal (`41.69, 44.80`, latitude first; `41,69; 44,80`), degrees/minutes/seconds with or without hemispheres (`41°41'24"N 44°48'00"E` as Google Maps copies it, `N 41° 41.4' E 44° 48'`, `41 41 24 N 44 48 0 E`, `41d41m24s N`), or `41.69N 44.8E`. Letters can put longitude first (`44.8E 41.69N`); S and W are negative. The box shows the position it read, and Enter goes there (`src/lib/geo/coordinates.ts`). Choosing a result shows its card; **Add to trip** turns it into one of our places, keeping its OSM reference.
- **Base-map places** and richer details (opening hours from Nominatim, Wikipedia summaries) came in [milestone 7](07-zones-borders.md#base-map-places).
- **OSM overlays** (map pane: `O`, or the layers button at the top of the side panel): bike shops and repair stations, food shops, drinking water, campsites, hotels/hostels/huts, pharmacies, ATMs. Loaded from Overpass for the visible area from zoom 12, or along a whole stage with **Load OSM places along this stage** in the stage card. Click one for its card and **Add to trip**.
- **Google Maps lists**: import a list exported from Google Takeout (CSV) or from Google My Maps (KML). Re-importing a newer export updates matching places instead of duplicating them (see below).

## Files

```
src/config/pois.ts            POI categories (colour, icon), OSM overlay categories (Overpass filters)
src/lib/places/               place links, nearest segment, POI creation, PlaceInfo / PlaceCard
src/lib/photon.ts             Photon search client
src/lib/map-icons.ts          round map icons drawn on a canvas
src/lib/dem.ts                terrain elevation (shared by the profile and the place card)
src/lib/csv.ts                CSV parser
src/modules/pois/             our places: map layers, add tool, dragging, card, Places list
src/modules/search/           search box
src/modules/osm/              Overpass loader (queue, cache), overlays, stage prefetch
src/modules/io/google.ts      Google Takeout list parsing, positions from Google Maps links
```

New core hooks: `ui.showPlace(component, props)` shows a card for something that isn't a trip entity (closed when an entity is selected, on Esc, or by clicking empty map), and widgets can sit along the top of the map (`position: 'top'`).

## Overpass usage

The public Overpass server allows about 10,000 requests and 1 GB a day per user, and asks clients to back off when it's busy. The app:

- fetches per map tile (zoom 11, about 15 × 20 km in Europe), all missing categories in one request;
- sends one request at a time, at least 1.5 s apart, with a 40 s timeout;
- when the server is busy or a request fails, waits 30 s and doubles the wait after each further failure (up to 10 minutes), showing "Overpass is busy" meanwhile;
- caches each tile and category in IndexedDB for 14 days, so panning back, reloading, or a second look at a stage costs nothing;
- drops queued tiles that have scrolled out of view (except tiles queued along a stage).

The public server is sometimes at capacity for minutes at a time; places then appear late.

## Google Maps lists

Google has no API for saved lists, and reading a shared list's page would be scraping, which Google's terms forbid (and which we agreed not to do). What works:

1. **Google Takeout** (only lists you created): [takeout.google.com](https://takeout.google.com) → deselect all → select **Saved** → export. Each list is a CSV file with Title, Note, URL. Drop the CSV into the app.
   - Many saved-place links carry no coordinates. Those places are listed in the import dialog with **Look them up by name**, which searches each name (via Photon, one per second, biased to the list's other places). Check the matches before importing.
   - The Google link is kept on each place, so **Google Maps** is one click away and re-imports can match it.
2. **Google My Maps**: if the list lives in a My Maps map, use its menu → **Export to KML/KMZ** → KML. KML placemarks have coordinates, so nothing needs looking up.

**Keeping in sync**: re-import a fresh export whenever the Google list changes. A waypoint that matches an existing place (same Google link, or same name within 300 m) only adds missing links and fills empty notes; nothing is duplicated, and places you moved or renamed in the app stay as they are. Places deleted from the Google list are not deleted from the trip.

Since the trip is shared and live, the simplest long-term setup is to import the Google list once and keep adding places in the app.

## Terms of the services used

| Service | Used for | Terms |
| --- | --- | --- |
| Photon (photon.komoot.io) | search, looking up list places by name | Free, fair use ("extensive usage will be throttled"). Queries are debounced (350 ms, 3+ characters) and cached. |
| Overpass API (overpass-api.de) | OSM overlays | About 10,000 requests / 1 GB per day; back off when busy. See above. |
| OpenStreetMap data | everything above | ODbL, attribution shown on the map. |

## Known limitations

- OSM overlays don't load below zoom 12 (too many tiles); places already loaded stay visible.
- Search results carry only one OSM tag (their type); opening hours etc. appear for OSM overlay features, not for search results.
- Waypoints imported from GPX files before this milestone show up now, with the category "other".

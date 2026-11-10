# Milestone 7: Avoid zones and borders

Also in this milestone, following feedback on milestone 6: clickable base-map places, richer place details, Overpass failover, and Google lists exported in other languages.

## Avoid zones

- **Draw** with `Cmd+A` (or the hatched-shape button): click the corners, then click the first corner or press `Enter`. `Esc` cancels.
- **No-go** zones (red hatching) are sent to BRouter as no-go polygons, so new routes go around them. **Caution** zones (orange) are only shown and warned about.
- **Edit** the selected zone: drag its corners, drag the small dots between corners to add one, right-click a corner to remove it. Click inside a zone to select it (the smallest zone wins where they overlap; segments, places and crossings on top of a zone take the click first).
- **Card**: name, severity, reason, source and source link, date added, and the segments that go through it, with **Re-route around it**. Only the legs that enter the zone are sent back to the router.
- **Warnings**: a segment card says when the segment goes through an avoid zone. Routed segments get a Re-route link; drawn or imported ones need their points moved. Drawing a new no-go zone over existing routes offers to re-route them straight away.
- **Avoid zones** in the side panel lists them.

Zones use the `Zone` entity with `kind: 'avoid'`; milestone 8 adds `kind: 'risk'` on the same entity.

## Borders

- **Country borders** are drawn in violet over every base map (including satellite), stronger than the base map's own, from the OpenFreeMap tiles' boundary layer (country level, land only). Disputed borders are dashed. On raster base maps, country names are added too. Toggle in the map pane (`Cmd+O`) → Map → Country borders.
- **Border crossings along the trip** (side panel → Border crossings → Find border crossings): the trip is checked against country outlines from Natural Earth (public domain, 1:50m), downloaded once (~3 MB, then cached by the browser). Ground segments are sampled every 2 km and each change of country is narrowed down to ~150 m on the line; flights and ferries count by the countries at both ends. Only continuous parts of the trip count: when one segment ends more than 5 km from where the next one starts (a part not drawn yet, tracks imported out of order), nothing is reported across the gap. Crossing a border and back within 3 km (a road running along it) isn't reported either. Crossings are listed in trip order with their kilometre, and shown on the map as violet dots on the route. The list updates by itself as the trip changes.
- **Crossing card** (click a dot or a list row): the countries, the kilometre and segment, the nearest OSM border posts (`barrier=border_control` within 8 km, via Overpass, cached 30 days), and **Add notes** at a border post or at the crossing point.
- **Our notes** (`BorderCrossing` entity): status (open / closed to foreigners / unknown, shown as a green / red / grey flag), notes, a link (paste the Caravanistan page, for instance), last verified date, plus the usual place info (OSM details for the post, elevation, links). They sync and take comments like everything else. Nothing is fetched from Caravanistan.

Natural Earth outlines are accurate to about a kilometre, so a route running along a border can show a crossing that isn't real (or miss a very short one). The OSM border posts and your notes are the precise part.

## Base-map places

The places drawn by the OpenFreeMap base map itself (shops, restaurants, cafés, sights, hotels… from zoom 15) are now clickable, with the same card as everything else and **Add to trip**. Their OSM id comes with the tile (feature id = OSM id × 10 + 1 for nodes, 2 for ways, 3 for relations), so no Overpass request is needed. This is the most reliable way to explore what's around; the Overpass overlays remain for scanning wider areas and along stages.

## Richer place details

When a card opens for an OSM object (base-map place, overlay feature, search result, or one of our places added from OSM):

- **Nominatim** fills in the full tags: opening hours, phone, website, email, cuisine, address, and the English name when OSM has one. One request per card, at most one per second, cached for the session (Nominatim's usage policy).
- **Wikipedia / Wikidata**: if the place is linked, a short summary and photo (the English article when one exists).

Google ratings, reviews and photos aren't available: they need Google's Places API (an account with billing), whose terms require its data to be shown on a Google map, not on ours.

## Overpass failover

Overpass requests now go to `overpass-api.de` first, then `overpass.private.coffee`, then `maps.mail.ru` (the latter two state no request limits). Only when all three fail in a row does the app wait (30 s, doubling up to 10 minutes). Each request times out after 40 s. On some days all three public servers are overloaded; places and border posts then appear later.

## Google lists in other languages

Takeout names its CSV columns in the account's language ("Titre, Note, URL, Tags, Commentaire" in French). The import now recognises the common languages.

Takeout only exports the places you added yourself, even for a shared list. To bring in everyone's places, each person exports their own Takeout and drops it in; matching on re-import avoids duplicates.

## Files

```
src/modules/zones/         editor (draw, select, corners), crossings (segments × zones), card, list
src/modules/borders/       border styling, countries (Natural Earth, crossing detection),
                           posts (Overpass border controls), crossing card, notes card, list
src/lib/geo/geo.ts         point in polygon, segment intersection, line × polygon, bbox
src/lib/places/details.ts  Nominatim details, Wikipedia/Wikidata summary, OpenFreeMap feature ids
src/lib/overpass.ts        Overpass servers and failover
src/lib/cache.ts           IndexedDB cache for fetched data
```

Core: `ui.addPointLayer(id)` registers a layer of clickable markers (places, crossings, OSM overlay icons); the route editor leaves clicks on them alone, so a marker sitting on a route opens its own card. `ui.claim(event)` / `ui.claimed(event)` let a click handler mark a map click as handled, so handlers for things underneath (a zone around a segment, a base-map place under a POI) leave it alone. Module order in `src/modules/index.ts` sets who looks first.

# Milestone 4: Import, export, elevation and stats

## What was built

- **Import** (side panel → Import / export, or drop files anywhere on the page): GPX, KML, TCX and GeoJSON, many files at once.
  - A preview lists every file's tracks (distance, points, whether they have elevation) and waypoints, and draws them on the map.
  - Choose where they go: **Automatic** (single-track files into the selected or last stage, files with several tracks into a new stage named after the file), **a new stage per file**, or a specific stage. Choose the travel mode.
  - Each track becomes a segment; each `trkseg` of a track becomes a leg, with short straight legs bridging gaps. Waypoints become POIs (they appear on the map with the POI milestone).
  - Timestamps are dropped, elevation kept. Tracks are simplified with a 3D Douglas-Peucker at 2 m (points within 2 m of the line, elevation included, are dropped), which shrinks dense GPS logs a lot without visible change.
  - One undo step for the whole import.
- **Export**: the whole trip as GPX (optionally bike and walk segments only), a stage or a segment as GPX (links in their cards). One track per segment, named after it, with the stage as description and the travel mode as `<type>`. Waypoints: all POIs for the trip, POIs within 1 km for a stage or segment. No timestamps, so Garmin/Wahoo treat it as a course.
- **Backup**: the whole trip as JSON. Dropping a backup file restores it as a new trip (fresh ids, so it never clashes with the original).
- **Elevation profile** drawer (toolbar mountain button, or `E`): segment, stage or whole trip (planes left out). Distance, climb, descent, highest point; the area is coloured by gradient; hovering shows distance, elevation and gradient, and a marker on the map.
- **Terrain elevation**: straight and imported legs of bike and walk segments that have no elevation get it from the AWS Terrain Tiles (straight legs are sampled every 100 m). Routed legs use BRouter's elevation.
- **Stats**: a Stats section for the trip (km and climb by travel mode, total, climb on bike and on foot, number of stages, days between the first and last planned date) and the same per stage in the stage card.
- **Trip tree**: in a shared trip, every stage and segment shows a dot in the colour of whoever changed it last (you included); hover it for name and time.

## Files

```
src/modules/io/
  parse.ts              files → tracks and waypoints (via @tmcw/togeojson), backup detection
  importer.ts           tracks/waypoints → one command (stages, segments, POIs)
  gpx.ts                GPX writer, file download
  export.ts             trip / stage / segment → GPX
  backup.ts             JSON backup and restore with fresh ids
  ImportDialog.svelte, IoSection.svelte, ExportLink.svelte, DropHint.svelte
src/modules/elevation/
  dem.ts                Terrarium tile loading, decoding, bilinear sampling, cache
  terrain.ts            which legs need terrain elevation, and writing it in
  profile.ts            profile data, interpolation, gradient colours
  ProfileDrawer.svelte
src/modules/stats/      totals by mode, days; trip section and stage card section
src/config/terrain.ts   terrain tile source (shared with the hillshading)
```

New core UI hooks: `ui.addDrawer` (full-width panels along the bottom of the map, with the legend stacked above), `ui.openDialog` / `ui.closeDialog` (one modal at a time), and `trips.add(entities)` to save and open a complete trip.

## How terrain elevation works

Like routing (milestone 2), it fills in derived data with `commands.patch`, so it adds no undo step:

1. For every bike or walk segment, legs whose points have no elevation (and that aren't waiting for the router) are listed.
2. Their points are looked up in Terrarium tiles at zoom 12 (about 30 m per pixel), with bilinear interpolation. Tiles are cached in memory (128 tiles).
3. The leg is replaced by the same line with elevation, unless it changed meanwhile. Stats follow.

In a shared trip, each browser only fills in its own edits (or anyone's that are still missing elevation after 30 s), so two browsers don't write the same thing.

Train, bus, car, boat and plane segments get no terrain elevation: a straight line across mountains says nothing about the real climb. `terrain` in `src/config/modes.ts` controls this per mode.

## Imported segments

An imported track keeps its geometry exactly, and changing its travel mode only changes the style. To edit its points, use **Make editable** (see [milestone 5](05-advanced-editing.md)).

## Known limitations

- Very large files (hundreds of thousands of points) take a few seconds to parse.
- KML `gx:Track` and GPX routes are imported as tracks; GPX extensions (heart rate, etc.) are ignored.
- The profile is recomputed when anything in the trip changes; with very long trips, editing while the trip profile is open may feel slower.
- Waypoints imported as POIs are invisible until the POI milestone.

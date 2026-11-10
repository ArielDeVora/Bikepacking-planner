# Milestone 2: Routes

## What was built

- **Draw tool** (toolbar, or `D`): click the map to add points; the segment between two points is routed by BRouter. `Esc` or `D` finishes.
  - With a segment selected, new points extend that segment.
  - With a stage selected (or nothing selected), the first two clicks start a new segment in that stage (or the last stage).
  - Points snap to the start or end of any segment within 10 px, so consecutive segments join up.
- **Editing the selected segment**: drag a point to move it; hover the line and drag the white dot to insert a point; right-click a point (or click it and press `Delete`) to remove it. `Delete` with no point selected removes the segment. Removing a point from a two-point segment removes the segment.
- **Segment card**: name, travel mode, snap to roads/railways, routing profile, colour, planned date, notes, distance / climb / descent, routing status with a Retry button.
- **Travel modes and line styles** from one config file, with a legend (bottom left) that lists the modes visible on screen. Planes are drawn as great-circle arcs with a plane icon.
- **Trip tree**: segments under each stage, with kilometres per segment and stage; click to select (the map pans to it if it's off screen), drag to reorder, delete.
- Every edit is one undo step.

## Files

```
src/config/modes.ts              travel modes: geometry type, snapping, line styles, stage colours
src/lib/geo/polyline.ts          polyline encoding with an optional elevation channel
src/lib/geo/geo.ts               distance, great-circle arcs, climb/descent, closest point on a line
src/model/segment.ts             pure segment edits: insert / move / remove anchor, rebuild legs, stats
src/modules/routes/
  index.ts                       module wiring: tool, shortcuts, card, legend
  editor.ts                      map interactions (draw, drag, insert, delete)
  render.ts                      sources and layers
  actions.ts                     command builders: create segment, change mode / snapping / profile
  routing/provider.ts            RoutingProvider interface
  routing/brouter.ts             BRouter implementation
  routing/queue.ts               one-at-a-time request queue with cache
  routing/reconcile.ts           routes pending legs and writes the results
  SegmentCard.svelte, Legend.svelte
```

## How routing works

A segment has `anchors` (the points you placed) and `legs`, one per pair of consecutive anchors. Each leg is an encoded polyline, with elevation when the router supplied it.

1. An edit (add, move, insert, remove a point) only redraws the legs next to the changed anchor. For a routed segment, each redrawn leg is a straight placeholder marked `status: 'pending'` (drawn grey and dashed). The edit is committed straight away as one command.
2. The reconciler watches the store. For every pending leg it asks the routing queue for a route from its start anchor to its end anchor.
3. The queue sends one request at a time, at least 250 ms apart, with a 45 s timeout. Identical requests share one call, results are cached in memory (1,000 legs), and a request is dropped before sending if the leg it was for has been edited or undone in the meantime.
4. The result replaces the pending leg through `commands.patch`, which writes without adding an undo step. Undo and redo bring back whatever the command stored. If that is a pending leg, it gets routed again, normally straight from the cache, so it appears instantly.
5. If routing fails, the leg is kept straight and marked `failed` (red, dashed), and a toast explains why. If the service says it's overloaded, the queue also pauses for 15 s. The segment card has a Retry button.

Pending legs are saved like everything else, so legs that were still routing when the tab closed are routed on the next load.

Avoid zones (milestone 7) are already passed to BRouter as no-go polygons: every `zone` with `kind: 'avoid'` and `severity: 'nogo'`.

## Travel modes

`src/config/modes.ts` is the one place to tweak how modes look and behave:

| Mode | New segments | Snap option | Line |
| --- | --- | --- | --- |
| Bike | routed (`trekking`) | roads | solid, stage colour |
| Walk | routed (`hiking-mountain`) | roads | dotted, stage colour |
| Train | straight | railways (`rail` profile) | dark line with white ties |
| Bus | straight | roads (`car-fast`) | purple, long dashes |
| Car | routed (`car-fast`) | roads | grey, short dashes |
| Boat | straight | none | blue dashes |
| Plane | great-circle arc | none | thin grey dashes, plane icon |

Bike and walk lines use the stage's colour. New stages get colours from `STAGE_COLORS` in turn.

Each segment can override its line: **colour** (any mode), **width** (1 to 10 px) and **pattern** (solid, dashed, dotted, long dashes), from the segment card, or for every selected segment from the multiple-selection card. "Mode" or the × next to a field goes back to the travel mode's style. Overrides are stored on the segment (`color`, `lineWidth`, `dash`), so everyone sees them. Segments with their own pattern are drawn by two extra layers per source (round ends for solid and dotted, flat ends for dashes); the patterns are in `LINE_DASHES` in `src/config/modes.ts`.

Changing a segment's mode gives it the new mode's geometry type and default profile, and redraws its legs if that changes how they're drawn. BRouter profiles per mode are listed in `routing/brouter.ts`; the first one is the default.

Long train or bus legs (hundreds of kilometres) can time out on the public BRouter server. Add more points, or leave snapping off.

## Swapping the router

Implement `RoutingProvider` (`routing/provider.ts`): an id, a label, the profiles offered per travel mode, and `route(request, signal)`, which returns `[lng, lat, ele?]` coordinates or throws a `RoutingError` (`rateLimit`, `noRoute`, `network`, `timeout`, `server`). Then pass it to `new RoutingQueue(...)` in `routes/index.ts`. A self-hosted BRouter only needs a different endpoint in `brouter.ts`.

## Usage policy

`brouter.de` is a free public server funded by donations. We send one request at a time, only for legs that changed, cache the results, and stop for a while when it says it is busy. Browsers don't let a page set its own `User-Agent`; requests carry the site's origin instead.

## Performance

- The selected segment has its own GeoJSON source. Editing it re-uploads only that segment, not the whole trip.
- Every other segment lives in a second source, rebuilt only when one of them (or a stage colour) changes. Decoded features are cached per segment.
- MapLibre simplifies GeoJSON per zoom level, which covers rendering long routes at low zoom.

## Known limitations

- Map editing needs a mouse. On a phone you can view and select, but not drag points.
- A point stays where you clicked, even when the router starts the line at the nearest road a few metres away.
- No elevation for straight or arc legs yet (terrain tiles come with the elevation profile in milestone 4).

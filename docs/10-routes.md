# Routes

A trip can hold several **routes**: different ways of doing it, such as the plan from the Rerouting team, another group's route, or your own variant. Each route has its own stages (and their groups and segments). Stages that aren't in a route stay directly in the trip, as before, so existing trips don't change.

## Using routes

- **Add a route**: the route button at the top of the side panel. Or select several stages (Cmd/Ctrl+click, Shift+click) and click **Make a route** in the card: the route takes the place of the first stage.
- **Put stages in a route**: drag a stage onto the route (it goes at the end), or between two stages of the route. Drag it out, above or below a route or a loose stage, to take it out. A single stage can also be moved with the **Route** menu in its card. Routes are dragged above or below other routes and loose stages.
- **Add a stage** (+) with a route (or anything in it) selected: the new stage goes at the end of that route. Drawing with a route selected adds to its last stage; importing with a route selected puts new stages in it.
- **Compare**: the eye hides a whole route. The target button on a route row shows **only** that route on the map; click it again to show everything. The Stats section lists each route's distance, climb and stage count side by side.
- **Route card**: name, source (who made it), link, colour, notes, stats, GPX export of the whole route, OSM places along it, comments, and:
  - **Duplicate**: copies the route with all its stages, groups and segments, right after it. Change the copy to try a variant; the original stays as it is.
  - **Remove route**: keeps its stages in the trip, where the route was.
  - **Delete route and stages**: deletes everything in it (undo brings it back).
- **Colour**: a route's colour is used for its bike and walk segments instead of the stage colours, so routes are easy to tell apart. A group's or segment's own colour still wins. The × goes back to the stage colours.
- **Map, profile**: selecting a route highlights all its segments; the elevation profile then shows the whole route. With a stage or segment of a route selected, the profile has a **Route** button too.
- Stage menus (move segments to a stage, import into a stage) show stages as "Route › Stage".

The "Trip" view of the profile, the trip GPX export, border crossings and travel advice still cover everything in the trip, all routes together.

## How it's stored

`route` is a new entity type (`Route`: `order`, `name`, `notes`, `color?`, `source?`, `sourceUrl?`), synced like everything else; no database change. A stage in a route has a `routeId`. As with groups, order keys work in two spaces: the trip's routes and loose stages share one order, and a route's stages are ordered among themselves. A stage whose route was deleted elsewhere counts as loose.

`src/lib/tree.ts` gives the order (`tripChildren`, `routeStages`, `sortedStages`, `routeSegments`, `segmentsOf`, `ancestorIds`, `stageLabel`, `routeOf`). Commands are in `src/lib/route-edits.ts` (`addStageCommand`, `addRouteCommand`, `moveTopCommand`, `makeRouteCommand`, `dissolveRouteCommand`, `deleteRouteCommand`, `duplicateRouteCommand`).

Visibility checks a segment against itself, its group, stage and route (`visibility.anyHidden(ancestorIds(...))`).

## Files

```
src/lib/route-edits.ts                 route commands
src/lib/tree.ts                        + routes in the trip order
src/modules/trip-tree/RouteCard.svelte route card
src/modules/trip-tree/TripTree.svelte  route rows, drag and drop, show only
src/modules/stats/TripStats.svelte     routes side by side
```

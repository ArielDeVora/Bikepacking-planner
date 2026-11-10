# Milestone 8: Risk layer, and editing from the side panel

## Data sources (research)

| Source | What it gives | Licence / access | Used? |
| --- | --- | --- | --- |
| **UK FCDO travel advice** (GOV.UK Content API) | Per country: alert level ("advises against all travel to parts of the country"…), the named areas, the advice text, an official map image, last update. Updated whenever the advice changes. | Open Government Licence v3.0. No key; the API allows requests from browsers. | **Yes**, live, cached a day. |
| **US State Department travel advisories** | Per country: level 1 (normal precautions) to 4 (do not travel), last update. | US government work, public domain. No key, but the API doesn't allow requests from browsers. | **Yes**, fetched when the site is built (daily rebuild). |
| **France Diplomatie, Conseils aux voyageurs** | Per country advice with colour-coded maps. | No live machine-readable feed; data.gouv.fr only has a one-off snapshot from June 2023. | **Link only.** |
| **UCDP** (Uppsala Conflict Data Program, GED events) | Geocoded conflict events, yearly plus monthly preliminary releases. | CC BY 4.0, but the API now requires an access token (an account). | Not yet: needs your OK for an account. |
| **ACLED** | Geocoded conflict and protest events, weekly. | Account required; terms restrict redistributing the data. | No. |

None of these publishes the advisory *zones* as polygons. Zones within a country (e.g. "within 20 km of the border") are drawn by hand from the official maps, as risk zones.

## What was built

- **Travel advisory levels** overlay (Map section): countries coloured by US level, from green (1) to red (4). Click a country for its advice card. Loaded when first switched on (country outlines ~3 MB, shared with border crossings).
- **Travel advice** (side panel): the countries the trip passes through, in order, with their US level. Click one for:
  - UK FCDO: alert level, the areas it names, its official map (click to enlarge), link and update date;
  - US: level and link;
  - France Diplomatie: link;
  - a disclaimer and the data dates.
- **Risk zones**: any zone can be switched between *Avoid zone* (routing and warnings) and *Risk zone* (information only, purple hatching) in its card. Risk zones carry a source, a source link and the date of the information, and show a disclaimer. Segment cards mention risk zones they pass through.
- **GeoJSON/KML import of areas**: polygons in an imported file can be brought in as risk zones (default) or avoid zones. Names, descriptions and links are taken from the file; the file name becomes the source, today the data date.

### How the US data gets in

`scripts/fetch-advisories.mjs` (run as `npm run advisories`) writes `public/data/us-advisories.json`. The deploy workflow runs it before each build, and the workflow now also runs every morning (04:41 UTC) to refresh it. The file isn't committed. Locally, run `npm run advisories` once; without the file, the app just shows no US levels.

The State Department identifies countries with FIPS codes, which clash with ISO codes (FIPS "CH" is China, ISO "CH" is Switzerland), so advisories are matched by country name, with a few aliases.

## Editing from the side panel

- **Several at once**: Cmd/Ctrl+click adds or removes a stage or segment from the selection; Shift+click selects everything in between. Cmd/Ctrl+click also works on routes on the map.
- **Multiple-selection card**: total distance and climb, **Fuse** (smart merge, below), **Put in order**, **Group**, **Delete**, **Move the segments to** a stage.
- **Drag and drop** segments in the tree:
  - drop between two segments to move it there (into another stage too);
  - drop onto a segment to fuse it into that one (smart merge, below);
  - drop onto a stage to move it to the end of that stage.
  Dragging a selected segment drags the whole selection.
- **Stages** can be dragged too: above or below another stage to reorder (selected stages move together).
- **Groups** within a stage (see below).
- **Eye** on each segment and stage: hides it from the map (or shows it again); hiding a stage hides all its segments. **Show all** at the top brings everything back. This is a viewing preference, kept per trip in each browser and not shared (`ctx.visibility`, `src/core/visibility.ts`).
- **Collapse**: the arrow next to a stage hides its segments in the list; the button at the top collapses or expands every stage. Remembered per trip in each browser.
- **Panel width**: drag the panel's right edge (260 to 640 px); double-click it for the default. Remembered in each browser.
- **Details card size**: drag the card's left edge for its width (260 to 720 px) and its bottom edge for its height; double-click an edge to reset it. Remembered in each browser. On a phone the card keeps its fixed layout.
- **Selection on the map**: the selected segments get a yellow glow with a white edge, and the other segments fade. Selecting a stage or group highlights all its segments; a multiple selection highlights everything in it. Colours and the fade are `HIGHLIGHT` and `DIMMED` in `src/modules/routes/render.ts`.
- Items are reordered by dragging only; the tree has no move up/down buttons.
- **Import** has its own toolbar button (`I`), always visible.

## Groups

A stage can hold groups of segments (a day, a detour, a variant…), next to segments that aren't in a group.

- **Create**: select segments (Cmd/Ctrl+click, Shift+click), then **Group** in the multiple-selection card, or press **G**. The group takes the place of the first segment, and its segments are put in order along the route (see smart merge). A group stays within one stage: when the selection spans stages, only the first stage's segments are grouped, and a toast says so. A single selected segment can be grouped too.
- **Tree**: a group row has a folder icon in the group's colour, its total distance, an arrow to collapse it, an eye, **Ungroup** and delete. Shift+click ranges include groups and the segments inside them.
- **Drag and drop**:
  - a segment dropped onto a group goes in at the end; dropped between two segments of a group, it goes there; dragged out between items of the stage, it leaves the group;
  - a group is dragged between the items of its stage, or onto another stage (its segments go with it). Groups can't go inside groups;
- **Group card**: name, planned date, colour, notes, stats, **Put in order**, **Ungroup** (keeps the segments where the group was), **Delete group and segments**, GPX export, OSM places along it, and comments.
- **Colour**: bike and walk segments use the group's colour instead of the stage's (a segment's own colour still wins). The × next to it goes back to the stage colour.
- **Map and profile**: the eye on a group hides its segments; selecting a group highlights its segments on the map and highlights them in the stage's elevation profile.
- **Drawing** with a group (or one of its segments) selected adds the new segment at the end of the group.
- Merging with the next segment (**M**) only joins segments of the same group; fusing several (from the card or by drag and drop) works across groups.
- **Delete** (key or card) on a group deletes its segments too; undo brings everything back.

### How groups are stored

`group` is a new entity type (`Group`: `stageId`, `order`, `name`, `notes`, `color?`, `plannedDate?`), synced like everything else (no database change). A segment in a group has a `groupId`. Order keys work in two spaces: a stage's groups and ungrouped segments share one order (the stage's children), and a group's segments are ordered among themselves. A segment whose group was deleted elsewhere counts as ungrouped.

Everything that lists segments in trip order uses `src/lib/tree.ts` (`stageChildren`, `groupSegments`, `stageSegments`, `tripSegments`, `segmentsOf`): GPX export, border crossings, travel advice, the elevation profile, stats, the importer and drawing. Group commands (`groupCommand`, `ungroupCommand`, `moveIntoCommand`, `deleteGroupCommand`, `removeChanges`) are in `src/lib/segment-edits.ts`.

## Smart merge and put in order

Imported tracks often come out of order, or drawn the other way round. Fusing them as they are gave zig-zags: a segment joined by its wrong end, a long straight line across the map. Now:

- **Fuse** (multiple-selection card), **drop a segment onto another**, and **Merge with next** (`M`) first work out how the segments fit end to end: the order, and which ones to turn round, so that each starts where the previous one ends. Then they're joined. The fused segment keeps the identity (name, comments) of the first in trip order, or of the one you dropped onto, or the one you pressed M on. A message says what happened: "Fused 3 segments. They were put in order along the route. 1 turned round to fit." and, if there's still a gap of more than 500 m, how long the bridge is.
- **Put in order** (multiple-selection card, group card, stage card) does the same without fusing: the segments swap places so they follow each other, and those running the other way are turned round. Each group is ordered on its own, and the stage's ungrouped segments among themselves. "Already in order" when nothing changes.
- **Group** (`G`) puts the new group's segments in order along the route, but never turns any round by itself (two variants of the same leg are better left as they are). When some seem to run the other way, a message offers **Turn round**.
- The current order and directions are kept unless the new ones close at least 30 m of gaps. Of the two ways to run along the chain, the one that turns round the fewest kilometres wins, so a long track keeps its direction and short connectors are turned to match it.
- Everything is one undo step. Turning round a routed segment routes it again (roads can be one-way).

The best chain is found exactly for up to 10 segments (every order and direction, by dynamic programming), and by growing a chain from both ends beyond that. See `src/lib/chain.ts`.

## Elevation profile

- Open by default at the bottom.
- With nothing selected it shows the whole trip. Selecting a segment switches to its stage, with that segment highlighted (band and thicker outline), and its distance and climb in the header. **Segment** zooms in on it (and lets you select a part to erase); **Trip** shows everything. Several selected segments are all highlighted.

## Border crossings

When crossings are found, a pin is placed on each straight away. In the background, the nearest OSM border post is looked up for each crossing (one request at a time, cached 30 days), and the pin moves onto the post when one is found. In the crossing card, **Open / Closed to foreigners / Unknown** saves a coloured pin with notes in one click.

## Files

```
scripts/fetch-advisories.mjs        US advisories at build time
src/lib/countries.ts                Natural Earth outlines (shared by borders and risk)
src/modules/risk/                   advisories (US, UK), overlay, Travel advice section, country card
src/modules/editing/MultiCard.svelte multiple-selection card
src/lib/segment-edits.ts            + inTripOrder, smartMergeCommand, arrangeCommand, moveSegmentsCommand, group commands
src/lib/chain.ts                    best order and direction for a set of segments
src/lib/segment-actions.ts          fuse, put in order and group, with the messages that explain them
src/lib/tree.ts                     trip order: stages, groups and segments
src/lib/group-actions.ts            group the selected segments (card button and G)
src/modules/trip-tree/GroupCard.svelte group card
```

Core: `ui.addMultiCard` (the info card for several selected entities) and `ui.addPointLayer` (markers that take clicks before route lines).

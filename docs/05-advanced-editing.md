# Milestone 5: Advanced editing

## What was built

All of these act on the selected segment, are one undo step each, and are in the segment card (and the shortcuts below):

| Action | Shortcut | What it does |
| --- | --- | --- |
| Split | `S` | Click the segment where it should be cut. The second part becomes a new segment right after it. |
| Erase part | `X` | Click where the part starts, then where it ends (the part is highlighted while you move). A cut in the middle leaves two segments; a cut at an end trims it. |
| Erase from the profile | | In the elevation profile (segment view), drag across the chart to select a part, then **Erase**. The part is highlighted on the map too. |
| Reverse | `R` | The other way round. Routed segments are routed again, since roads can be one-way; other segments keep their exact geometry. |
| Duplicate | `Shift+D` | A copy right after the original. |
| Merge with next | `M` | Joins the next segment of the stage (or group), the right way round: if the two only meet end to end or start to start, the next one is turned round first (smart merge, see [docs/08](08-risk-and-editing.md#smart-merge-and-put-in-order)). If they don't touch, a leg joins them (routed for routed segments). The merged segment keeps the first one's travel mode; comments move over. |
| Move to stage | | The **Stage** field in the card moves the segment to the end of another stage. In the trip tree, moving the first segment of a stage up (or the last one down) moves it into the neighbouring stage. |
| Make editable | | For imported tracks: adds points at the track's main bends so they can be dragged like a drawn route. The geometry between points is kept; after that, editing a point re-routes (or redraws) only its two legs, as for drawn segments. |

New segments created by split, erase or duplicate get the next free number in their name ("Day 3 (2)", "Day 3 (3)").

`Esc` leaves any tool. Only one map tool is active at a time (draw, split, erase).

## Files

```
src/model/edit-ops.ts       pure geometry operations: splitAt, eraseRange, mergeGeometry,
                            reverseGeometry, editableGeometry, sliceLine, distanceAlong
src/lib/segment-edits.ts    the commands for them, shared by the editing and elevation modules
src/modules/editing/
  index.ts                  tools, shortcuts, card section
  tools.ts                  split and erase on the map
  EditCard.svelte           the buttons and stage field in the segment card
```

The core gained `ui.tool` / `ui.setTool` / `ui.toggleTool`: the active map tool. A module checks it to know whether the map's clicks are its own; the routes editor only selects segments while another module's tool is active.

## How positions work

Every operation takes a **distance along the segment**, measured the same way as the elevation profile. That's what lets the profile and the map share the same split and erase code. On the map, the clicked point is projected onto the nearest point of the selected segment's line, then converted to a distance.

- A split within 1 m of an existing point splits there, without cutting a leg.
- A split inside a leg cuts the leg's geometry at that point and adds a point on both sides. A routed leg keeps its route on both sides (no re-routing); a leg still waiting for the router stays waiting.

## Making imported tracks editable

The track is simplified (2D Douglas-Peucker) to find its main bends, with a tolerance that grows with the track's length: 15 m for short tracks, up to 200 m for long ones, which keeps the number of points manageable. Those points become anchors and the original geometry between them becomes the legs. The segment then takes its travel mode's geometry type (routed for bike, walk and car), so dragging a point re-routes only its two neighbouring legs.

## Known limitations

- Merging segments with different travel modes keeps the first one's mode (a toast says so).
- Splitting and erasing on the map need the segment to be selected first; with the tool active, clicking another segment selects it and acts on it straight away.
- The profile's range selection only works in the segment view.

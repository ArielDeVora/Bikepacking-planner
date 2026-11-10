# History

Every change to the trip is kept as a **commit**: what one action changed (only the fields that changed), who did it and when. Press **H** or the clock button in the toolbar to see them.

## Using it

- **Timeline**: newest first, with one lane per person (their colour). A dot is a change, a hollow dot an undo or redo, a diamond a restore. The line runs from one change to the next across the lanes. The day is shown on the first change of each day. **Show older changes** loads more.
- **Filter** by person, or open **History of this item** from any card to see only the changes that touched it.
- **Details** (pick a change): what it did to each item, in plain words ("Segment 3 changed: route, name"). Click an item to select it on the map.
- **Restore the trip to here**: takes back every change made after this one, by anyone, in one step. It asks first, saying how many changes and whose. The restore is itself a change in the history (its target is marked in the timeline), so undo (Cmd/Ctrl+Z) or "Undo only this change" brings everything back.
- **Undo only this change**: puts back what that one change modified, for the items nobody has changed since. Items changed again are left as they are, and a message says how many.

Typing in a field or dragging a point makes one change, not one per keystroke (the same grouping as undo). Undo and redo are changes too ("undo move segment"). Routing results that arrive after an edit aren't separate changes: a restore brings back the points, and the route between them is worked out again (usually from the cache, straight away).

## Where it's kept

- **In this browser**, always (IndexedDB, next to the trip). A trip that isn't shared has its history here only.
- **On the server**, for shared trips: each change is also sent to the `changes` table, so everyone sees everyone's changes. Changes made offline are sent when the connection comes back.
  - This needs [`supabase/migrations/002_history.sql`](../supabase/migrations/002_history.sql), run once in the Supabase SQL editor (like `001_init.sql`). Until then the History window says so and shows each person their own changes; nothing else is affected.
  - Members can read and add changes; nobody can edit or delete them (they go when the trip is deleted). The server sets the time and the author.
  - Size: a change keeps only the fields that changed, so a rename is tiny; moving a point of a long routed segment keeps that segment's geometry before and after (some kilobytes). Supabase's free plan (500 MB) holds a very long history for a few people.

## Deploying it safely

This release adds a store to the browser database (version 2). If the planner is still open in another tab with the old version, the new tab waits and says "close that tab (or reload it) to continue" instead of failing; reloading the old tab loads the new version. From now on, an old tab closes the database by itself and offers to reload.

Going back to an older version of the site (reverting commits on GitHub) is safe: the old code ignores the history store and table. The `changes` table stays in Supabase; it can be dropped (`drop table public.changes;`) if it's ever not wanted.

## How it works

- `src/core/history/diff.ts`: commits, field diffs, restore (apply the "before" side of later commits, newest first) and undo of one commit. Pure, tested.
- `src/core/history/recorder.ts`: listens to the undo stack (`commands.onCommit`) and turns commands into commits, merging the ones the undo stack merges.
- `src/core/history/log.ts`: keeps commits in IndexedDB and sends them to the server; lists them (server + not yet sent, or local only).
- `src/core/cloud/history-api.ts`: the `changes` table.
- `src/modules/history/`: the History window, the timeline, the card link.

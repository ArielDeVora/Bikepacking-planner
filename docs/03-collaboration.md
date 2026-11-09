# Milestone 3: Collaboration

## What was built

- **Sign in** with a magic link (email), from the Sharing section of the side panel. Each person sets a name and a colour.
- **Share a trip**: uploads the open local trip and makes you its owner. The owner copies an **invite link** (valid 14 days). Whoever opens it signs in and is added to the trip.
- **Live sync**: every edit is saved locally first, then uploaded within a second. Other people's edits arrive through Supabase Realtime. Edits made offline (or signed out) are queued and sent later.
- **Never losing an edit silently**: when someone else's change replaces something you edited in the last hour, a toast offers **Keep mine**. When your unsent edit will replace someone else's fresh change, a toast offers **Use theirs**. Undo asks before overwriting someone else's change.
- **Who changed what**: the info card shows "Edited by Ana, 5 min ago" with their colour; the trip tree marks stages and segments that someone else changed in the last 24 hours.
- **Presence**: a green dot next to members who have the trip open.
- **Comments** on stages and segments (later also POIs, zones and border crossings), in the info card.
- **Trips list**: local and shared trips, open any of them, create a new one.
- **Keep-alive** workflow so the free Supabase project doesn't pause.

Without a Supabase project configured, everything works as before, locally; the Sharing section says sharing isn't set up, and supabase-js is left out of the build.

## Files

```
supabase/migrations/001_init.sql  tables, row level security, functions, realtime
.env                              Supabase URL and publishable key (public values)
src/config/cloud.ts               reads them
src/core/cloud/
  cloud.ts                        sign-in, sharing, invites, members, presence; starts sync
  sync.ts                         SyncEngine: outbox, pull, realtime, conflicts
  api.ts                          SyncApi on top of supabase-js
  rows.ts                         entity <-> row conversion, content comparison
src/modules/collab/               Sharing panel, "edited by", comments, conflict toasts
.github/workflows/keepalive.yml   twice-weekly ping
```

`ctx.cloud` (in `ModuleContext`) gives modules the signed-in account, members (`profileOf(userId)` for names and colours), presence and sync status. `ctx.trips` lists, opens and creates trips.

## Database

| Table | Holds |
| --- | --- |
| `trips` | id (same as the trip entity's id), owner |
| `trip_members` | who belongs to which trip, role `owner` / `editor` |
| `invites` | invite tokens, expire after 14 days |
| `profiles` | name and colour per user |
| `entities` | every entity of every trip: `id, trip_id, type, data jsonb, deleted, updated_at, updated_by` |

- **Generic `entities` table**: a new entity type (POIs, zones…) needs no migration.
- **Row level security**: members can read and write their trips' entities. Nobody else can, including someone who knows a trip id. Only the owner creates invites. Joining goes through `accept_invite`, creating a trip through `create_trip` (both `security definer` functions).
- **Server clock**: a trigger sets `updated_at` and `updated_by` on every write, so last-write-wins doesn't depend on anyone's laptop clock.
- **No deletes**: rows are soft-deleted (`deleted = true`), which is what undo and sync need.

The migration was checked against a local Postgres with a stand-in for Supabase's `auth.uid()`: members can read and write, non-members get nothing, a non-member can't take over a row by upserting the same id, editors can't create invites or remove the owner, anonymous users can only call `ping`.

## How sync works

1. A local edit goes through `commands.run` as before, lands in the store and IndexedDB, and its entity id goes into the **outbox** (saved in localStorage, so it survives a reload).
2. 300 ms later the outbox is **upserted** in batches (up to 200 rows / ~800 kB). The server stamps each row; the client copies the server time back. An entity edited again while its upload was in flight stays in the outbox.
3. On start, after reconnecting, when the tab becomes visible and when the browser comes back online, the client **pulls** rows changed since the newest `updated_at` it has seen.
4. **Realtime** pushes each changed row to the other members. Rows bigger than Realtime's payload limit arrive without their data and are fetched separately.
5. A remote row is applied unless the entity is still in the outbox: then the local edit wins, because it will reach the server later (last write wins). Both sides are told (see conflict toasts above).

Echoes of your own uploads are recognised by content and ignored, apart from copying the server timestamp.

Routing results (`commands.patch`) are local edits like any other, so they sync. Each client only routes legs it still sees as pending.

## Known limitations

- **Removing members**: there is no UI yet. The owner can delete rows from `trip_members` in the Supabase table editor.
- **Magic links**: a link opened in a different browser signs you in there instead. The invite is remembered in the browser where you clicked the invite link, and is also carried in the link itself.
- **Presence**: names and colours go over a Realtime channel named after the trip id. Anyone with the publishable key and the (unguessable) trip id could listen in on who is online. Trip data itself is protected by row level security.
- **Merging**: last write wins per entity. Two people moving different points of the same segment at the same moment: one version wins, and the other person gets a toast to restore theirs.
- **Untested against a live project**: the sync engine is unit-tested against an in-memory server, and the SQL against local Postgres. The first run against your real Supabase project is the end-to-end test.

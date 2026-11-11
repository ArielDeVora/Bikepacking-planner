# Following, mentions, gear and the map hover

## Follow links (read only, no account)

For family and friends who want to follow the trip without planning it.

**Once, in Supabase:** SQL Editor → New query → paste
[`supabase/migrations/004_follow.sql`](../supabase/migrations/004_follow.sql) → Run. Until then,
the Sharing section says so instead of offering links.

**Making a link** (the trip's owner): Sharing → **Create a follow link**. The link is copied; send
it to whoever you like. Each link is listed with the date it was made, a button to copy it again
and one to **stop** it, after which it no longer opens the trip.

**Opening a link** shows the whole trip (routes, places, the plan, comments and the gear list) on
the map, read only:

- nothing is saved in the visitor's browser, and nothing they do changes the trip: tools that edit
  are hidden, and any edit attempt just shows a notice;
- the view checks for changes every 3 minutes, and when the tab comes back to the front;
- a "Following … (read only)" badge sits at the top of the map, and the side panel's Sharing
  section lists the members instead of the sign-in form.

How it works: the token in the link is a random id stored in `follow_links`. Visitors have no
access to the tables; two `security definer` functions, `follow_trip` and `follow_members`, return
the trip's items and its members' names and colours for a valid token, and nothing else. Only the
owner can create, list or delete a trip's links.

## @mentions in comments

Type `@` in a comment to pick a member of the trip (arrows and Enter or Tab, or click). The
mention is highlighted in the comment, and stronger when it's you. The people mentioned:

- get a notice right away if they have the trip open;
- see it at the top of **Since your last visit** otherwise.

There are no emails or push notifications.

## Since your last visit

When a shared trip opens and has synced, a card (bottom left) sums up what the others did since
your last visit in this browser: per person, items changed, comments and votes, plus the comments
mentioning you. **Show the latest change** selects it on the map, **See the history** opens the
History. The last visit is when the trip was last open and in the front in this browser.

## Shared gear checklist

The backpack button in the panel header (or `#gear` in the address) opens the gear list.

- Each item is **shared** (the group's: tent, stove, tools) or **for one person** (sleeping bag,
  helmet). "Everyone (one each)" adds one item per member, so each can tick theirs off.
- Its status goes **To buy → Bought → Packed** with a click. Marking it bought fills in **Bought by**
  with you, unless someone is set already.
- Quantity, weight (grams, for one), price paid, notes and section can be filled in on each line.
  Sections are free text, with suggestions.
- Filters: everyone's gear, shared gear only, or one person (their own gear and what they bought);
  and by status, with counts. Total weight and price are at the top, per section weight on each.
- **Who paid what**: what each person paid for shared and personal gear, and what they're owed or
  owe once shared gear is split evenly between the members (personal gear bought for someone else
  is owed back by them).

## Map hover

With the mouse over a segment (no tool on), a card shows its name, stage, distance, climb and its
planned dates from the planning calendar. Clicking selects it, and the side panel scrolls to it.
Not on touch screens.

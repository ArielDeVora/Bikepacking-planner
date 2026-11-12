# Following, mentions, gear, badges and the map hover

## Follow links (read only, no account)

For family and friends who want to follow the trip without planning it.

**Once, in Supabase:** SQL Editor → New query → paste
[`supabase/migrations/004_follow.sql`](../supabase/migrations/004_follow.sql) → Run. Until then,
the Sharing section says so instead of offering links.

**Making a link** (any member, once [`005_follow_suggestions.sql`](../supabase/migrations/005_follow_suggestions.sql)
has been run; before that, only the owner): Sharing → **Create a follow link**. The link is copied; send
it to whoever you like. Each link is listed with the date it was made, a button to copy it again
and one to **stop** it, after which it no longer opens the trip. Every member sees and can stop
every link of the trip, with who made it.

**Opening a link** shows the whole trip (routes, places, the plan, comments and the gear list) on
the map, read only:

- nothing is saved in the visitor's browser, and nothing they do changes the trip: tools that edit
  are hidden, and any edit attempt just shows a notice;
- the view checks for changes every 3 minutes, and when the tab comes back to the front;
- a "Following … (read only)" badge sits at the top of the map, and the side panel's Sharing
  section lists the members instead of the sign-in form.

How it works: the token in the link is a random id stored in `follow_links`. Visitors have no
access to the tables; two `security definer` functions, `follow_trip` and `follow_members`, return
the trip's items and its members' names and colours for a valid token, and nothing else. Members
of the trip can create, list, change and delete its links.

### Followers suggesting places

Each link has a **Followers can suggest places** switch (off by default; needs
[`005_follow_suggestions.sql`](../supabase/migrations/005_follow_suggestions.sql), run once like the
others). With it on, followers get a **Suggest a place** tool (click it, then the map) and a
**Suggest this place** button on search results and OpenStreetMap places.

- No account: the first time, they type their name; their browser remembers it (and a random id).
- They can only **add** places, never change or delete anything, theirs included.
- Each follower's places go into their own category, made with their first suggestion: "From Mum",
  "From Léa", with a heart icon. Members can rename it, move places out of it or delete them like
  any other.
- Their places show their name as the author, in purple. Members get a notice when one arrives
  while the trip is open, and see them in **Since your last visit** otherwise.
- Limits, so a link that leaks can't flood the trip: 500 places per follower and 5,000 suggested
  places per trip. Turning the switch off (or stopping the link) ends suggestions at once.

How it works: one more `security definer` function, `follow_suggest_place`, checks the token and
the switch, the name, the position and the limits, then inserts the place (and the follower's
category if needed). It can only insert places: there is no way through it to read, change or delete
anything.

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
- **Currencies**: each price has its own currency, picked next to it (CHF, EUR, USD, GBP…;
  prices from before were in euros). The currency offered for new items is remembered on each
  device, so a Swiss member can enter francs by default. Totals and **Who paid what** are in the
  trip's currency (**Totals in**, above the balances), converted with approximate exchange rates
  that anyone can correct (they're the same for everyone). No exchange-rate service is used.
- Weight (grams) and price are **for one item**; quantity multiplies them. Weight and price can be
  typed when adding an item, and changed on its line with the quantity, notes and section. Sections
  are free text, with suggestions.
- Filters: everyone's gear, shared gear only, or one person (their own gear and what they bought);
  and by status, with counts. Totals (weight and price × quantity) are at the top, with in
  parentheses what's still to buy, and for each section.
- **Reordering**: drag an item by its handle (⋮⋮, at the start of its line) before or after another
  one, or onto a section's title to put it at the end of that section. Dropped in another section,
  it takes that section.
- **Export**: **Spreadsheet** downloads what's shown, with the filters above (person, section,
  status), as a CSV file for Excel, Numbers or Google Sheets (separated by semicolons with decimal
  commas where the computer uses decimal commas, as Excel expects there). **Copy** puts the same
  table on the clipboard, to paste into a spreadsheet or a message. Both list each item's weight and
  price for one and in total, with the totals on the last line.
- **Who paid what**: only bought or packed items count. What each person paid for shared and
  personal gear, and what they're owed or owe once shared gear is split evenly between the members
  (personal gear bought for someone else is owed back by them). Everyone's balances add up to zero.
  Personal gear with no buyer is taken as bought by the person it's for. A bought item whose buyer
  is empty or isn't a member (e.g. ticked before signing in) is left out and listed above the
  balances, so it can be fixed.

## Badges

Playful awards shown next to names in the Sharing section (hover one for what it's for), with the
list of who holds which under **Badges**. Each goes to whoever leads it (everyone tied, on a tie):

| | Badge | For |
|---|---|---|
| 🧭 | Scout | most places added |
| 🐐 | GOAT whisperer | most GOATED votes on their places (from others) |
| 🗺️ | Cartographer | most km of route drawn or imported |
| 🏔️ | Mountain goat | most metres of climbing on their segments |
| 🎒 | Quartermaster | most gear bought |
| 💬 | Chatterbox | most comments |
| 🗳️ | Critic | most votes on places |
| 🛂 | Border guard | most border crossings noted |
| 🦉 | Night owl | most things last changed between midnight and 5 am (at least 5) |

Segments and crossings count for whoever made them; for those made before this was recorded, for
whoever last changed them by hand.

## Side panel search

The box at the top of the side panel (Cmd+Shift+F) filters the trip's routes, stages, groups and
segments, and the places (by name, category or notes), ignoring capitals and accents. A route,
stage or group containing a match stays listed and open; a matching one shows all of its contents.
Escape clears it. The button next to it switches to a **compact** list with tighter rows.

## Undo notices

After each change, a notice says what was done ("Move segment: “Segment 3” → Stage 2") with an
**Undo** button; after an undo, one with **Redo**. Typing in a field doesn't show one (the change
is in front of you). They can be turned off in Settings.

## Dark map

In dark mode, the base map uses OpenFreeMap's dark style; it switches with the theme, without
reloading the planner's own layers. The other base maps (OpenStreetMap, CyclOSM…) don't change.

## Map hover

With the mouse over a segment (no tool on), a card shows its name, stage, distance, climb and its
planned dates from the planning calendar. Clicking selects it, and the side panel scrolls to it.
Not on touch screens.

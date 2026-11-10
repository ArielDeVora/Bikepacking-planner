# Planning: calendar and seasons

The calendar button at the top of the side panel opens the planning view (the address ends in `#plan`, so it can also be opened in its own tab; tabs of the same trip stay in step). **Back to the map** or `Esc` closes it. `Cmd/Ctrl+Z` still undoes there; the map's one-key shortcuts don't apply.

## What's planned

Pick a route, or the stages outside routes, at the top. Its settings are shared with everyone:

| Setting | Default | |
| --- | --- | --- |
| Start | 3 April 2027 (or the trip's start date) | First day. |
| km/day by bike, on foot | 80, 20 | Daily distance. |
| Rest day every | 6 riding days | 0 for none. |
| km of effort per 100 m climbed | 1 | 1000 m of climbing counts as 10 km more. |

The schedule (`src/modules/plan/schedule.ts`) walks the route day by day: bike and walk segments at their daily distance plus climbing (several segments can share a day), one day per train, bus, boat, plane or car journey (`transportDays` on a segment for longer ones), a rest day every few days of riding, no riding during **rest periods**, and waiting for **fixed dates**. A segment's fixed date is its planned date, else its group's or stage's planned date when it comes first in them. When a fixed date can't be met, the side panel says how many days late.

**Each segment at its own pace**: a line of the calendar is a segment. Click its name to pick it; the side panel shows when it's ridden, the countries it crosses, and lets you set its own **fixed start date**, **km/day**, or **number of days** whatever its length (1 makes the segment one day; 0.5 half a day). Or straight on the calendar: **drag its bar** to start it on another day (that sets its fixed date), or **drag the bar's right end** for more or fewer days. Empty fields use the plan's settings. (Settings made per country in an earlier version are carried over: the earliest fixed date, and the total of the days.) **Show on the map** goes to the segment.

The **names column** can be made wider or narrower by dragging its right edge (remembered in this browser).

**Countries**: the side panel lists the countries in the order we reach them, with entry and exit dates and the number of days, from where we are each day (rest days count where we are); more than 30 days is flagged, to check the visa.

**Rest periods**: drag across the dates at the top of the calendar to add one, then rename it or change its dates in the side panel. They're shared and undoable.

## The calendar

- Columns: days from March 2027 to April 2028, longer if the trip needs it. Zoom with the slider.
- Rows: stages, then their segments, in the route's order, with the flags of the countries each crosses.
- **Bars**: when we're there. Solid riding, dashed motorised, striped resting or waiting. ▼ marks a fixed date (red when late).
- **Background**: how good the season is there (green good, orange so-so, red bad), from the middle of each row.
- **Season where we are**: the first row, rated at our position each day.
- Hover a day for its date, day number, distance along the route, and the season (with temperatures and rain). Click a row's name to see the segment on the map.

## Season ratings

Near the 23 regions the team rated by hand (`src/config/seasons.ts`, from the *Itinéraire saisons* table: four ratings per month, March to February), within 300 km, their rating is used. Elsewhere it comes from TerraClimate averages (`src/modules/plan/seasons.ts`):

- bad if more than 220 mm of rain a month, highs above 36 °C, or nights below −2 °C;
- good if less than 180 mm, highs below 33.5 °C and nights above 3 °C;
- so-so otherwise.

These thresholds were fitted to the team's table: they agree on 70% of its cells (simple guesses got 46%). The rest comes from things averages don't show: smoke season in northern Thailand, typhoons, monsoon timing on the Tibetan plateau. Hence the table wins where it has an opinion.

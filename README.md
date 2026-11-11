# Bikepacking Planner

A shared map for planning a long bikepacking trip: routes that snap to roads, travel modes, POIs, avoid zones and border crossings, edited together by a small group.

It's a static site on GitHub Pages. Everything is stored in the browser (IndexedDB) first; shared trips are synced through a free Supabase project.

## Using it

Press **Cmd+/** (or the **?** button at the bottom of the toolbar) for a cheatsheet of every keyboard shortcut and mouse action, with links to a short guide and to what's new. After each release, a What's new window lists the changes once.

- Press **Cmd+D** (or the route button in the toolbar) and click the map to draw a segment; it snaps to roads. **Esc** finishes.
- Click a segment to select it. Drag its points to move them, drag the line to add a point, right-click a point to delete it.
- Change the travel mode, routing profile and line style (colour, width, dashed or dotted) in the card on the right, or for several selected segments at once. Default styles per travel mode live in `src/config/modes.ts`.
- **Cmd/Ctrl+Z** undoes, **Cmd/Ctrl+Shift+Z** redoes.
- **Sharing** (side panel): sign in, share the trip, invite friends, switch between trips. Comments are at the bottom of each stage or segment card.
- **Import**: drop GPX, KML, TCX or GeoJSON files on the page (many at once), check the preview, pick the stage. **Export** the trip, a stage or a segment as GPX, or the whole trip as a JSON backup (drop it back in to restore it as a new trip).
- **Cmd+E** opens the elevation profile for the selected segment, its stage, or the whole trip. The **Stats** section shows km and climb by travel mode.
- **Cmd+P** adds a place (POI) on the map; the **Places** section lists them in one folder per category (make your own categories with their own icon; drag places between them), filtered by status or by who added them, or grouped by country. Vote on places in their card. **Cmd+K** focuses the search box (places or coordinates). OSM overlays (water, bike shops, campsites…) are in the **Map** section.
- Google Maps lists: export them with Google Takeout (CSV) or Google My Maps (KML) and drop the file in; re-import a newer export to add what's new. See [docs/06](docs/06-pois-search-osm.md#google-maps-lists).
- Click shops, restaurants and sights on the base map (from zoom 15) for details (opening hours, phone, website, Wikipedia) and **Add to trip**.
- **Cmd+A** draws an avoid zone (no-go zones are routed around). **Border crossings** in the side panel lists where the trip changes country; add notes (status, link, last verified) to each.
- **Map and overlays** (`Cmd+O`, or the layers button at the top of the side panel): a pane that drops down with the base map and every overlay, grouped (your trip, map, climate and safety, OpenStreetMap places last). `Cmd+O` again closes it.
- **Climate** (map pane): usual temperature and rain for any week of the year, with a slider and a play button to watch the seasons and monsoons move. Click the map for a place's year; stage cards show the usual weather for their planned date.
- **History** (`Cmd+Shift+H`, or the clock button): every change to the trip, who made it and when, on a timeline. Restore the whole trip to any earlier point, or undo just one change. Each card has a "History of this item" link.
- **Routes**: keep several versions of the trip (another group's plan, your own variant) side by side. Add one with the route button in the side panel, drag stages into it, duplicate it to try a variant, show only one on the map, and compare their distances under Stats.
- **Side panel**: Cmd/Ctrl+click or Shift+click to select several segments, then fuse them (they're put end to end, turned round where needed), put them in order, move or delete them. Drag segments to reorder them, move them to another stage, or drop one onto another to fuse them; drag stages to reorder them. **Groups**: select segments and press **Cmd+G** (or Group in the card) to group them within their stage; drop segments onto a group to put them in it. The eye hides a segment, group or stage from the map; the arrow collapses a stage or group. Drag the panel's right edge to make it wider, and the details card's left or bottom edge to resize it. The selection glows yellow on the map.
- **Travel advice** (side panel) and the **Travel advisory levels** overlay: official UK and US advice for the countries on the trip. Avoid zones can be switched to information-only **risk zones**.
- **Planning** (calendar button at the top of the side panel): when we'll be where, day by day, on a calendar from March 2027 to April 2028 with how good the season is (the team's own table near the places they rated, climate averages elsewhere); start date, daily distance, rest days, rest periods and fixed dates.
- **Settings** (sliders button at the top of the side panel, or **Cmd/Ctrl+,**): size of places on the map, when to show their names, route line thickness, the routing profile for new bike segments, theme, and the What's new window. Saved in your browser only.
- With a segment selected: **Cmd+S** split, **Cmd+X** erase a part (or drag across the profile and click Erase), **Follow…** replaces a stretch with the same stretch of another segment, **Cmd+B** reverse, **Cmd+Shift+D** duplicate, **Cmd+J** merge with the next segment, **Cmd+Backspace** delete. The card also moves it to another stage, and makes imported tracks editable. **Esc** leaves any tool.

## Local development

Requires Node 22.12+ (CI uses Node 24).

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (Vitest)
npm run check      # type check (svelte-check)
npm run build      # production build into dist/
npm run preview    # serve the production build
npm run advisories # fetch US travel advisory levels into public/data/ (done automatically on deploy)
npm run backup     # save the shared database to backups/ (needs .env.backup.local, see docs/16-backups.md)
```

## Deploying to GitHub Pages

One-time setup:

1. Create a repository on GitHub. It must be **public** for Pages on a free account. That's fine: trip data is never stored in the repository.
2. Push this project to the `main` branch.
3. In the repository, open **Settings → Pages**. Under **Build and deployment → Source**, choose **GitHub Actions**.
4. Open the **Actions** tab. The "Deploy to GitHub Pages" workflow runs on every push to `main` (or click **Run workflow**). When it's green, the site is at `https://<your-user>.github.io/<repo-name>/`.

The build uses relative paths, so the repository name doesn't matter.

The workflow also runs every morning, to refresh the travel advisory data. Nothing to set up; like the keep-alive job, GitHub pauses scheduled runs in repositories without commits for 60 days.

## Shared trips (Supabase setup)

Without this, the app works locally in each browser. One-time setup, about 10 minutes:

### 1. Create the project
1. Go to [supabase.com](https://supabase.com), sign in, click **New project**.
2. Pick your organization (Free plan), name it e.g. `bikepacking-planner`, set a database password (save it somewhere; the app doesn't need it), pick a region close to you, click **Create new project**. Wait until it's ready.

### 2. Create the tables
1. In the left sidebar, open **SQL Editor**, then **New query**.
2. Paste the whole content of [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql) and click **Run**. It should end with "Success. No rows returned". (Running it again is harmless.)
3. Do the same with [`supabase/migrations/002_history.sql`](supabase/migrations/002_history.sql) (shared change history, see [docs/11](docs/11-history.md)). Without it everything works, but each person's History shows only their own changes.
   Then [`supabase/migrations/003_history_slim.sql`](supabase/migrations/003_history_slim.sql), which keeps the history small (see [docs/11](docs/11-history.md#keeping-it-small)).

### 3. Allow sign-in links back to the site
1. Open **Authentication → URL Configuration**.
2. **Site URL**: `https://<your-user>.github.io/<repo-name>/`
3. Under **Redirect URLs**, click **Add URL** and add both:
   - `https://<your-user>.github.io/<repo-name>/**`
   - `http://localhost:5173/**`
4. Click **Save**.

Email sign-in is enabled by default (**Authentication → Sign In / Providers → Email**).

### 4. Connect the app
1. Click **Connect** at the top of the project page (or open **Project Settings → API Keys**). Copy the **Project URL** and the **Publishable key** (`sb_publishable_…`).
2. Put them in [`.env`](.env) at the root of this repository:
   ```
   VITE_SUPABASE_URL=https://abcdefgh.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```
   Both are public by design (row level security protects the data), so commit the file. Never put the secret key or the database password anywhere in this repo.
3. Commit and push. The deploy workflow builds with these values. For local development, restart `npm run dev`.

### 5. Sign-in emails (important)
Supabase's built-in mailer only sends to **members of your Supabase organization**, and at most **2 emails per hour** for the whole project. Two ways around it:
- **Add your friends to the organization**: **Organization settings → Team → Invite**, with the **Developer** role. Free, but they need a Supabase account and get access to the dashboard (they could see and edit the data there).
- **Use your own SMTP server** (recommended): sign up for a free email service such as Brevo or Resend, then fill in **Authentication → Emails → SMTP Settings**. The 2-per-hour limit then becomes adjustable under **Authentication → Rate Limits**. This needs an account with that service; tell me which one you pick and I'll write the exact steps.

Once signed in, a session lasts until you sign out, so this only matters for the first sign-in on each device.

### 6. Using it
1. Open the site, **Sharing → Send sign-in link**, click the link in the email (in the same browser).
2. Set your name and colour, then **Share this trip**.
3. **Copy invite link** and send it to your friends. They open it, sign in, and land on the shared trip.

### Keeping the project awake
Free Supabase projects pause after a week with little activity. The **Keep Supabase awake** workflow (`.github/workflows/keepalive.yml`) runs a tiny query every Monday and Thursday, using the values in `.env`. Two things to know:
- GitHub turns off scheduled workflows in repositories without commits for 60 days. If that happens, re-enable it in the **Actions** tab, or just push something.
- If the project does get paused, the app keeps working offline and says it can't reach the database. Resume it from the Supabase dashboard (open the project, **Resume project**); queued changes then sync.

## Project docs

- [Architecture and milestone 1](docs/01-skeleton.md): core concepts, how to add a module, map sources and their terms.
- [Milestone 2: routes](docs/02-routes.md): drawing and editing segments, routing, travel modes and line styles.
- [Milestone 3: collaboration](docs/03-collaboration.md): database, sync, conflicts, comments.
- [Milestone 4: import, export, elevation and stats](docs/04-import-export-elevation.md).
- [Milestone 5: advanced editing](docs/05-advanced-editing.md): split, erase, merge, reverse, duplicate, move, editable tracks.
- [Milestone 6: places, search and OSM overlays](docs/06-pois-search-osm.md), including Google Maps lists.
- [Milestone 7: avoid zones and borders](docs/07-zones-borders.md), plus base-map places and richer details.
- [Milestone 8: risk layer, and editing from the side panel](docs/08-risk-and-editing.md), including the data source research.
- [What's new, the guide, and update notices](docs/09-whats-new.md): how to announce a release.
- [Routes](docs/10-routes.md): several ways of doing the trip, side by side.
- [History](docs/11-history.md): every change, who made it, and restoring the trip to an earlier point.
- [Climate](docs/12-climate.md): usual temperature and rain by week (TerraClimate).
- [Settings](docs/14-settings.md): the Settings window, and the nature place category.
- [Planning](docs/15-planning.md): schedule, calendar with season heatmap, rest periods, countries timeline.
- [Backups](docs/16-backups.md): nightly encrypted backups of the shared database, and restoring.
- [Spec](docs/SPEC.md)

## Credits

Map data © OpenStreetMap contributors. Base maps: OpenFreeMap, OpenStreetMap, CyclOSM, OpenTopoMap, EOxCloudless (Sentinel-2, CC BY-NC-SA 4.0). Elevation: Mapzen Terrain Tiles on AWS. Routing: [BRouter](https://brouter.de/) (public server, run on donations). Search: [Photon](https://photon.komoot.io/) by komoot. OSM places: [Overpass API](https://overpass-api.de/) (with private.coffee and VK Maps as fallbacks). Place details: [Nominatim](https://nominatim.org/), Wikipedia, Wikidata. Country outlines: [Natural Earth](https://www.naturalearthdata.com/) (public domain). Travel advice: UK FCDO via GOV.UK (Open Government Licence v3.0), U.S. Department of State (public domain).

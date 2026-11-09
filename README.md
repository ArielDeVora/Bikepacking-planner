# Bikepacking Planner

A shared map for planning a long bikepacking trip: routes that snap to roads, travel modes, POIs, avoid zones and border crossings, edited together by a small group.

It's a static site on GitHub Pages. Everything is stored in the browser (IndexedDB) first; shared trips are synced through a free Supabase project.

## Using it

- Press **D** (or the route button in the toolbar) and click the map to draw a segment; it snaps to roads. **Esc** finishes.
- Click a segment to select it. Drag its points to move them, drag the line to add a point, right-click a point to delete it.
- Change the travel mode, routing profile and colour in the card on the right. Line styles live in `src/config/modes.ts`.
- **Cmd/Ctrl+Z** undoes, **Cmd/Ctrl+Shift+Z** redoes.
- **Sharing** (side panel): sign in, share the trip, invite friends, switch between trips. Comments are at the bottom of each stage or segment card.
- **Import**: drop GPX, KML, TCX or GeoJSON files on the page (many at once), check the preview, pick the stage. **Export** the trip, a stage or a segment as GPX, or the whole trip as a JSON backup (drop it back in to restore it as a new trip).
- **E** opens the elevation profile for the selected segment, its stage, or the whole trip. The **Stats** section shows km and climb by travel mode.
- With a segment selected: **S** split, **X** erase a part (or drag across the profile and click Erase), **R** reverse, **Shift+D** duplicate, **M** merge with the next segment. The card also moves it to another stage, and makes imported tracks editable. **Esc** leaves any tool.

## Local development

Requires Node 22.12+ (CI uses Node 24).

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (Vitest)
npm run check      # type check (svelte-check)
npm run build      # production build into dist/
npm run preview    # serve the production build
```

## Deploying to GitHub Pages

One-time setup:

1. Create a repository on GitHub. It must be **public** for Pages on a free account. That's fine: trip data is never stored in the repository.
2. Push this project to the `main` branch.
3. In the repository, open **Settings → Pages**. Under **Build and deployment → Source**, choose **GitHub Actions**.
4. Open the **Actions** tab. The "Deploy to GitHub Pages" workflow runs on every push to `main` (or click **Run workflow**). When it's green, the site is at `https://<your-user>.github.io/<repo-name>/`.

The build uses relative paths, so the repository name doesn't matter.

## Shared trips (Supabase setup)

Without this, the app works locally in each browser. One-time setup, about 10 minutes:

### 1. Create the project
1. Go to [supabase.com](https://supabase.com), sign in, click **New project**.
2. Pick your organization (Free plan), name it e.g. `bikepacking-planner`, set a database password (save it somewhere; the app doesn't need it), pick a region close to you, click **Create new project**. Wait until it's ready.

### 2. Create the tables
1. In the left sidebar, open **SQL Editor**, then **New query**.
2. Paste the whole content of [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql) and click **Run**. It should end with "Success. No rows returned". (Running it again is harmless.)

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
- [Spec](docs/SPEC.md)

## Credits

Map data © OpenStreetMap contributors. Base maps: OpenFreeMap, OpenStreetMap, CyclOSM, OpenTopoMap, EOxCloudless (Sentinel-2, CC BY-NC-SA 4.0). Elevation: Mapzen Terrain Tiles on AWS. Routing: [BRouter](https://brouter.de/) (public server, run on donations).

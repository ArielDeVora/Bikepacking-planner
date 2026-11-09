# Bikepacking Planner

A shared map for planning a long bikepacking trip: routes that snap to roads, travel modes, POIs, avoid zones and border crossings, edited together by a small group.

It's a static site on GitHub Pages. Shared data will live in a free Supabase project (from the collaboration milestone onwards); until then everything is stored in the browser (IndexedDB).

## Using it

- Press **D** (or the route button in the toolbar) and click the map to draw a segment; it snaps to roads. **Esc** finishes.
- Click a segment to select it. Drag its points to move them, drag the line to add a point, right-click a point to delete it.
- Change the travel mode, routing profile and colour in the card on the right. Line styles live in `src/config/modes.ts`.
- **Cmd/Ctrl+Z** undoes, **Cmd/Ctrl+Shift+Z** redoes.

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

## Project docs

- [Architecture and milestone 1](docs/01-skeleton.md): core concepts, how to add a module, map sources and their terms.
- [Milestone 2: routes](docs/02-routes.md): drawing and editing segments, routing, travel modes and line styles.
- [Spec](docs/SPEC.md)

## Credits

Map data © OpenStreetMap contributors. Base maps: OpenFreeMap, OpenStreetMap, CyclOSM, OpenTopoMap, EOxCloudless (Sentinel-2, CC BY-NC-SA 4.0). Elevation: Mapzen Terrain Tiles on AWS. Routing: [BRouter](https://brouter.de/) (public server, run on donations).

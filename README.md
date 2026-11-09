# Bikepacking Planner

A shared map for planning a long bikepacking trip: routes that snap to roads, travel modes, POIs, avoid zones and border crossings, edited together by a small group.

It's a static site on GitHub Pages. Shared data will live in a free Supabase project (from the collaboration milestone onwards); until then everything is stored in the browser (IndexedDB).

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
- [Spec](docs/SPEC.md)

## Credits

Map data © OpenStreetMap contributors. Base maps: OpenFreeMap, OpenStreetMap, CyclOSM, OpenTopoMap, EOxCloudless (Sentinel-2, CC BY-NC-SA 4.0). Elevation: Mapzen Terrain Tiles on AWS.

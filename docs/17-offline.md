# Offline, and the planner as a phone app

## Installing it on an iPhone

Open the planner in Safari → Share → **Add to Home Screen**. It then opens full screen from its
own icon, like an app.

An app added to the home screen keeps its own data, separate from Safari: sign in again inside it
(Sharing → your email → **type the code from the email**; the link in the email opens Safari, which
can't sign the home-screen app in). Your shared trips then come down from the server.

**For the code to be in the email** (once, in Supabase): Authentication → Emails → Templates →
**Magic Link**, and add a line such as
`<p>Or type this code in the planner: <strong>{{ .Token }}</strong></p>` to the message. The link
keeps working as before.

## What works without a connection

- **The app** opens (the service worker keeps its files for each version; production build only,
  over HTTPS or on localhost).
- **Your trips**: they're kept on the device anyway; changes made offline are sent when the
  connection comes back. An **Offline** badge shows at the top meanwhile.
- **The map**: every OpenFreeMap tile you've seen is kept (up to 12,000 tiles; the oldest go first).
  To have it along the route before leaving, open a stage, group, segment or route card →
  **Map for offline use** → **Save map for offline**: it saves zooms 6 to 13 along the line (fewer
  zoom levels for long ones), at most ~1,800 tiles (about 45 MB) per download, 4 at a time, within
  OpenFreeMap's rules for offline downloads (3,000 tiles or 50 MB each). A long route is saved
  stage by stage. Saved tiles keep working after OpenFreeMap's weekly update.
- **Climate averages, travel advisories, country outlines**: kept once loaded.
- Not offline: routing new segments (BRouter), search, OpenStreetMap places, the other base maps
  (OpenStreetMap's own tile servers don't allow keeping their tiles), sign-in.

Settings → **Offline** shows how many tiles are saved and clears them.

## How it works

- `scripts/sw-template.js`: the service worker (cache-first for the app and tiles, stale-while-
  revalidate for the map style, fonts and icons, network for everything else). `version.json`
  always goes to the network, so the "new version" notice still works.
- `scripts/sw-plugin.mjs`: writes `sw.js` into the build with the build id and the app's files.
- `public/manifest.webmanifest`, `public/icons/`: the installable app.
- `src/modules/offline/`: the tiles along a route (`tiles.ts`), saving them (`download.ts`), the
  card section and the badge.

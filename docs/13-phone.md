# Phone layout

Below 640 px wide (phones in portrait), the app switches to a phone layout. The same code runs everywhere: `PHONE_QUERY` in `src/lib/ui/phone.ts` and the `@media (max-width: 640px)` blocks must stay in sync.

## Layout

- The map fills the screen. Search and the climate bar sit at the top; the tools are a column on the right.
- The side panel becomes a **bottom sheet** (`src/lib/ui/sheet.ts`). Drag its handle between three heights (collapsed, half, nearly full), flick it, or tap the handle to open or collapse it.
- The details card is a second sheet, opening at half height over the panel when something is selected. The × closes it.
- While a map tool is in use (drawing, adding a place…), both sheets collapse to keep the map clear.
- Things that sit above the sheets (legend, profile, toasts, map credits) follow the CSS variable `--sheet-h`.

## Touch editing on the map

| Action | Mouse | Touch |
| --- | --- | --- |
| Add points while drawing | Click | Tap; tap the route button again to finish |
| Move a point | Drag | Drag |
| Insert a point on the line | Drag the line | Press and hold the line, then drag |
| Delete a point | Right-click | Tap the point, then **Delete point** |

Hit areas are bigger for fingers (`isCoarse()`).

Places follow the finger too: select one, then drag it (one finger; two still move the map). **Follow…** works with taps: the stretch's start, its end, then the segment to follow (there's no hover preview of the last step on a touch screen).

## Planning view

On a phone the planning view puts its settings at the top, the calendar below (most of the screen) and the side panel under it (scroll down). The names column starts narrow; drag its edge to widen it. Bars can be dragged with a finger (a finger starting on a bar drags it instead of scrolling); tap a day for its details. The search box and buttons don't mention keyboard shortcuts on touch screens.

## Testing on an iPhone before deploying

1. Mac and iPhone on the same Wi-Fi.
2. `npm run dev:phone`. Vite prints a **Network** address such as `http://192.168.1.10:5173/`.
3. Open that address in Safari on the iPhone. Changes reload live, as on the desktop.
4. If macOS asks whether Node may accept incoming connections, allow it.

Plain `http` on a local network isn't a "secure context", so a few browser features are missing there. The app works around them (ids, clipboard). They are all available on the deployed HTTPS site.

Signing in from the phone during local testing: Supabase only sends magic links back to allowed addresses. Add `http://192.168.1.*:5173/**` under Supabase → Authentication → URL Configuration → Redirect URLs, or test sharing on the deployed site instead.

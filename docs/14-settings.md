# Settings

The Settings window opens from the sliders button at the top of the side panel, or with `⌘,` (`Ctrl+,`). Everything in it is saved in this browser only (`localStorage`, key `bp:prefs:values`, holding only what differs from the defaults). Nothing is shared with the people you plan with.

| Setting | Default | Effect |
| --- | --- | --- |
| Size of your places | 100 % | Your places and border crossings on the map (60–180 %). |
| Size of OpenStreetMap places | 100 % | The OSM overlays from the map pane (60–180 %). |
| Names of your places | When zoomed in | Always, from zoom 11, or never. |
| Route line thickness | 100 % | Scales every route line, including widths set on a segment (50–250 %). |
| Routing profile for new bike segments | Trekking | Profile given to bike segments you draw from now on. Existing segments keep theirs, so a change never re-routes anything (or anyone else's view of it). |
| Theme | Match system | Light, dark, or follow the system. The sun/moon button still switches between light and dark. |
| Show "What's new" after an update | On | When off, updates are marked as seen without opening the window. It stays available from the cheatsheet. |

**Reset to defaults** puts every setting back, including the theme.

## Code

```
src/core/preferences.ts       the preferences store (ctx.prefs / core.prefs), defaults, validation of stored values
src/app/SettingsDialog.svelte the window
src/lib/map-prefs.ts          map expressions built from preferences (place names)
```

Modules follow a preference with `ctx.prefs.watch(key, run)`, which runs now and again only when that preference changes. To add a setting: add it to `Preferences` and `DEFAULT_PREFERENCES` (with a check in `isValid` if its type isn't a plain number, string or boolean), a row in the window, and the strings in `src/i18n/en.ts`.

## Place categories

**Nature & landscape** (green mountain) is for peaks, waterfalls, viewpoints, parks and reserves. Search results, OSM features and base-map places get it from their tags (`natural=*` landforms, `tourism=viewpoint`, `waterway=waterfall`, `leisure=nature_reserve`, `boundary=national_park|protected_area`). Camp spots are brown.

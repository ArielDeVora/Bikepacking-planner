/**
 * What changed in each release, newest first, shown once to everyone after an update.
 * When deploying something worth telling people about, add an entry at the top. The id is the
 * release date (add a letter for a second release on the same day: "2026-11-12b").
 */
export interface Release {
  id: string;
  title: string;
  items: string[];
}

export const RELEASES: Release[] = [
  {
    id: '2026-11-13b',
    title: 'Crowns, and replacing built-in categories',
    items: [
      'A place at least three people approve of (👍 I’m in or 🐐 GOATED) wears a little gold crown, on the map and in the Places list.',
      'Made your own categories that double the built-in ones? Replace the built-in ones with yours (tag button in Places). Their places move over, and they disappear from the list and the category picker.',
    ],
  },
  {
    id: '2026-11-13',
    title: 'Categories are folders',
    items: [
      'Places are grouped by category in the Places list: each category is a folder you can fold, hide from the map with the eye, or drag places into to change their category.',
      'Make your own categories (folder button in Places, or + in a place’s category picker): pick a name, a colour and an icon from the set. Their places show that icon on the map.',
      'Folders made earlier are now categories, with their places in them.',
    ],
  },
  {
    id: '2026-11-12b',
    title: 'Vote on places, and GOATED',
    items: [
      'Vote on any place in its card: 🐐 GOATED, 👍 I’m in or 👎 Not for me. Everyone sees who voted what, and the Places list shows the counts.',
      'A new status above must-see: GOATED. Those places are bigger on the map, with a gold glow.',
      'The Booked status is gone; places that were booked are now must-see.',
    ],
  },
  {
    id: '2026-11-12',
    title: 'Coordinates in any format',
    items: [
      'The search box reads coordinates the way they’re usually written: 41°41\'24"N 44°48\'00"E (as Google Maps copies them), N 41° 41.4\' E 44° 48\', 41.69N 44.8E, or plain 41.69, 44.80. It shows the position it read; press Enter to go there.',
    ],
  },
  {
    id: '2026-11-11b',
    title: 'Folders for places, and who added which',
    items: [
      'Folders in the Places list: create one with the folder button, drag places onto it (or pick a folder in the place card). Fold them open and closed, hide a folder’s places from the map with the eye, rename or colour a folder in its card.',
      'On shared trips, each place shows a dot in the colour of the person who added it, on the map and in the Places list. The place card says who added it too.',
      'Places can be filtered by who added them, next to the status filter.',
      'Tick “By country” in Places to group them by country.',
      'What’s new now shows every update you missed since your last visit, and earlier ones are a click away.',
    ],
  },
  {
    id: '2026-11-11',
    title: 'Settings, and a place type for nature',
    items: [
      'A Settings window (the sliders button at the top of the side panel, or ⌘,): size of places on the map, when to show their names, route line thickness, the routing profile for new bike segments, theme (light, dark or match the system) and the What’s new window.',
      'A new place category, Nature & landscape (green mountain), for peaks, waterfalls, viewpoints and parks. Search results and map places like these get it automatically.',
      'Camp spots are now brown, so they don’t look like nature spots.',
    ],
  },
  {
    id: '2026-11-10d',
    title: 'Usual weather by week',
    items: [
      'Two new map overlays: usual temperature and usual rain, for any week of the year. Press play to watch the seasons and monsoons move.',
      'Click the map (with one of them on) for a place’s whole year: rain, daytime highs and night lows.',
      'Stage cards show the usual weather for their planned date.',
      'Base maps and overlays now drop down from the layers button at the top of the side panel (or press O), grouped, instead of sitting at the bottom of the panel.',
    ],
  },
  {
    id: '2026-11-10c',
    title: 'History of changes',
    items: [
      'Press H (or the clock button) to see every change to the trip: what, who and when, on a timeline with one lane per person.',
      'Restore the whole trip to any earlier point, or undo just one change. A restore is one step: you can undo it too.',
      'Each card has a “History of this item” link.',
    ],
  },
  {
    id: '2026-11-10b',
    title: 'Routes: several versions of the trip',
    items: [
      'Keep several routes in one trip (another group’s plan, your own variant), each with its own stages. Add one with the route button at the top of the side panel, then drag stages onto it.',
      'Duplicate a route to try a variant without touching the original, and give each route its own colour.',
      'The target button on a route shows only that route on the map. Stats compares the routes side by side.',
    ],
  },
  {
    id: '2026-11-10',
    title: 'Clearer selection and smarter fusing',
    items: [
      'Fusing segments puts them end to end first: in the right order, and turned round where they run the other way. Same for M (merge with next) and dropping a segment onto another.',
      '“Put in order” (selection, group and stage cards) sorts segments along the route and turns round the backward ones, without fusing them.',
      'The selected segment, group or stage glows yellow on the map, and the other routes fade.',
      'Resize the details card on the right: drag its left edge (width) or bottom edge (height). Double-click an edge to reset it.',
      'Reorder stages, groups and segments by dragging them in the side panel (the up/down arrows are gone).',
      'This “What’s new” window, and a short guide (open it any time from the ? button).',
    ],
  },
  {
    id: '2026-11-09',
    title: 'Groups and line styles',
    items: [
      'Group segments within a stage: select them and press G. Drag segments in and out of groups.',
      'Your own colour, width and pattern for any segment, or for several at once.',
      'Hide stages, groups or segments from the map with the eye, collapse them in the list, and drag stages to reorder them.',
      'The side panel can be made wider by dragging its right edge.',
    ],
  },
];

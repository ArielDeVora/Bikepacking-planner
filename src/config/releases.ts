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
    id: '2026-11-10',
    title: 'Easier to see what you selected',
    items: [
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

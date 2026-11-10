/**
 * Keyboard shortcuts, all with Cmd (Ctrl on Windows and Linux) so a stray key never does
 * anything. Avoids the ones macOS or browsers keep for themselves (Cmd+H, M, Q, W, T, N) and
 * Cmd+R (reload).
 */
export const KEYS = {
  undo: 'mod+z',
  redo: 'mod+shift+z',
  redoAlt: 'mod+y',
  draw: 'mod+d',
  addPlace: 'mod+p',
  addZone: 'mod+a',
  mapPane: 'mod+o',
  elevation: 'mod+e',
  history: 'mod+shift+h',
  importFiles: 'mod+i',
  search: 'mod+k',
  help: 'mod+/',
  settings: 'mod+,',
  split: 'mod+s',
  erase: 'mod+x',
  reverse: 'mod+b',
  duplicate: 'mod+shift+d',
  merge: 'mod+j',
  group: 'mod+g',
  delete: 'mod+backspace',
  deleteAlt: 'mod+delete',
} as const;

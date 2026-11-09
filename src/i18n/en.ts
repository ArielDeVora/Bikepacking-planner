export const en = {
  'app.title': 'Bikepacking Planner',
  'app.loading': 'Loading…',
  'app.storageUnavailable': 'Local storage is unavailable: changes will not be saved in this browser.',
  'app.loadFailed': 'Could not load the trip.',

  'toolbar.undo': 'Undo',
  'toolbar.redo': 'Redo',
  'toolbar.undoNamed': 'Undo: {label}',
  'toolbar.redoNamed': 'Redo: {label}',
  'toolbar.theme': 'Toggle light/dark theme',
  'toolbar.panel': 'Toggle side panel',

  'trip.defaultName': 'My trip',

  'layers.title': 'Map',
  'layers.base': 'Base map',
  'layers.overlays': 'Overlays',
  'layers.opacity': 'Opacity',
  'layers.base.openfreemap': 'OpenFreeMap',
  'layers.base.osm': 'OpenStreetMap',
  'layers.base.cyclosm': 'CyclOSM',
  'layers.base.opentopomap': 'OpenTopoMap',
  'layers.base.satellite': 'Satellite (Sentinel-2)',
  'layers.overlay.hillshade': 'Hillshading',

  'tree.title': 'Trip',
  'tree.stages': 'Stages',
  'tree.addStage': 'Add stage',
  'tree.stageName': 'Stage {n}',
  'tree.empty': 'No stages yet.',
  'tree.moveUp': 'Move up',
  'tree.moveDown': 'Move down',
  'tree.delete': 'Delete',
  'tree.rename': 'Rename',

  'cmd.addStage': 'add stage',
  'cmd.renameStage': 'rename stage',
  'cmd.deleteStage': 'delete stage',
  'cmd.moveStage': 'move stage',
  'cmd.editStage': 'edit stage',
  'cmd.renameTrip': 'rename trip',

  'stage.name': 'Name',
  'stage.notes': 'Notes',
  'stage.plannedDate': 'Planned date',
  'stage.color': 'Colour',
  'card.close': 'Close',
} as const;

export type StringKey = keyof typeof en;

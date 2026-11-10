import { edits, type Command } from '../../core/commands';
import type { TripStore } from '../../core/store';
import { newId } from '../../model/ids';
import { keyBetween } from '../../model/order';
import type { Poi, PoiFolder } from '../../model/types';

export function sortedFolders(store: TripStore): PoiFolder[] {
  return store.list('poiFolder').sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : a.name.localeCompare(b.name)));
}

/** The place's folder, if it still exists. */
export function folderOf(store: TripStore, poi: Poi): PoiFolder | undefined {
  return poi.folderId ? store.get(poi.folderId, 'poiFolder') : undefined;
}

export function folderPlaces(store: TripStore, folderId: string): Poi[] {
  return store.list('poi', (p) => p.folderId === folderId);
}

/** A new folder after the others, optionally with places moved into it. */
export function createFolderCommand(
  store: TripStore,
  opts: { tripId: string; name: string; label: string; poiIds?: string[] },
): { command: Command; id: string } {
  const id = newId();
  const last = sortedFolders(store).at(-1);
  const folder = edits.create<PoiFolder>({ id, type: 'poiFolder', tripId: opts.tripId, name: opts.name, order: keyBetween(last?.order ?? null, null) });
  const moves = (opts.poiIds ?? []).filter((p) => store.get(p, 'poi')).map((p) => edits.update<Poi>(store, p, { folderId: id }));
  return { command: { label: opts.label, changes: [folder, ...moves] }, id };
}

/** Moves places into a folder, or out of any (`null`). */
export function moveToFolderCommand(store: TripStore, poiIds: string[], folderId: string | null, label: string): Command | null {
  const changes = poiIds
    .map((id) => store.get(id, 'poi'))
    .filter((p): p is Poi => !!p && (p.folderId ?? null) !== folderId)
    .map((p) => edits.update<Poi>(store, p.id, { folderId: folderId ?? undefined }));
  return changes.length ? { label, changes } : null;
}

/** Deletes a folder; its places stay, out of any folder. */
export function deleteFolderCommand(store: TripStore, folderId: string, label: string): Command {
  return {
    label,
    changes: [...folderPlaces(store, folderId).map((p) => edits.update<Poi>(store, p.id, { folderId: undefined })), edits.remove(store, folderId)],
  };
}

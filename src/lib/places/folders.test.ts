import { beforeEach, describe, expect, it } from 'vitest';
import { CommandStack } from '../../core/commands';
import { TripStore } from '../../core/store';
import type { Poi } from '../../model/types';
import { trip, TRIP_ID } from '../../test/fixtures';
import { createFolderCommand, deleteFolderCommand, folderOf, folderPlaces, moveToFolderCommand, sortedFolders } from './folders';

let store: TripStore;
let commands: CommandStack;

const poi = (id: string): Poi => ({
  id,
  type: 'poi',
  tripId: TRIP_ID,
  lngLat: [7, 45],
  category: 'other',
  name: id,
  notes: '',
  links: [],
  status: 'idea',
  createdBy: 'u1',
  updatedAt: 0,
  updatedBy: 'u1',
  deleted: false,
});

const folder = (name: string, poiIds?: string[]) => {
  const { command, id } = createFolderCommand(store, { tripId: TRIP_ID, name, label: 'add', poiIds });
  commands.run(command);
  return id;
};

beforeEach(() => {
  store = new TripStore();
  store.apply([trip(), poi('a'), poi('b'), poi('c')], 'load');
  commands = new CommandStack(store, () => 'u1');
});

describe('place folders', () => {
  it('creates folders in order, optionally with places in them', () => {
    const first = folder('Georgia', ['a']);
    const second = folder('Armenia');
    expect(sortedFolders(store).map((f) => f.id)).toEqual([first, second]);
    expect(folderPlaces(store, first).map((p) => p.id)).toEqual(['a']);
    commands.undo();
    commands.undo();
    expect(store.list('poiFolder')).toHaveLength(0);
    expect(store.get('a', 'poi')!.folderId).toBeUndefined();
  });

  it('moves places in and out, skipping those already there', () => {
    const f = folder('Camps');
    commands.run(moveToFolderCommand(store, ['a', 'b'], f, 'move')!);
    expect(folderPlaces(store, f).map((p) => p.id).sort()).toEqual(['a', 'b']);
    expect(moveToFolderCommand(store, ['a'], f, 'move')).toBeNull();
    commands.run(moveToFolderCommand(store, ['a'], null, 'move')!);
    expect(store.get('a', 'poi')!.folderId).toBeUndefined();
  });

  it('keeps the places of a deleted folder, out of any folder', () => {
    const f = folder('Ideas', ['a', 'b']);
    commands.run(deleteFolderCommand(store, f, 'delete'));
    expect(store.get(f, 'poiFolder')).toBeUndefined();
    expect(store.list('poi').map((p) => p.folderId)).toEqual([undefined, undefined, undefined]);
    commands.undo();
    expect(folderPlaces(store, f)).toHaveLength(2);
  });

  it('treats a place whose folder is gone (deleted by someone else) as loose', () => {
    const p = { ...poi('d'), folderId: 'missing' };
    store.apply([p], 'load');
    expect(folderOf(store, store.get('d', 'poi')!)).toBeUndefined();
  });
});

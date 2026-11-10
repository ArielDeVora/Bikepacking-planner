import { beforeEach, describe, expect, it } from 'vitest';
import { CATEGORY_COLORS, POI_CATEGORY_ORDER, POI_ICONS } from '../../config/pois';
import { CommandStack } from '../../core/commands';
import { t } from '../../core/i18n';
import { TripStore } from '../../core/store';
import type { Poi, PoiFolder } from '../../model/types';
import { trip, TRIP_ID } from '../../test/fixtures';
import {
  allCategories,
  categoryInfo,
  categoryPlaces,
  createCategoryCommand,
  deleteCategoryCommand,
  iconPath,
  legacyFolderChanges,
  replaceCategoriesCommand,
  replacements,
  resolveCategory,
  setCategoryCommand,
  suggestReplacement,
  takeJustCreated,
} from './categories';

let store: TripStore;
let commands: CommandStack;

const poi = (id: string, over: Partial<Poi> = {}): Poi => ({
  id,
  type: 'poi',
  tripId: TRIP_ID,
  lngLat: [7, 45],
  category: 'camp',
  name: id,
  notes: '',
  links: [],
  status: 'idea',
  createdBy: 'u1',
  updatedAt: 0,
  updatedBy: 'u1',
  deleted: false,
  ...over,
});

const create = (name: string, poiIds?: string[]) => {
  const { command, id } = createCategoryCommand(store, { tripId: TRIP_ID, userId: 'u1', name, label: 'add', poiIds });
  commands.run(command);
  return id;
};

beforeEach(() => {
  store = new TripStore();
  store.apply([trip(), poi('a'), poi('b'), poi('c', { category: 'water' })], 'load');
  commands = new CommandStack(store, () => 'u1');
});

describe('place categories', () => {
  it('lists the built-in categories, then custom ones in the order they were made', () => {
    const first = create('Hot springs');
    const second = create('Monasteries');
    expect(allCategories(store, t).map((c) => c.id)).toEqual([...POI_CATEGORY_ORDER, first, second]);
  });

  it('gives a new category the next unused colour and a default icon, which can be changed', () => {
    const id = create('Hot springs', ['a']);
    const info = categoryInfo(store, t, id);
    expect(info).toMatchObject({ name: 'Hot springs', color: CATEGORY_COLORS[0], iconKey: 'star' });
    expect(categoryInfo(store, t, create('Second')).color).toBe(CATEGORY_COLORS[1]);
    expect(store.get(id, 'poiFolder')!.createdBy).toBe('u1');
    expect(categoryPlaces(store, id).map((p) => p.id)).toEqual(['a']);
    expect(takeJustCreated(id)).toBe(false);
  });

  it('remembers the category just made, once, so its card can focus the name', () => {
    const id = create('New');
    expect(takeJustCreated(id)).toBe(true);
    expect(takeJustCreated(id)).toBe(false);
  });

  it('moves places between categories (folders)', () => {
    const id = create('Favourites');
    commands.run(setCategoryCommand(store, ['a', 'c'], id, 'move')!);
    expect(categoryPlaces(store, id).map((p) => p.id).sort()).toEqual(['a', 'c']);
    expect(setCategoryCommand(store, ['a'], id, 'move')).toBeNull();
    commands.run(setCategoryCommand(store, ['a'], 'nature', 'move')!);
    expect(store.get('a', 'poi')!.category).toBe('nature');
  });

  it('puts the places of a deleted category in "other"', () => {
    const id = create('Ideas', ['a', 'b']);
    commands.run(deleteCategoryCommand(store, id, 'delete'));
    expect(store.list('poi').map((p) => p.category)).toEqual(['other', 'other', 'water']);
    commands.undo();
    expect(categoryPlaces(store, id)).toHaveLength(2);
  });

  it('shows a place whose custom category is gone (deleted by someone else) as "other"', () => {
    store.apply([poi('d', { category: 'gone' })], 'load');
    expect(resolveCategory(store, 'gone')).toBe('other');
    expect(categoryInfo(store, t, 'gone').id).toBe('other');
  });

  it('turns an older folder into the category of its places', () => {
    const folder: PoiFolder = { id: 'f1', type: 'poiFolder', tripId: TRIP_ID, name: 'Georgia', order: 'a0', updatedAt: 0, updatedBy: 'u1', deleted: false };
    store.apply([folder, poi('e', { folderId: 'f1' }), poi('f', { folderId: 'missing' })], 'load');
    commands.patch(legacyFolderChanges(store, store.list('poi')));
    expect(store.get('e', 'poi')).toMatchObject({ category: 'f1' });
    expect(store.get('e', 'poi')!.folderId).toBeUndefined();
    expect(store.get('f', 'poi')).toMatchObject({ category: 'camp' });
    expect(store.get('f', 'poi')!.folderId).toBeUndefined();
    expect(categoryInfo(store, t, 'f1').iconKey).toBe('star');
  });

  it('falls back to the default icon for unknown icon keys', () => {
    expect(iconPath('nope')).toBe(POI_ICONS.star);
    expect(iconPath('tent')).toBe(POI_ICONS.tent);
  });

  it('replaces built-in categories by the trip’s own, moving their places and hiding them', () => {
    const campsite = create('CAMPSITE');
    const other = create('OTHER');
    commands.run(replaceCategoriesCommand(store, { camp: campsite, other, water: null }, 'replace')!);
    expect(replacements(store)).toEqual({ camp: campsite, other });
    expect(store.get('a', 'poi')!.category).toBe(campsite);
    expect(store.get('c', 'poi')!.category).toBe('water');
    const ids = allCategories(store, t).map((c) => c.id);
    expect(ids).not.toContain('camp');
    expect(ids).not.toContain('other');
    expect(ids).toContain('water');
    // Places added later with a replaced category, or left in a deleted one, show in the replacement.
    store.apply([poi('new', { category: 'camp' }), poi('lost', { category: 'gone' })], 'load');
    expect(resolveCategory(store, 'camp')).toBe(campsite);
    expect(resolveCategory(store, 'gone')).toBe(other);
    expect(categoryPlaces(store, campsite).map((p) => p.id).sort()).toEqual(['a', 'b', 'new']);
    // Keeping it again brings it back; places stay where they are.
    commands.run(replaceCategoriesCommand(store, { camp: null }, 'keep')!);
    expect(replacements(store)).toEqual({ other });
    expect(store.get('a', 'poi')!.category).toBe(campsite);
    expect(replaceCategoriesCommand(store, { camp: null }, 'keep')).toBeNull();
  });

  it('survives replacements that point at each other or at deleted categories', () => {
    commands.run(replaceCategoriesCommand(store, { sight: 'nature', nature: 'sight' }, 'loop')!);
    expect(resolveCategory(store, 'sight')).toBe('other');
    const id = create('Temp');
    commands.run(replaceCategoriesCommand(store, { water: id }, 'replace')!);
    commands.run(deleteCategoryCommand(store, id, 'delete'));
    expect(resolveCategory(store, 'water')).toBe('other');
  });

  it('suggests one of the trip’s categories with a matching name', () => {
    const custom = ['SIGHTS', 'LANDSCAPE', 'ACCOMODATION', 'REPAIR SHOP', 'FOOD/CAFE', 'OTHER', 'CAMPSITE'].map((name) => ({ id: name, name }));
    const suggest = (key: string) => suggestReplacement(t(key as 'poi.cat.sight'), custom);
    expect(suggest('poi.cat.sight')).toBe('SIGHTS');
    expect(suggest('poi.cat.nature')).toBe('LANDSCAPE');
    expect(suggest('poi.cat.camp')).toBe('CAMPSITE');
    expect(suggest('poi.cat.accommodation')).toBe('ACCOMODATION');
    expect(suggest('poi.cat.bikeShop')).toBe('REPAIR SHOP');
    expect(suggest('poi.cat.food')).toBe('FOOD/CAFE');
    expect(suggest('poi.cat.other')).toBe('OTHER');
    expect(suggest('poi.cat.water')).toBeNull();
    expect(suggest('poi.cat.border')).toBeNull();
  });
});

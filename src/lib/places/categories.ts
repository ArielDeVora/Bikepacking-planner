import { CATEGORY_COLORS, POI_CATEGORIES, POI_CATEGORY_ORDER, POI_ICONS, type PoiIconKey } from '../../config/pois';
import { edits, type Change, type Command } from '../../core/commands';
import type { t as translate } from '../../core/i18n';
import type { TripStore } from '../../core/store';
import { newId } from '../../model/ids';
import { keyBetween } from '../../model/order';
import type { Poi, PoiCategory, PoiFolder, Trip } from '../../model/types';

/**
 * Place categories: the built-in ones (config/pois.ts) and custom ones (`PoiFolder` entities,
 * with a name, colour and icon chosen by whoever made them). Each category is a folder in the
 * Places list, and a place's category is the folder it's in.
 */

export const DEFAULT_CUSTOM_ICON: PoiIconKey = 'star';

export interface CategoryInfo {
  id: string;
  name: string;
  color: string;
  /** Icon path. */
  icon: string;
  iconKey: PoiIconKey | null;
  /** The entity, for a custom category. */
  custom?: PoiFolder;
}

export const isBuiltIn = (id: string): id is PoiCategory => id in POI_CATEGORIES;

export function customCategories(store: TripStore): PoiFolder[] {
  return store.list('poiFolder').sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : a.name.localeCompare(b.name)));
}

/** Built-in categories the trip replaced by one of its own: built-in id → category id. */
export function replacements(store: TripStore): Record<string, string> {
  return store.list('trip')[0]?.categoryReplacements ?? {};
}

/**
 * The category a place shows as: its own, the one that replaced it (a built-in category the trip
 * doesn't use), or "other" if it was deleted.
 */
export function resolveCategory(store: TripStore, id: string): string {
  const replaced = replacements(store);
  const seen = new Set<string>();
  let current = id;
  while (!seen.has(current)) {
    seen.add(current);
    if (replaced[current]) current = replaced[current]!;
    else if (isBuiltIn(current) || store.get(current, 'poiFolder')) return current;
    else current = 'other';
  }
  return 'other';
}

export function iconPath(key: string | undefined): string {
  return POI_ICONS[(key ?? DEFAULT_CUSTOM_ICON) as PoiIconKey] ?? POI_ICONS[DEFAULT_CUSTOM_ICON];
}

export function categoryInfo(store: TripStore, t: typeof translate, id: string): CategoryInfo {
  const resolved = resolveCategory(store, id);
  if (isBuiltIn(resolved)) {
    const c = POI_CATEGORIES[resolved];
    return { id: resolved, name: t(`poi.cat.${resolved}`), color: c.color, icon: c.icon, iconKey: null };
  }
  const f = store.get(resolved, 'poiFolder')!;
  return {
    id: f.id,
    name: f.name || t('category.untitled'),
    color: f.color ?? CATEGORY_COLORS[0]!,
    icon: iconPath(f.icon),
    iconKey: (f.icon as PoiIconKey | undefined) ?? DEFAULT_CUSTOM_ICON,
    custom: f,
  };
}

/** Every category the trip uses: built-in ones it didn't replace, then custom ones in the order they were made. */
export function allCategories(store: TripStore, t: typeof translate): CategoryInfo[] {
  const replaced = replacements(store);
  return [...POI_CATEGORY_ORDER.filter((id) => !replaced[id]), ...customCategories(store).map((f) => f.id)].map((id) => categoryInfo(store, t, id));
}

/**
 * Sets which built-in categories are replaced, and by which category (null keeps the built-in
 * one). Places in a newly replaced category move to its replacement; later ones (e.g. added from
 * search with that category) show in the replacement too.
 */
export function replaceCategoriesCommand(store: TripStore, choices: Record<string, string | null>, label: string): Command | null {
  const trip = store.list('trip')[0];
  if (!trip) return null;
  const next: Record<string, string> = { ...(trip.categoryReplacements ?? {}) };
  for (const [builtIn, target] of Object.entries(choices)) {
    if (!isBuiltIn(builtIn)) continue;
    if (target && target !== builtIn) next[builtIn] = target;
    else delete next[builtIn];
  }
  const before = trip.categoryReplacements ?? {};
  const same = Object.keys(next).length === Object.keys(before).length && Object.entries(next).every(([k, v]) => before[k] === v);
  if (same) return null;
  const changes: Change[] = [edits.update<Trip>(store, trip.id, { categoryReplacements: Object.keys(next).length ? next : undefined })];
  for (const p of store.list('poi', (p) => !!next[p.category] && !before[p.category])) {
    changes.push(edits.update<Poi>(store, p.id, { category: next[p.category]! }));
  }
  return { label, changes };
}

const words = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4);

/**
 * One of the trip's own categories that looks like the same thing as a built-in one (by name:
 * "Sights" for Sight, "Campsite" for Camp spot, "Repair shop" for Bike shop), if any.
 */
export function suggestReplacement(builtInName: string, custom: { id: string; name: string }[]): string | null {
  const mine = words(builtInName).map((w) => w.slice(0, 4));
  if (!mine.length) return null;
  const match = custom.find((c) => words(c.name).some((w) => mine.includes(w.slice(0, 4))));
  return match?.id ?? null;
}

/** Id under which a category is hidden from the map (with the eye in the Places list). */
export const categoryVisibilityId = (id: string): string => (isBuiltIn(id) ? `poiCategory:${id}` : id);

export function categoryPlaces(store: TripStore, id: string): Poi[] {
  return store.list('poi', (p) => resolveCategory(store, p.category) === id);
}

let justCreated: string | null = null;

/** Whether this category was just made here (once): its card then focuses the name. */
export function takeJustCreated(id: string): boolean {
  if (justCreated !== id) return false;
  justCreated = null;
  return true;
}

/** A new custom category after the others, with the next colour in turn; places can be moved into it. */
export function createCategoryCommand(
  store: TripStore,
  opts: { tripId: string; userId: string; name: string; label: string; poiIds?: string[] },
): { command: Command; id: string } {
  const id = newId();
  const existing = customCategories(store);
  const used = new Set(existing.map((f) => f.color));
  const color = CATEGORY_COLORS.find((c) => !used.has(c)) ?? CATEGORY_COLORS[existing.length % CATEGORY_COLORS.length]!;
  const created = edits.create<PoiFolder>({
    id,
    type: 'poiFolder',
    tripId: opts.tripId,
    name: opts.name,
    order: keyBetween(existing.at(-1)?.order ?? null, null),
    color,
    icon: DEFAULT_CUSTOM_ICON,
    createdBy: opts.userId,
  });
  justCreated = id;
  const moves = (opts.poiIds ?? []).filter((p) => store.get(p, 'poi')).map((p) => edits.update<Poi>(store, p, { category: id }));
  return { command: { label: opts.label, changes: [created, ...moves] }, id };
}

/** Puts places in a category (its folder). */
export function setCategoryCommand(store: TripStore, poiIds: string[], category: string, label: string): Command | null {
  const changes = poiIds
    .map((id) => store.get(id, 'poi'))
    .filter((p): p is Poi => !!p && p.category !== category)
    .map((p) => edits.update<Poi>(store, p.id, { category }));
  return changes.length ? { label, changes } : null;
}

/** Deletes a custom category; its places become "other". */
export function deleteCategoryCommand(store: TripStore, id: string, label: string): Command {
  return {
    label,
    changes: [...categoryPlaces(store, id).map((p) => edits.update<Poi>(store, p.id, { category: 'other' })), edits.remove(store, id)],
  };
}

/** Older data: a place's folder becomes its category (when the folder still exists). */
export function legacyFolderChanges(store: TripStore, pois: Poi[]): Change[] {
  return pois
    .filter((p) => p.folderId !== undefined)
    .map((p) => {
      const folder = store.get(p.folderId!, 'poiFolder');
      return edits.update<Poi>(store, p.id, folder ? { category: folder.id, folderId: undefined } : { folderId: undefined });
    });
}

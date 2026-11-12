import { edits, type Command } from '../../core/commands';
import type { TripStore } from '../../core/store';
import { newId } from '../../model/ids';
import type { Gear, GearStatus } from '../../model/types';

export const GEAR_STATUSES: GearStatus[] = ['needed', 'bought', 'packed'];

/** Suggested sections (i18n keys); any other name can be typed. */
export const GEAR_CATEGORIES = ['sleeping', 'cooking', 'repair', 'clothing', 'electronics', 'bags', 'health', 'documents', 'other'] as const;

/** Bought or packed: paid for, so it counts in who paid what. */
export const isBought = (g: Gear) => g.status !== 'needed';

/** Weight and price are for one item; these are for all of them. */
export const totalWeight = (g: Gear) => (g.weight ?? 0) * (g.qty || 1);
export const totalCost = (g: Gear) => (g.price ?? 0) * (g.qty || 1);

export const nextStatus = (s: GearStatus): GearStatus => GEAR_STATUSES[(GEAR_STATUSES.indexOf(s) + 1) % GEAR_STATUSES.length]!;

/** Who sees an item in a filter: everything, the shared gear, or one person's (their own gear and what they bought). */
export type GearFilter = { kind: 'all' } | { kind: 'shared' } | { kind: 'person'; id: string };

export function matches(g: Gear, f: GearFilter): boolean {
  if (f.kind === 'shared') return !g.forId;
  if (f.kind === 'person') return g.forId === f.id || g.boughtBy === f.id;
  return true;
}

export function gearList(store: TripStore): Gear[] {
  return store.list('gear').sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/** Items grouped by section, sections in the order they first appear. */
export function bySection(items: Gear[]): [string, Gear[]][] {
  const out = new Map<string, Gear[]>();
  for (const g of items) {
    const key = g.category.trim() || '';
    out.set(key, [...(out.get(key) ?? []), g]);
  }
  return [...out];
}

/**
 * Adds an item, once per person it's for (null: shared). Personal gear for several people
 * becomes one item each, so each can tick theirs off.
 */
export function addGearCommand(
  store: TripStore,
  opts: { tripId: string; name: string; category: string; forIds: (string | null)[]; weight?: number; price?: number; label: string },
): Command {
  let order = Math.max(0, ...store.list('gear').map((g) => g.order)) + 1;
  const changes = opts.forIds.map((forId) =>
    edits.create<Gear>({
      id: newId(),
      type: 'gear',
      tripId: opts.tripId,
      name: opts.name.trim(),
      category: opts.category.trim(),
      ...(forId ? { forId } : {}),
      status: 'needed',
      qty: 1,
      ...(opts.weight && opts.weight > 0 ? { weight: opts.weight } : {}),
      ...(opts.price && opts.price > 0 ? { price: opts.price } : {}),
      order: order++,
    }),
  );
  return { label: opts.label, changes };
}

export type GearPatch = Partial<Pick<Gear, 'name' | 'category' | 'forId' | 'status' | 'boughtBy' | 'qty' | 'weight' | 'price' | 'notes'>>;

/** Changes an item. Marking it bought or packed without a buyer makes `me` the buyer. */
export function setGearCommand(store: TripStore, id: string, patch: GearPatch, me: string, label: string): Command | null {
  const g = store.get(id, 'gear');
  if (!g) return null;
  const next: GearPatch = { ...patch };
  if (next.status && next.status !== 'needed' && !g.boughtBy && !('boughtBy' in next)) next.boughtBy = me;
  // Optional fields left empty are removed rather than stored as empty values.
  for (const k of Object.keys(next) as (keyof GearPatch)[]) if (next[k] === '' || Number.isNaN(next[k])) next[k] = undefined;
  return { label, changes: [edits.update<Gear>(store, id, next)], mergeKey: `gear:${id}:${Object.keys(patch).join(',')}` };
}

export interface GearTotals {
  items: number;
  byStatus: Record<GearStatus, number>;
  /** Grams. */
  weight: number;
  price: number;
  /** Price of what's bought or packed. */
  spent: number;
}

export function totals(items: Gear[]): GearTotals {
  const byStatus = { needed: 0, bought: 0, packed: 0 };
  let weight = 0;
  let price = 0;
  let spent = 0;
  for (const g of items) {
    byStatus[g.status]++;
    weight += totalWeight(g);
    price += totalCost(g);
    if (isBought(g)) spent += totalCost(g);
  }
  return { items: items.length, byStatus, weight, price, spent };
}

export interface Spending {
  userId: string;
  /** Paid for shared gear. */
  shared: number;
  /** Paid for personal gear (theirs or someone else's). */
  personal: number;
  /** What they're owed (+) or owe (−) once shared gear is split evenly. Everyone's adds up to 0. */
  balance: number;
}

export interface SpendingReport {
  people: Spending[];
  /** Bought items whose buyer isn't one of `people`: left out of the split until someone is set. */
  unassigned: Gear[];
}

/**
 * Who paid what, and how the shared gear's cost splits evenly between `people`. Only what's
 * bought counts. Personal gear with no buyer is taken as bought by the person it's for.
 */
export function spending(items: Gear[], people: string[]): SpendingReport {
  const members = new Set(people);
  const out = new Map(people.map((id) => [id, { userId: id, shared: 0, personal: 0, balance: 0 }]));
  const unassigned: Gear[] = [];
  let sharedTotal = 0;
  for (const g of items) {
    const cost = totalCost(g);
    if (!cost || !isBought(g)) continue;
    const owner = g.forId && members.has(g.forId) ? g.forId : null;
    const buyer = g.boughtBy && members.has(g.boughtBy) ? g.boughtBy : g.boughtBy ? null : owner;
    if (!buyer) {
      unassigned.push(g);
      continue;
    }
    const s = out.get(buyer)!;
    if (g.forId) {
      s.personal += cost;
      // Bought for someone else: they owe it back.
      if (owner && owner !== buyer) {
        s.balance += cost;
        out.get(owner)!.balance -= cost;
      }
    } else {
      s.shared += cost;
      sharedTotal += cost;
    }
  }
  const share = people.length ? sharedTotal / people.length : 0;
  for (const s of out.values()) s.balance += s.shared - share;
  return { people: [...out.values()], unassigned };
}

/**
 * Moves an item before or after another one, or to the end of a section, taking that item's
 * section. The list is renumbered; only items whose place or section changes are written.
 */
export function moveGearCommand(
  store: TripStore,
  id: string,
  to: { id: string; where: 'before' | 'after' } | { section: string },
  label: string,
): Command | null {
  const list = gearList(store);
  const moved = list.find((g) => g.id === id);
  if (!moved || ('id' in to && to.id === id)) return null;
  const rest = list.filter((g) => g.id !== id);
  let index: number;
  let category: string;
  if ('id' in to) {
    const target = rest.findIndex((g) => g.id === to.id);
    if (target < 0) return null;
    index = to.where === 'before' ? target : target + 1;
    category = rest[target]!.category;
  } else {
    const last = rest.map((g) => g.category.trim()).lastIndexOf(to.section.trim());
    index = last < 0 ? rest.length : last + 1;
    category = to.section;
  }
  rest.splice(index, 0, moved);
  const changes = rest.flatMap((g, i) => {
    const patch: GearPatch & { order?: number } = {};
    if (g.order !== i + 1) patch.order = i + 1;
    if (g.id === id && g.category !== category) patch.category = category;
    return Object.keys(patch).length ? [edits.update<Gear>(store, g.id, patch)] : [];
  });
  return changes.length ? { label, changes } : null;
}

/** A table as CSV (spreadsheets) or tab-separated text (to paste into one). */
export function toTable(rows: (string | number | null | undefined)[][], format: 'csv' | 'tsv', decimalComma = false): string {
  // Semicolons where the decimal separator is a comma, as spreadsheets there expect.
  const sep = format === 'tsv' ? '\t' : decimalComma ? ';' : ',';
  const cell = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return '';
    const text = typeof v === 'number' ? (decimalComma ? String(v).replace('.', ',') : String(v)) : v;
    if (format === 'tsv') return text.replace(/[\t\n\r]+/g, ' ');
    return /["\n\r]/.test(text) || text.includes(sep) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return rows.map((r) => r.map(cell).join(sep)).join('\r\n');
}

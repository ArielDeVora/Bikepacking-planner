import { edits, type Command } from '../../core/commands';
import type { TripStore } from '../../core/store';
import { newId } from '../../model/ids';
import type { Gear, GearStatus } from '../../model/types';

export const GEAR_STATUSES: GearStatus[] = ['needed', 'bought', 'packed'];

/** Suggested sections (i18n keys); any other name can be typed. */
export const GEAR_CATEGORIES = ['sleeping', 'cooking', 'repair', 'clothing', 'electronics', 'bags', 'health', 'documents', 'other'] as const;

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
  opts: { tripId: string; name: string; category: string; forIds: (string | null)[]; label: string },
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
}

export function totals(items: Gear[]): GearTotals {
  const byStatus = { needed: 0, bought: 0, packed: 0 };
  let weight = 0;
  let price = 0;
  for (const g of items) {
    byStatus[g.status]++;
    weight += (g.weight ?? 0) * (g.qty || 1);
    price += g.price ?? 0;
  }
  return { items: items.length, byStatus, weight, price };
}

export interface Spending {
  userId: string;
  /** Paid for shared gear. */
  shared: number;
  /** Paid for personal gear (theirs or someone else's). */
  personal: number;
  /** What they're owed (+) or owe (−) once shared gear is split evenly. */
  balance: number;
}

/** Who paid what, and how the shared gear's cost splits between `people`. */
export function spending(items: Gear[], people: string[]): Spending[] {
  const out = new Map(people.map((id) => [id, { userId: id, shared: 0, personal: 0, balance: 0 }]));
  let sharedTotal = 0;
  for (const g of items) {
    if (!g.price) continue;
    if (!g.forId) sharedTotal += g.price;
    if (!g.boughtBy) continue;
    let s = out.get(g.boughtBy);
    if (!s) out.set(g.boughtBy, (s = { userId: g.boughtBy, shared: 0, personal: 0, balance: 0 }));
    if (g.forId) {
      s.personal += g.price;
      // Bought for someone else: they owe it back.
      if (g.forId !== g.boughtBy) {
        s.balance += g.price;
        const owner = out.get(g.forId);
        if (owner) owner.balance -= g.price;
      }
    } else s.shared += g.price;
  }
  const share = people.length ? sharedTotal / people.length : 0;
  for (const s of out.values()) s.balance += s.shared - (people.includes(s.userId) ? share : 0);
  return [...out.values()];
}

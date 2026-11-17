import type { Gear } from '../../model/types';

export type PartId =
  | 'rearRack'
  | 'frontRack'
  | 'rearPanniers'
  | 'frontPanniers'
  | 'rearTop'
  | 'frontTop'
  | 'frameBag'
  | 'handlebarBag'
  | 'seatPack'
  | 'topTubeBag'
  | 'cageDown'
  | 'cageSeat'
  | 'cageUnder'
  | 'cageFork';

export type Zone = 'front' | 'middle' | 'rear';
export type Side = 'L' | 'R';

export interface CarrierDef {
  id: string;
  side?: Side;
}

export interface PartDef {
  id: PartId;
  group: 'racks' | 'bags' | 'cages';
  zone: Zone;
  /** Another part it mounts on. */
  needs?: PartId;
  variants?: readonly string[];
  /** Where gear goes; racks carry nothing themselves (their load is a bag or an open load on top). */
  carriers: readonly CarrierDef[];
  /** Typical weight of one bag, cage or rack, in grams, shown as a hint. */
  typical: number;
  /** Where its load sits along the bike, in mm in front of the rear axle (front axle at WHEELBASE). */
  x: number;
}

export const WHEELBASE = 1030;

export const PARTS: readonly PartDef[] = [
  { id: 'rearRack', group: 'racks', zone: 'rear', carriers: [], typical: 650, x: 20 },
  { id: 'frontRack', group: 'racks', zone: 'front', carriers: [], typical: 550, x: 1040 },
  { id: 'rearPanniers', group: 'bags', zone: 'rear', needs: 'rearRack', carriers: [{ id: 'rearPannierL', side: 'L' }, { id: 'rearPannierR', side: 'R' }], typical: 900, x: -13 },
  { id: 'frontPanniers', group: 'bags', zone: 'front', carriers: [{ id: 'frontPannierL', side: 'L' }, { id: 'frontPannierR', side: 'R' }], typical: 600, x: 1027 },
  { id: 'rearTop', group: 'bags', zone: 'rear', needs: 'rearRack', variants: ['bag', 'open'], carriers: [{ id: 'rearTop' }], typical: 500, x: 30 },
  { id: 'frontTop', group: 'bags', zone: 'front', needs: 'frontRack', variants: ['bag', 'open'], carriers: [{ id: 'frontTop' }], typical: 450, x: 1042 },
  { id: 'frameBag', group: 'bags', zone: 'middle', variants: ['half', 'full'], carriers: [{ id: 'frameBag' }], typical: 300, x: 560 },
  { id: 'handlebarBag', group: 'bags', zone: 'front', carriers: [{ id: 'handlebarBag' }], typical: 450, x: 1050 },
  { id: 'seatPack', group: 'bags', zone: 'rear', carriers: [{ id: 'seatPack' }], typical: 450, x: 90 },
  { id: 'topTubeBag', group: 'bags', zone: 'middle', carriers: [{ id: 'topTubeBag' }], typical: 150, x: 705 },
  { id: 'cageDown', group: 'cages', zone: 'middle', carriers: [{ id: 'cageDown' }], typical: 40, x: 581 },
  { id: 'cageSeat', group: 'cages', zone: 'middle', carriers: [{ id: 'cageSeat' }], typical: 40, x: 411 },
  { id: 'cageUnder', group: 'cages', zone: 'middle', carriers: [{ id: 'cageUnder' }], typical: 40, x: 611 },
  { id: 'cageFork', group: 'cages', zone: 'front', carriers: [{ id: 'cageForkL', side: 'L' }, { id: 'cageForkR', side: 'R' }], typical: 90, x: 961 },
];

const BY_ID = new Map(PARTS.map((p) => [p.id, p]));
export const partDef = (id: PartId): PartDef => BY_ID.get(id)!;

/** Gear carried by the rider (worn, in pockets, on the back) rather than by the bike. */
export const ON_ME = 'onMe';

/** The part a carrier belongs to. */
export function partOfCarrier(carrier: string): PartDef | undefined {
  return PARTS.find((p) => p.carriers.some((c) => c.id === carrier));
}

export interface PartState {
  owned: boolean;
  mounted: boolean;
  variant?: string;
  /** Grams for one bag, cage or rack. */
  weight?: number;
  /** The gear item that is this bag, cage or rack: its weight replaces `weight`. */
  gearId?: string;
}

export interface Setup {
  parts: Partial<Record<PartId, PartState>>;
  /** Gear id → carrier id. Kept while a part is off the bike, so its load comes back with it. */
  assign: Record<string, string>;
  /** Grams. */
  bike?: number;
  rider?: number;
}

export const emptySetup = (): Setup => ({ parts: {}, assign: {} });

/** A saved setup, cleaned of anything unknown. */
export function readSetup(raw: unknown): Setup {
  const out = emptySetup();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as { parts?: Record<string, Partial<PartState>>; assign?: Record<string, unknown>; bike?: unknown; rider?: unknown };
  const grams = (v: unknown) => (typeof v === 'number' && v >= 0 ? v : undefined);
  for (const [id, p] of Object.entries(r.parts ?? {})) {
    const def = BY_ID.get(id as PartId);
    if (!def || !p || typeof p !== 'object') continue;
    out.parts[def.id] = {
      owned: !!p.owned,
      mounted: !!p.owned && !!p.mounted,
      variant: def.variants?.includes(p.variant ?? '') ? p.variant : def.variants?.[0],
      weight: grams(p.weight),
      ...(typeof p.gearId === 'string' ? { gearId: p.gearId } : {}),
    };
  }
  for (const [gear, carrier] of Object.entries(r.assign ?? {})) {
    if (typeof carrier === 'string' && (carrier === ON_ME || partOfCarrier(carrier))) out.assign[gear] = carrier;
  }
  out.bike = grams(r.bike);
  out.rider = grams(r.rider);
  return out;
}

export const isMounted = (s: Setup, id: PartId) => !!s.parts[id]?.mounted;
export const isOwned = (s: Setup, id: PartId) => !!s.parts[id]?.owned;
export const variantOf = (s: Setup, id: PartId) => s.parts[id]?.variant ?? partDef(id).variants?.[0];

function withPart(s: Setup, id: PartId, patch: Partial<PartState>): Setup {
  const def = partDef(id);
  const cur = s.parts[id] ?? { owned: false, mounted: false, variant: def.variants?.[0] };
  return { ...s, parts: { ...s.parts, [id]: { ...cur, ...patch } } };
}

const dependents = (id: PartId) => PARTS.filter((p) => p.needs === id).map((p) => p.id);

export function setOwned(s: Setup, id: PartId, owned: boolean): Setup {
  if (owned) return withPart(s, id, { owned: true });
  return withPart(unmount(s, id), id, { owned: false, mounted: false });
}

/** Puts a part on the bike, with the rack it needs when that's owned; `needs` names a missing rack. */
export function mount(s: Setup, id: PartId): { setup: Setup; needs?: PartId } {
  const def = partDef(id);
  let next = s;
  if (def.needs && !isMounted(s, def.needs)) {
    if (!isOwned(s, def.needs)) return { setup: s, needs: def.needs };
    next = withPart(next, def.needs, { mounted: true });
  }
  return { setup: withPart(next, id, { owned: true, mounted: true }) };
}

/** Takes a part off the bike, with what's mounted on it. */
export function unmount(s: Setup, id: PartId): Setup {
  let next = s.parts[id] ? withPart(s, id, { mounted: false }) : s;
  for (const d of dependents(id)) if (isMounted(next, d)) next = unmount(next, d);
  return next;
}

export const setVariant = (s: Setup, id: PartId, variant: string) => withPart(s, id, { variant });
export const setWeight = (s: Setup, id: PartId, weight: number | undefined) => withPart(s, id, { weight });

/** The part a gear item is linked to as its bag, cage or rack. */
export const partOfGear = (s: Setup, gearId: string): PartId | undefined =>
  (Object.keys(s.parts) as PartId[]).find((id) => s.parts[id]?.gearId === gearId);

function unlinked(s: Setup, gearId: string): Setup {
  const id = partOfGear(s, gearId);
  return id ? withPart(s, id, { gearId: undefined }) : s;
}

/** Puts a gear item in a bag (or on the rider with ON_ME), or back in the list with null. */
export function assign(s: Setup, gearId: string, carrier: string | null): Setup {
  const next = { ...s.assign };
  if (carrier) next[gearId] = carrier;
  else delete next[gearId];
  return { ...unlinked(s, gearId), assign: next };
}

/** Makes a gear item the part itself (its bag, cage or rack), or unlinks the part with null. */
export function link(s: Setup, id: PartId, gearId: string | null): Setup {
  if (!gearId) return withPart(s, id, { gearId: undefined });
  const next = { ...s.assign };
  delete next[gearId];
  return withPart({ ...unlinked(s, gearId), assign: next }, id, { gearId });
}

export const setBike = (s: Setup, grams: number | undefined): Setup => ({ ...s, bike: grams });
export const setRider = (s: Setup, grams: number | undefined): Setup => ({ ...s, rider: grams });

export const gearGrams = (g: Gear) => (g.weight ?? 0) * (g.qty || 1);

export interface Load {
  carrier: string;
  part: PartId;
  side?: Side;
  items: Gear[];
  contents: number;
  /** The bag or cage itself. */
  own: number;
  /** The gear item it is, when linked. */
  bag?: Gear;
  total: number;
  /** Items without a weight. */
  unweighed: number;
}

export interface Loading {
  carriers: Load[];
  /** Gear not placed anywhere (or in a part that is off the bike). */
  loose: Gear[];
  /** Racks, which carry bags rather than gear. */
  hardware: { part: PartId; weight: number; bag?: Gear }[];
  zones: Record<Zone, number>;
  /** Left and right panniers and fork cages. */
  sides: Record<Side, number>;
  /** How the luggage presses on each wheel, in grams (a load behind the rear axle lifts the front a little). */
  wheels: { front: number; rear: number };
  /** Everything on the bike: racks, bags and gear. */
  total: number;
  onMe: { items: Gear[]; weight: number; unweighed: number };
}

/** `all` is used to find gear linked as bags that `gear` (the list shown) leaves out. */
export function loading(s: Setup, gear: Gear[], all: Gear[] = gear): Loading {
  const byId = new Map(all.map((g) => [g.id, g]));
  for (const g of gear) byId.set(g.id, g);
  const carriers: Load[] = [];
  const index = new Map<string, Load>();
  const hardware: Loading['hardware'] = [];
  const zones: Record<Zone, number> = { front: 0, middle: 0, rear: 0 };
  const sides: Record<Side, number> = { L: 0, R: 0 };
  let moment = 0;
  const linked = new Set<string>();
  for (const def of PARTS) {
    const st = s.parts[def.id];
    const bag = st?.gearId ? byId.get(st.gearId) : undefined;
    if (bag) linked.add(bag.id);
    if (!isMounted(s, def.id)) continue;
    // A linked item's weight is spread over the part's bags (a pair of panniers: two bags).
    const whole = bag ? gearGrams(bag) : (st?.weight ?? 0) * Math.max(1, def.carriers.length);
    if (!def.carriers.length) {
      hardware.push({ part: def.id, weight: whole, bag });
      zones[def.zone] += whole;
      moment += whole * def.x;
      continue;
    }
    const own = whole / def.carriers.length;
    for (const c of def.carriers) {
      const load: Load = { carrier: c.id, part: def.id, side: c.side, items: [], contents: 0, own, total: own, unweighed: 0, bag };
      carriers.push(load);
      index.set(c.id, load);
    }
  }
  const loose: Gear[] = [];
  const onMe: Loading['onMe'] = { items: [], weight: 0, unweighed: 0 };
  for (const g of gear) {
    if (linked.has(g.id)) continue;
    const where = s.assign[g.id] ?? '';
    if (where === ON_ME) {
      onMe.items.push(g);
      onMe.weight += gearGrams(g);
      if (g.weight === undefined) onMe.unweighed++;
      continue;
    }
    const load = index.get(where);
    if (!load) {
      loose.push(g);
      continue;
    }
    load.items.push(g);
    load.contents += gearGrams(g);
    if (g.weight === undefined) load.unweighed++;
  }
  let total = hardware.reduce((n, h) => n + h.weight, 0);
  for (const l of carriers) {
    l.total = l.own + l.contents;
    const def = partDef(l.part);
    zones[def.zone] += l.total;
    moment += l.total * def.x;
    if (l.side) sides[l.side] += l.total;
    total += l.total;
  }
  const front = moment / WHEELBASE;
  return { carriers, loose, hardware, zones, sides, wheels: { front, rear: total - front }, total, onMe };
}

export type Warning = 'fullFrameCages' | 'seatPackRack' | 'forkCagesPanniers';

export function warnings(s: Setup): Warning[] {
  const out: Warning[] = [];
  if (isMounted(s, 'frameBag') && variantOf(s, 'frameBag') === 'full' && (isMounted(s, 'cageDown') || isMounted(s, 'cageSeat'))) out.push('fullFrameCages');
  if (isMounted(s, 'seatPack') && isMounted(s, 'rearTop')) out.push('seatPackRack');
  if (isMounted(s, 'cageFork') && isMounted(s, 'frontPanniers')) out.push('forkCagesPanniers');
  return out;
}

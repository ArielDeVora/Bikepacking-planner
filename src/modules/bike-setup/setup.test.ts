import { describe, expect, it } from 'vitest';
import type { Gear } from '../../model/types';
import { assign, emptySetup, isMounted, link, loading, mount, ON_ME, partOfGear, readSetup, setOwned, setVariant, setWeight, unmount, warnings, WHEELBASE } from './setup';

const gear = (id: string, weight?: number, qty = 1): Gear =>
  ({ id, type: 'gear', tripId: 't', name: id, category: '', status: 'bought', qty, weight, order: 0, updatedAt: 0, updatedBy: '', deleted: false }) as Gear;

describe('bike setup', () => {
  it('mounts a bag with the rack it needs, or names the missing rack', () => {
    let s = setOwned(emptySetup(), 'rearPanniers', true);
    expect(mount(s, 'rearPanniers').needs).toBe('rearRack');
    s = setOwned(s, 'rearRack', true);
    s = mount(s, 'rearPanniers').setup;
    expect(isMounted(s, 'rearRack')).toBe(true);
    expect(isMounted(s, 'rearPanniers')).toBe(true);
  });

  it('takes bags off with their rack, and everything off when the rack is no longer owned', () => {
    let s = setOwned(setOwned(emptySetup(), 'frontRack', true), 'frontTop', true);
    s = mount(s, 'frontTop').setup;
    expect(isMounted(unmount(s, 'frontRack'), 'frontTop')).toBe(false);
    const gone = setOwned(s, 'frontRack', false);
    expect(isMounted(gone, 'frontTop')).toBe(false);
    expect(gone.parts.frontTop?.owned).toBe(true);
  });

  it('weighs each bag: its own weight plus what is in it, and leaves the rest loose', () => {
    let s = setOwned(emptySetup(), 'rearRack', true);
    s = mount(s, 'rearPanniers').setup;
    s = setWeight(setWeight(s, 'rearPanniers', 900), 'rearRack', 650);
    s = assign(assign(assign(s, 'tent', 'rearPannierL'), 'stove', 'rearPannierR'), 'pegs', 'frameBag');
    const l = loading(s, [gear('tent', 1200), gear('stove', 150, 2), gear('pegs', 10), gear('spoon')]);
    const left = l.carriers.find((c) => c.carrier === 'rearPannierL')!;
    expect(left.total).toBe(2100);
    expect(l.sides).toEqual({ L: 2100, R: 1200 });
    expect(l.loose.map((g) => g.id)).toEqual(['pegs', 'spoon']);
    expect(l.total).toBe(650 + 2100 + 1200);
    expect(l.zones.rear).toBe(l.total);
  });

  it('keeps a part’s load while it is off the bike', () => {
    let s = mount(emptySetup(), 'seatPack').setup;
    s = assign(s, 'quilt', 'seatPack');
    expect(loading(unmount(s, 'seatPack'), [gear('quilt', 600)]).loose).toHaveLength(1);
    expect(loading(mount(unmount(s, 'seatPack'), 'seatPack').setup, [gear('quilt', 600)]).loose).toHaveLength(0);
  });

  it('warns about a full frame bag with cages inside the frame', () => {
    let s = mount(mount(emptySetup(), 'frameBag').setup, 'cageDown').setup;
    expect(warnings(s)).toEqual([]);
    s = setVariant(s, 'frameBag', 'full');
    expect(warnings(s)).toEqual(['fullFrameCages']);
  });

  it('reads a saved setup and drops what it does not know', () => {
    const s = readSetup({ parts: { seatPack: { owned: true, mounted: true, weight: 400 }, jetpack: { owned: true }, frameBag: { owned: false, mounted: true, variant: 'x' } }, assign: { a: 'seatPack', b: 'moon' } });
    expect(s.parts.seatPack).toEqual({ owned: true, mounted: true, variant: undefined, weight: 400 });
    expect(s.parts.frameBag).toEqual({ owned: false, mounted: false, variant: 'half', weight: undefined });
    expect(s.assign).toEqual({ a: 'seatPack' });
  });

  it('uses a linked gear item as the bag, spread over a pair, and keeps it out of the list', () => {
    let s = mount(setOwned(emptySetup(), 'rearRack', true), 'rearPanniers').setup;
    s = setWeight(s, 'rearPanniers', 900);
    s = assign(s, 'bags', 'frameBag');
    s = link(s, 'rearPanniers', 'bags');
    expect(s.assign.bags).toBeUndefined();
    const l = loading(s, [gear('bags', 950, 2), gear('tent', 1200)]);
    expect(l.carriers.map((c) => c.own)).toEqual([950, 950]);
    expect(l.carriers[0]!.bag?.id).toBe('bags');
    expect(l.loose.map((g) => g.id)).toEqual(['tent']);
    s = assign(s, 'bags', 'rearPannierL');
    expect(partOfGear(s, 'bags')).toBeUndefined();
  });

  it('finds a linked bag outside the gear shown, and moves a link from one part to another', () => {
    let s = mount(emptySetup(), 'seatPack').setup;
    s = link(s, 'seatPack', 'shared-bag');
    expect(loading(s, [], [gear('shared-bag', 400)]).total).toBe(400);
    s = link(mount(s, 'handlebarBag').setup, 'handlebarBag', 'shared-bag');
    expect(s.parts.seatPack?.gearId).toBeUndefined();
    expect(s.parts.handlebarBag?.gearId).toBe('shared-bag');
  });

  it('keeps what the rider carries apart from the bike', () => {
    let s = mount(emptySetup(), 'frameBag').setup;
    s = assign(assign(s, 'jacket', ON_ME), 'tools', 'frameBag');
    const l = loading(s, [gear('jacket', 300), gear('tools', 500), gear('helmet')]);
    expect(l.onMe).toMatchObject({ weight: 300, unweighed: 0 });
    expect(l.onMe.items.map((g) => g.id)).toEqual(['jacket']);
    expect(l.total).toBe(500);
    expect(l.loose.map((g) => g.id)).toEqual(['helmet']);
  });

  it('splits the luggage between the wheels by where it sits', () => {
    let s = mount(mount(emptySetup(), 'frameBag').setup, 'handlebarBag').setup;
    s = assign(assign(s, 'a', 'frameBag'), 'b', 'handlebarBag');
    const l = loading(s, [gear('a', 1000), gear('b', 1000)]);
    expect(l.wheels.front + l.wheels.rear).toBeCloseTo(2000);
    expect(l.wheels.front).toBeCloseTo(1000 * (560 / WHEELBASE) + 1000 * (1050 / WHEELBASE));
  });

  it('reads the bike, the rider and what they carry', () => {
    const s = readSetup({ parts: { seatPack: { owned: true, mounted: true, gearId: 'g1' } }, assign: { j: ON_ME }, bike: 10200, rider: -5 });
    expect(s.parts.seatPack?.gearId).toBe('g1');
    expect(s.assign).toEqual({ j: ON_ME });
    expect(s.bike).toBe(10200);
    expect(s.rider).toBeUndefined();
  });

  it('puts front panniers on without a rack, but not rear panniers', () => {
    const s = setOwned(setOwned(emptySetup(), 'frontPanniers', true), 'rearPanniers', true);
    const front = mount(s, 'frontPanniers');
    expect(front.needs).toBeUndefined();
    expect(isMounted(front.setup, 'frontPanniers')).toBe(true);
    expect(isMounted(front.setup, 'frontRack')).toBe(false);
    expect(mount(s, 'rearPanniers').needs).toBe('rearRack');
  });
});

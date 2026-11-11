import { beforeEach, describe, expect, it } from 'vitest';
import { CommandStack } from '../../core/commands';
import { TripStore } from '../../core/store';
import type { Gear } from '../../model/types';
import { TRIP_ID } from '../../test/fixtures';
import { addGearCommand, bySection, gearList, matches, nextStatus, setGearCommand, spending, totals } from './gear';

let store: TripStore;
let commands: CommandStack;

beforeEach(() => {
  store = new TripStore();
  commands = new CommandStack(store, () => 'me');
});

const item = (over: Partial<Gear>): Gear =>
  ({ id: 'x', type: 'gear', tripId: TRIP_ID, updatedAt: 0, updatedBy: '', deleted: false, name: 'x', category: '', status: 'needed', qty: 1, order: 0, ...over }) as Gear;

describe('gear checklist', () => {
  it('adds personal gear once per person, shared gear once', () => {
    commands.run(addGearCommand(store, { tripId: TRIP_ID, name: ' Sleeping bag ', category: 'Sleeping', forIds: ['a', 'b'], label: 'add' }));
    commands.run(addGearCommand(store, { tripId: TRIP_ID, name: 'Stove', category: 'Cooking', forIds: [null], label: 'add' }));
    const list = gearList(store);
    expect(list.map((g) => [g.name, g.forId ?? null])).toEqual([
      ['Sleeping bag', 'a'],
      ['Sleeping bag', 'b'],
      ['Stove', null],
    ]);
    expect(bySection(list).map(([s, items]) => [s, items.length])).toEqual([
      ['Sleeping', 2],
      ['Cooking', 1],
    ]);
  });

  it('makes me the buyer when I tick an item, unless someone is set', () => {
    commands.run(addGearCommand(store, { tripId: TRIP_ID, name: 'Pump', category: '', forIds: [null], label: 'add' }));
    const id = gearList(store)[0]!.id;
    commands.run(setGearCommand(store, id, { status: nextStatus('needed') }, 'me', 'set')!);
    expect(store.get(id, 'gear')).toMatchObject({ status: 'bought', boughtBy: 'me' });
    commands.run(setGearCommand(store, id, { boughtBy: 'zoe', price: Number.NaN }, 'me', 'set')!);
    commands.run(setGearCommand(store, id, { status: 'packed' }, 'me', 'set')!);
    expect(store.get(id, 'gear')).toMatchObject({ status: 'packed', boughtBy: 'zoe' });
    expect(store.get(id, 'gear')?.price).toBeUndefined();
  });

  it('filters by shared gear and by person', () => {
    const own = item({ forId: 'a' });
    const boughtForAll = item({ boughtBy: 'a' });
    expect(matches(own, { kind: 'shared' })).toBe(false);
    expect(matches(boughtForAll, { kind: 'person', id: 'a' })).toBe(true);
    expect(matches(own, { kind: 'person', id: 'b' })).toBe(false);
  });

  it('adds up weight, price and statuses', () => {
    const t = totals([item({ weight: 500, qty: 2, price: 30 }), item({ status: 'packed', weight: 100 })]);
    expect(t).toEqual({ items: 2, byStatus: { needed: 1, bought: 0, packed: 1 }, weight: 1100, price: 30 });
  });

  it('splits shared costs and what was bought for someone else', () => {
    const s = spending(
      [
        item({ price: 90, boughtBy: 'a' }), // shared, 30 each
        item({ price: 40, boughtBy: 'a', forId: 'b' }), // a bought b's
        item({ price: 25, boughtBy: 'c', forId: 'c' }), // c's own
      ],
      ['a', 'b', 'c'],
    );
    const by = Object.fromEntries(s.map((x) => [x.userId, x]));
    expect(by.a).toMatchObject({ shared: 90, personal: 40, balance: 100 });
    expect(by.b).toMatchObject({ balance: -70 });
    expect(by.c).toMatchObject({ personal: 25, balance: -30 });
  });
});

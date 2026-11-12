import { beforeEach, describe, expect, it } from 'vitest';
import { CommandStack } from '../../core/commands';
import { TripStore } from '../../core/store';
import type { Gear } from '../../model/types';
import { TRIP_ID } from '../../test/fixtures';
import { addGearCommand, bySection, gearList, matches, moveGearCommand, nextStatus, setGearCommand, spending, toTable, totals } from './gear';

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

  it('keeps the weight and price given when adding', () => {
    commands.run(addGearCommand(store, { tripId: TRIP_ID, name: 'Tube', category: '', forIds: [null], weight: 120, price: 8.5, label: 'add' }));
    commands.run(addGearCommand(store, { tripId: TRIP_ID, name: 'Map', category: '', forIds: [null], weight: 0, label: 'add' }));
    const [tube, map] = gearList(store);
    expect(tube).toMatchObject({ weight: 120, price: 8.5 });
    expect(map!.weight).toBeUndefined();
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
    const t = totals([item({ weight: 500, qty: 2, price: 30 }), item({ status: 'packed', weight: 100, price: 12, qty: 3 })]);
    expect(t).toEqual({ items: 2, byStatus: { needed: 1, bought: 0, packed: 1 }, weight: 1300, price: 96, spent: 36 });
  });

  it('splits shared costs and what was bought for someone else', () => {
    const s = spending(
      [
        item({ price: 45, qty: 2, boughtBy: 'a', status: 'bought' }), // shared, 30 each
        item({ price: 40, boughtBy: 'a', forId: 'b', status: 'packed' }), // a bought b's
        item({ price: 25, boughtBy: 'c', forId: 'c', status: 'bought' }), // c's own
        item({ price: 500, boughtBy: 'b' }), // not bought yet: left out
        item({ price: 60, boughtBy: 'b', forId: 'a' }), // not bought yet: left out
      ],
      ['a', 'b', 'c'],
    );
    const by = Object.fromEntries(s.people.map((x) => [x.userId, x]));
    expect(by.a).toMatchObject({ shared: 90, personal: 40, balance: 100 });
    expect(by.b).toMatchObject({ balance: -70 });
    expect(by.c).toMatchObject({ personal: 25, balance: -30 });
    expect(s.unassigned).toEqual([]);
  });

  it('leaves out bought items with no known buyer, so balances still add up to zero', () => {
    const noBuyer = item({ id: 'n', price: 200, status: 'bought' });
    const stranger = item({ id: 's', price: 50, status: 'packed', boughtBy: 'old-browser-id' });
    const s = spending(
      [
        item({ price: 221.84, boughtBy: 'b', status: 'bought' }),
        noBuyer,
        stranger,
        item({ price: 30, forId: 'c', status: 'bought' }), // own gear, no buyer: c bought it
      ],
      ['a', 'b', 'c'],
    );
    const by = Object.fromEntries(s.people.map((x) => [x.userId, x]));
    expect(by.a!.balance).toBeCloseTo(-73.95, 2);
    expect(by.b!.balance).toBeCloseTo(147.89, 2);
    expect(by.c).toMatchObject({ personal: 30 });
    expect(s.people.reduce((sum, x) => sum + x.balance, 0)).toBeCloseTo(0, 9);
    expect(s.unassigned.map((g) => g.id)).toEqual(['n', 's']);
  });

  it('moves an item within its section or into another one', () => {
    const add = (name: string, category: string) => commands.run(addGearCommand(store, { tripId: TRIP_ID, name, category, forIds: [null], label: 'add' }));
    add('Tent', 'Sleeping');
    add('Mat', 'Sleeping');
    add('Stove', 'Cooking');
    add('Pot', 'Cooking');
    const id = (name: string) => gearList(store).find((g) => g.name === name)!.id;
    const names = () => bySection(gearList(store)).map(([sec, items]) => `${sec}: ${items.map((g) => g.name).join(', ')}`);

    commands.run(moveGearCommand(store, id('Mat'), { id: id('Tent'), where: 'before' }, 'move')!);
    expect(names()).toEqual(['Sleeping: Mat, Tent', 'Cooking: Stove, Pot']);

    commands.run(moveGearCommand(store, id('Pot'), { id: id('Mat'), where: 'after' }, 'move')!);
    expect(names()).toEqual(['Sleeping: Mat, Pot, Tent', 'Cooking: Stove']);

    commands.run(moveGearCommand(store, id('Tent'), { section: 'Cooking' }, 'move')!);
    expect(names()).toEqual(['Sleeping: Mat, Pot', 'Cooking: Stove, Tent']);
    expect(moveGearCommand(store, id('Tent'), { section: 'Cooking' }, 'move')).toBeNull();
  });

  it('writes tables for spreadsheets', () => {
    const rows = [
      ['Item', 'Price'],
      ['Tent; 2 people', 12.5],
      ['Say "hi"', null],
    ];
    expect(toTable(rows, 'csv')).toBe('Item,Price\r\nTent; 2 people,12.5\r\n"Say ""hi""",');
    expect(toTable(rows, 'csv', true)).toBe('Item;Price\r\n"Tent; 2 people";12,5\r\n"Say ""hi""";');
    expect(toTable(rows, 'tsv')).toBe('Item\tPrice\r\nTent; 2 people\t12.5\r\nSay "hi"\t');
  });
});

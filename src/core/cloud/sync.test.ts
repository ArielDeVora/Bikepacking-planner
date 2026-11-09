import { afterEach, describe, expect, it } from 'vitest';
import type { Stage } from '../../model/types';
import { stage, trip, TRIP_ID } from '../../test/fixtures';
import { CommandStack, edits } from '../commands';
import { TripStore } from '../store';
import type { OutRow, Row } from './rows';
import { SyncEngine, SyncError, type Conflict, type SyncApi, type SyncStatus } from './sync';

/** In-memory stand-in for the entities table: stamps rows and broadcasts them like realtime. */
class FakeServer {
  rows = new Map<string, Row>();
  clock = 0;
  listeners: ((row: Row) => void)[] = [];
  down = false;

  api(userId: string): SyncApi & { pushes: number } {
    const server = this;
    return {
      pushes: 0,
      async pull(tripId, since) {
        if (server.down) throw new SyncError('offline', 'down');
        return [...server.rows.values()]
          .filter((r) => r.trip_id === tripId && (!since || r.updated_at >= since))
          .sort((a, b) => (a.updated_at < b.updated_at ? -1 : 1));
      },
      async fetch(ids) {
        return ids.map((id) => server.rows.get(id)!).filter(Boolean);
      },
      async push(rows: OutRow[]) {
        if (server.down) throw new SyncError('offline', 'down');
        this.pushes++;
        const stored = rows.map((r) => {
          const row: Row = { ...r, updated_at: new Date(Date.UTC(2027, 0, 1, 0, 0, ++server.clock)).toISOString(), updated_by: userId };
          server.rows.set(r.id, row);
          return row;
        });
        for (const row of stored) for (const l of server.listeners) l(row);
        return stored;
      },
    };
  }
}

interface Client {
  store: TripStore;
  commands: CommandStack;
  engine: SyncEngine;
  conflicts: Conflict[];
  statuses: SyncStatus[];
  outbox: string[];
  api: ReturnType<FakeServer['api']>;
}

const engines: SyncEngine[] = [];

function client(server: FakeServer, userId: string, opts: { realtime?: boolean } = {}): Client {
  const store = new TripStore();
  const commands = new CommandStack(store, () => userId);
  const conflicts: Conflict[] = [];
  const statuses: SyncStatus[] = [];
  let cursor: string | null = null;
  const c: Client = { store, commands, conflicts, statuses, outbox: [], api: server.api(userId) } as unknown as Client;
  c.engine = new SyncEngine(store, c.api, {
    tripId: TRIP_ID,
    isMine: (id) => id === userId,
    outbox: { load: () => c.outbox, save: (ids) => (c.outbox = ids) },
    cursor: { load: () => cursor, save: (v) => (cursor = v) },
    onConflict: (x) => conflicts.push(x),
    onStatus: (s) => statuses.push(s),
    debounceMs: 60_000,
    backoffMs: [60_000],
  });
  engines.push(c.engine);
  store.onChange(({ ids, origin }) => {
    if (origin === 'local') c.engine.localChanged(ids);
  });
  if (opts.realtime !== false) server.listeners.push((row) => void c.engine.receive(row));
  return c;
}

const rename = (c: Client, id: string, name: string) =>
  c.commands.run({ label: 'rename', changes: [edits.update<Stage>(c.store, id, { name })] });

afterEach(() => {
  engines.splice(0).forEach((e) => e.stop());
});

describe('SyncEngine', () => {
  it('uploads local edits and delivers them to other clients', async () => {
    const server = new FakeServer();
    const a = client(server, 'A');
    const b = client(server, 'B', { realtime: false });
    a.commands.run({ label: 'add', changes: [edits.create(trip()), edits.create(stage('s1', 'V'))] });
    expect(a.outbox.sort()).toEqual(['s1', TRIP_ID].sort());

    await a.engine.flush();
    expect(server.rows.size).toBe(2);
    expect(a.outbox).toEqual([]);
    expect(a.statuses.at(-1)).toBe('synced');
    expect(a.store.get('s1')!.updatedBy).toBe('A');

    await b.engine.pull();
    expect(b.store.get('s1', 'stage')!.name).toBe('s1');
    expect(b.conflicts).toEqual([]);
  });

  it('applies realtime changes and ignores its own echo', async () => {
    const server = new FakeServer();
    const a = client(server, 'A');
    const b = client(server, 'B');
    a.commands.run({ label: 'add', changes: [edits.create(stage('s1', 'V'))] });
    let changes = 0;
    a.store.onChange(() => changes++);
    await a.engine.flush();
    await Promise.resolve();
    expect(b.store.get('s1')).toBeDefined();
    expect(a.conflicts).toEqual([]);
    expect(b.conflicts).toEqual([]);
    expect(changes).toBe(1);
  });

  it('reports when someone overwrites a recent edit', async () => {
    const server = new FakeServer();
    const a = client(server, 'A');
    const b = client(server, 'B');
    a.commands.run({ label: 'add', changes: [edits.create(stage('s1', 'V'))] });
    await a.engine.flush();
    rename(a, 's1', 'Mine');
    await a.engine.flush();
    rename(b, 's1', 'Theirs');
    await b.engine.flush();
    await Promise.resolve();
    expect(a.store.get('s1', 'stage')!.name).toBe('Theirs');
    expect(a.conflicts).toHaveLength(1);
    expect(a.conflicts[0]!.kind).toBe('overwritten');
    expect((a.conflicts[0]!.mine as Stage).name).toBe('Mine');
  });

  it('keeps an unsent local edit over an incoming change, and says so', async () => {
    const server = new FakeServer();
    const a = client(server, 'A');
    const b = client(server, 'B');
    a.commands.run({ label: 'add', changes: [edits.create(stage('s1', 'V'))] });
    await a.engine.flush();
    rename(a, 's1', 'Mine');
    rename(b, 's1', 'Theirs');
    await b.engine.flush();
    await Promise.resolve();
    expect(a.store.get('s1', 'stage')!.name).toBe('Mine');
    expect(a.conflicts.map((c) => c.kind)).toEqual(['overwrote']);

    await a.engine.flush();
    await Promise.resolve();
    expect(server.rows.get('s1')!.data.name).toBe('Mine');
    expect(b.store.get('s1', 'stage')!.name).toBe('Mine');
    expect(b.conflicts.map((c) => c.kind)).toEqual(['overwritten']);
  });

  it('keeps the outbox when offline and sends it later', async () => {
    const server = new FakeServer();
    const a = client(server, 'A');
    server.down = true;
    a.commands.run({ label: 'add', changes: [edits.create(stage('s1', 'V'))] });
    await a.engine.flush();
    expect(a.statuses.at(-1)).toBe('offline');
    expect(a.outbox).toEqual(['s1']);

    server.down = false;
    await a.engine.flush();
    expect(a.outbox).toEqual([]);
    expect(server.rows.has('s1')).toBe(true);
  });

  it('keeps an entity queued if it changes while being sent', async () => {
    const server = new FakeServer();
    const a = client(server, 'A');
    a.commands.run({ label: 'add', changes: [edits.create(stage('s1', 'V'))] });
    const sending = a.engine.flush();
    rename(a, 's1', 'Later');
    await sending;
    expect(a.outbox).toEqual(['s1']);
    await a.engine.flush();
    expect(server.rows.get('s1')!.data.name).toBe('Later');
  });

  it('fetches rows that realtime delivered without their data', async () => {
    const server = new FakeServer();
    const a = client(server, 'A');
    const b = client(server, 'B', { realtime: false });
    a.commands.run({ label: 'add', changes: [edits.create(stage('s1', 'V'))] });
    await a.engine.flush();
    const { data: _drop, ...partial } = server.rows.get('s1')!;
    await b.engine.receive(partial);
    expect(b.store.get('s1', 'stage')!.name).toBe('s1');
  });

  it('pulls only what changed since the last sync', async () => {
    const server = new FakeServer();
    const a = client(server, 'A');
    const b = client(server, 'B', { realtime: false });
    a.commands.run({ label: 'add', changes: [edits.create(stage('s1', 'V')), edits.create(stage('s2', 'X'))] });
    await a.engine.flush();
    await b.engine.pull();
    rename(a, 's2', 'Renamed');
    await a.engine.flush();
    let applied: string[] = [];
    b.store.onChange(({ ids }) => (applied = ids));
    await b.engine.pull();
    expect(applied).toEqual(['s2']);
  });
});

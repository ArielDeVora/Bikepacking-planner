import type { RealtimeChannel, Session, SupabaseClient } from '@supabase/supabase-js';
import { get, writable, type Readable } from 'svelte/store';
import { CLOUD, cloudConfigured } from '../../config/cloud';
import { STAGE_COLORS } from '../../config/modes';
import type { Entity, Trip } from '../../model/types';
import type { EventBus, Events } from '../bus';
import type { Settings } from '../settings';
import type { TripStore } from '../store';
import { supabaseSyncApi, toSyncError } from './api';
import { supabaseHistoryApi } from './history-api';
import type { RemoteHistory } from '../history/log';
import type { Row } from './rows';
import { SyncEngine, type Conflict, type SyncStatus } from './sync';

declare module '../bus' {
  interface Events {
    'cloud:conflict': Conflict;
  }
}

/**
 * `off`: no Supabase project configured. `signedOut`: configured, nobody signed in.
 * `local`: signed in, but the open trip isn't shared. Otherwise the sync status of the open trip.
 */
export type CloudStatus = 'off' | 'starting' | 'signedOut' | 'local' | SyncStatus;

export interface Profile {
  id: string;
  name: string;
  color: string;
}

export interface Member extends Profile {
  role: 'owner' | 'editor';
}

export interface RemoteTrip {
  id: string;
  name: string;
  role: 'owner' | 'editor';
}

export interface CloudDeps {
  store: TripStore;
  bus: EventBus<Events>;
  settings: Settings;
  user: { id: string };
  localUserId: string;
  tripId: () => string;
  /** Reloads the app on another trip. */
  openTrip: (id: string) => void;
}

const INVITE_PARAM = 'invite';

export function defaultColor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return STAGE_COLORS[Math.abs(h) % STAGE_COLORS.length]!;
}

/** Signed-in state, sharing and sync for the open trip. Loads supabase-js only when configured. */
export function createCloud(deps: CloudDeps) {
  const { store, bus, settings, user } = deps;
  const status = writable<CloudStatus>(cloudConfigured ? 'starting' : 'off');
  const account = writable<{ id: string; email: string } | null>(null);
  const profile = writable<Profile | null>(null);
  const members = writable<Member[]>([]);
  const online = writable<string[]>([]);
  const trips = writable<RemoteTrip[]>([]);
  const shared = writable(false);
  const role = writable<'owner' | 'editor' | null>(null);
  const lastError = writable<string | null>(null);

  let client: SupabaseClient | null = null;
  let engine: SyncEngine | null = null;
  let channel: RealtimeChannel | null = null;
  let subscribedOnce = false;

  const myIds = new Set<string>([deps.localUserId, ...settings.get<string[]>('myIds', [])]);
  const isMine = (id: string) => myIds.has(id);

  const sharedTrips = () => settings.get<string[]>('sharedTrips', []);
  const markShared = (id: string, on: boolean) => {
    const set = new Set(sharedTrips());
    if (on) set.add(id);
    else set.delete(id);
    settings.set('sharedTrips', [...set]);
  };
  const isSharedLocally = () => sharedTrips().includes(deps.tripId());

  const outboxKey = () => `outbox:${deps.tripId()}`;
  const cursorKey = () => `cursor:${deps.tripId()}`;

  // Edits made while signed out or before sync starts are queued for later.
  store.onChange(({ ids, origin }) => {
    if (origin !== 'local') return;
    if (engine) engine.localChanged(ids);
    else if (isSharedLocally()) settings.set(outboxKey(), [...new Set([...settings.get<string[]>(outboxKey(), []), ...ids])]);
  });

  // Invite links: remember the token across the sign-in redirect.
  const params = new URLSearchParams(location.search);
  const inviteFromUrl = params.get(INVITE_PARAM);
  if (inviteFromUrl) {
    settings.set('pendingInvite', inviteFromUrl);
    params.delete(INVITE_PARAM);
    const query = params.toString();
    history.replaceState(null, '', location.pathname + (query ? `?${query}` : '') + location.hash);
  }

  async function start(): Promise<void> {
    if (!cloudConfigured) return;
    try {
      const { createClient } = await import('@supabase/supabase-js');
      client = createClient(CLOUD.url, CLOUD.key, {
        auth: { flowType: 'implicit', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
      const { data } = await client.auth.getSession();
      await onSession(data.session);
      client.auth.onAuthStateChange((_event, session) => {
        if ((session?.user.id ?? null) !== (get(account)?.id ?? null)) void onSession(session);
      });
    } catch (err) {
      console.error(err);
      lastError.set(err instanceof Error ? err.message : String(err));
      status.set('offline');
    }
  }

  async function onSession(session: Session | null): Promise<void> {
    stopSync();
    if (!session) {
      account.set(null);
      profile.set(null);
      user.id = deps.localUserId;
      status.set('signedOut');
      return;
    }
    const id = session.user.id;
    account.set({ id, email: session.user.email ?? '' });
    user.id = id;
    if (!myIds.has(id)) {
      myIds.add(id);
      settings.set('myIds', [...myIds].filter((x) => x !== deps.localUserId));
    }
    status.set('local');
    try {
      await loadProfile(id, session.user.email ?? '');
      if (await acceptPendingInvite()) return;
      await refreshTrips();
      const mine = get(trips).find((tr) => tr.id === deps.tripId());
      if (mine) {
        markShared(mine.id, true);
        role.set(mine.role);
        startSync();
      } else if (isSharedLocally()) {
        // Removed from the trip, or it was deleted: keep the local copy as a local trip.
        markShared(deps.tripId(), false);
      }
    } catch (err) {
      console.error(err);
      lastError.set(err instanceof Error ? err.message : String(err));
      status.set('offline');
    }
  }

  async function loadProfile(id: string, email: string): Promise<void> {
    const { data, error } = await client!.from('profiles').select('id, name, color').eq('id', id).maybeSingle();
    if (error) throw toSyncError(error);
    if (data) {
      profile.set(data as Profile);
      return;
    }
    const fresh: Profile = { id, name: email.split('@')[0] ?? '', color: defaultColor(id) };
    const res = await client!.from('profiles').insert(fresh);
    if (res.error) throw toSyncError(res.error);
    profile.set(fresh);
  }

  async function saveProfile(patch: Partial<Omit<Profile, 'id'>>): Promise<void> {
    const current = get(profile);
    if (!client || !current) return;
    const next = { ...current, ...patch };
    profile.set(next);
    members.update((list) => list.map((m) => (m.id === next.id ? { ...m, ...patch } : m)));
    const { error } = await client.from('profiles').update({ name: next.name, color: next.color }).eq('id', next.id);
    if (error) throw toSyncError(error);
    if (channel) await channel.track({ name: next.name, color: next.color });
  }

  async function acceptPendingInvite(): Promise<boolean> {
    const token = settings.get<string | null>('pendingInvite', null);
    if (!token) return false;
    settings.set('pendingInvite', null);
    const { data, error } = await client!.rpc('accept_invite', { invite_token: token });
    if (error) {
      lastError.set(error.message);
      return false;
    }
    const tripId = data as string;
    markShared(tripId, true);
    if (tripId !== deps.tripId()) {
      deps.openTrip(tripId);
      return true;
    }
    return false;
  }

  async function refreshTrips(): Promise<void> {
    const me = get(account)?.id;
    if (!client || !me) return;
    const { data: rows, error } = await client.from('trip_members').select('trip_id, role').eq('user_id', me);
    if (error) throw toSyncError(error);
    const ids = rows.map((r) => r.trip_id as string);
    let names = new Map<string, string>();
    if (ids.length) {
      const res = await client.from('entities').select('id, data').eq('type', 'trip').in('id', ids);
      if (res.error) throw toSyncError(res.error);
      names = new Map(res.data.map((r) => [r.id as string, ((r.data as Partial<Trip>).name ?? '') as string]));
    }
    for (const id of ids) markShared(id, true);
    trips.set(rows.map((r) => ({ id: r.trip_id as string, role: r.role as RemoteTrip['role'], name: names.get(r.trip_id as string) ?? '' })));
  }

  async function loadMembers(tripId: string): Promise<void> {
    if (!client) return;
    const { data: rows, error } = await client.from('trip_members').select('user_id, role').eq('trip_id', tripId);
    if (error) throw toSyncError(error);
    const ids = rows.map((r) => r.user_id as string);
    const { data: profiles, error: err2 } = await client.from('profiles').select('id, name, color').in('id', ids);
    if (err2) throw toSyncError(err2);
    const byId = new Map((profiles as Profile[]).map((p) => [p.id, p]));
    members.set(
      rows.map((r) => {
        const id = r.user_id as string;
        return { id, role: r.role as Member['role'], name: byId.get(id)?.name ?? '', color: byId.get(id)?.color ?? defaultColor(id) };
      }),
    );
  }

  function startSync(): void {
    if (!client || engine) return;
    const tripId = deps.tripId();
    shared.set(true);
    engine = new SyncEngine(store, supabaseSyncApi(client), {
      tripId,
      isMine,
      outbox: { load: () => settings.get<string[]>(outboxKey(), []), save: (ids) => settings.set(outboxKey(), ids) },
      cursor: { load: () => settings.get<string | null>(cursorKey(), null), save: (c) => settings.set(cursorKey(), c) },
      onConflict: (c) => bus.emit('cloud:conflict', c),
      onStatus: (s, err) => {
        status.set(s);
        if (err) lastError.set(err instanceof Error ? err.message : String(err));
        else if (s === 'synced') lastError.set(null);
      },
    });
    void engine.start();
    void loadMembers(tripId).catch((err) => console.warn(err));

    subscribedOnce = false;
    const me = get(account)!;
    channel = client
      .channel(`trip:${tripId}`, { config: { presence: { key: me.id } } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entities', filter: `trip_id=eq.${tripId}` }, (payload) => {
        const row = payload.new as Partial<Row> & { id?: string };
        if (row.id) void engine?.receive(row as Partial<Row> & { id: string });
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel?.presenceState() ?? {};
        online.set(Object.keys(state));
        // New faces may be new members.
        if (Object.keys(state).some((id) => !get(members).some((m) => m.id === id))) void loadMembers(tripId).catch(() => {});
      })
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') {
          const p = get(profile);
          void channel?.track({ name: p?.name ?? '', color: p?.color ?? '' });
          // Catch up on anything missed while the connection was down.
          if (subscribedOnce) void engine?.pull();
          subscribedOnce = true;
        }
      });
  }

  function stopSync(): void {
    engine?.stop();
    engine = null;
    if (channel && client) void client.removeChannel(channel);
    channel = null;
    shared.set(false);
    members.set([]);
    online.set([]);
  }

  const resume = () => {
    if (!engine) return;
    void engine.pull();
    void engine.flush();
  };
  window.addEventListener('online', resume);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') resume();
    else void engine?.flush();
  });

  return {
    configured: cloudConfigured,
    status: { subscribe: status.subscribe } as Readable<CloudStatus>,
    account: { subscribe: account.subscribe } as Readable<{ id: string; email: string } | null>,
    profile: { subscribe: profile.subscribe } as Readable<Profile | null>,
    members: { subscribe: members.subscribe } as Readable<Member[]>,
    online: { subscribe: online.subscribe } as Readable<string[]>,
    trips: { subscribe: trips.subscribe } as Readable<RemoteTrip[]>,
    shared: { subscribe: shared.subscribe } as Readable<boolean>,
    role: { subscribe: role.subscribe } as Readable<'owner' | 'editor' | null>,
    lastError: { subscribe: lastError.subscribe } as Readable<string | null>,
    isMine,
    start,
    saveProfile,
    refreshTrips,

    /** The server-side history of the open trip, when it is shared. */
    history(): RemoteHistory | null {
      return client && engine ? supabaseHistoryApi(client) : null;
    },

    /** Name and colour of a user, if they are a member of the open trip. */
    profileOf(id: string): Profile | undefined {
      const p = get(profile);
      if (p && isMine(id)) return p;
      return get(members).find((m) => m.id === id);
    },

    async signIn(email: string): Promise<void> {
      if (!client) throw new Error('Sharing is not configured');
      const invite = settings.get<string | null>('pendingInvite', null);
      const back = location.origin + location.pathname + (invite ? `?${INVITE_PARAM}=${invite}` : '');
      const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: back } });
      if (error) throw error;
    },

    /**
     * Signs in with the code from the sign-in email, instead of its link: for the planner added to
     * a phone's home screen, which the link (opening in the browser) can't sign in.
     */
    async verifyCode(email: string, code: string): Promise<void> {
      if (!client) throw new Error('Sharing is not configured');
      const { error } = await client.auth.verifyOtp({ email, token: code.replace(/\s/g, ''), type: 'email' });
      if (error) throw error;
    },

    async signOut(): Promise<void> {
      await engine?.flush();
      await client?.auth.signOut();
    },

    /** Uploads the open (local) trip and makes the current user its owner. */
    async shareTrip(): Promise<void> {
      if (!client || !get(account)) throw new Error('Not signed in');
      const tripId = deps.tripId();
      const { error } = await client.rpc('create_trip', { trip_id: tripId });
      if (error && error.code !== '23505') throw error;
      markShared(tripId, true);
      settings.set(outboxKey(), store.all().filter((e: Entity) => e.tripId === tripId).map((e) => e.id));
      role.set('owner');
      startSync();
      await refreshTrips();
    },

    /** A link that adds whoever opens it (and signs in) to the open trip. Valid for 14 days. */
    async createInvite(): Promise<string> {
      if (!client) throw new Error('Not signed in');
      const { data, error } = await client.from('invites').insert({ trip_id: deps.tripId() }).select('token').single();
      if (error) throw error;
      return `${location.origin}${location.pathname}?${INVITE_PARAM}=${(data as { token: string }).token}`;
    },

    hasPendingInvite: () => !!settings.get<string | null>('pendingInvite', null),
    isSharedLocally,

    /**
     * Follow links of the open trip. `canSuggest` is null where the server doesn't have
     * suggestions yet (migration 005 not run).
     */
    async followLinks(): Promise<{ token: string; createdAt: string; createdBy: string; canSuggest: boolean | null }[]> {
      if (!client) return [];
      type Row = { token: string; created_at: string; created_by: string; can_suggest?: boolean };
      const query = (columns: string) => client!.from('follow_links').select(columns).eq('trip_id', deps.tripId()).order('created_at');
      let res = await query('token, created_at, created_by, can_suggest');
      if (res.error && /can_suggest/.test(res.error.message)) res = await query('token, created_at, created_by');
      if (res.error) throw res.error;
      return (res.data as unknown as Row[]).map((r) => ({ token: r.token, createdAt: r.created_at, createdBy: r.created_by, canSuggest: r.can_suggest ?? null }));
    },

    /** Lets a link's followers suggest places, or stops it. */
    async setFollowSuggest(token: string, on: boolean): Promise<void> {
      if (!client) throw new Error('Not signed in');
      const { error } = await client.from('follow_links').update({ can_suggest: on }).eq('token', token);
      if (error) throw error;
    },

    /** A link anyone can open to see the trip, without an account or the right to change it. */
    async createFollowLink(): Promise<string> {
      if (!client) throw new Error('Not signed in');
      const { data, error } = await client.from('follow_links').insert({ trip_id: deps.tripId() }).select('token').single();
      if (error) throw error;
      return (data as { token: string }).token;
    },

    async deleteFollowLink(token: string): Promise<void> {
      if (!client) throw new Error('Not signed in');
      const { error } = await client.from('follow_links').delete().eq('token', token);
      if (error) throw error;
    },

    /** Read-only view through a follow link: shows the members' names and colours. */
    follow(list: Member[]): void {
      members.set(list);
      shared.set(true);
    },
  };
}

export type Cloud = ReturnType<typeof createCloud>;

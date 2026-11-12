import type { SupabaseClient } from '@supabase/supabase-js';
import { CLOUD, cloudConfigured } from '../../config/cloud';
import type { Entity } from '../../model/types';
import type { Member } from './cloud';
import { rowToEntity, type Row } from './rows';

export const FOLLOW_PARAM = 'follow';
const PAGE = 1000;

/** The follow-link token in the page's address, if any. */
export function followToken(): string | null {
  const token = new URLSearchParams(location.search).get(FOLLOW_PARAM);
  return token && /^[0-9a-f-]{36}$/i.test(token) ? token : null;
}

export function followUrl(token: string): string {
  return `${location.origin}${location.pathname}?${FOLLOW_PARAM}=${token}`;
}

/** Reads a trip through a follow link, without signing in. */
export async function createFollower(token: string) {
  if (!cloudConfigured) throw new Error('Sharing is not configured');
  const { createClient } = await import('@supabase/supabase-js');
  const client: SupabaseClient = createClient(CLOUD.url, CLOUD.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'bp-follow' },
  });
  let cursor: string | null = null;

  return {
    /** Items changed since the last call (all of them the first time). */
    async pull(): Promise<Entity[]> {
      const rows: Row[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await client.rpc('follow_trip', { link: token, since: cursor }).range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        rows.push(...(data as Row[]));
        if ((data as Row[]).length < PAGE) break;
      }
      for (const r of rows) if (!cursor || r.updated_at > cursor) cursor = r.updated_at;
      return rows.map(rowToEntity);
    },

    /** Whether the link lets its followers suggest places (false where the server can't tell). */
    async canSuggest(): Promise<boolean> {
      const { data, error } = await client.rpc('follow_link_info', { link: token });
      if (error) return false;
      return !!(data as { can_suggest: boolean }[])[0]?.can_suggest;
    },

    /** Adds a place to the trip, in this follower's own category. */
    async suggest(place: { id: string; name: string; lngLat: [number, number]; notes?: string }, who: Follower): Promise<void> {
      const { error } = await client.rpc('follow_suggest_place', {
        link: token,
        follower: who.id,
        follower_name: who.name,
        place_id: place.id,
        lng: place.lngLat[0],
        lat: place.lngLat[1],
        place_name: place.name,
        place_notes: place.notes ?? '',
      });
      if (error) throw new Error(error.message);
    },

    async members(): Promise<Member[]> {
      const { data, error } = await client.rpc('follow_members', { link: token });
      if (error) throw new Error(error.message);
      return data as Member[];
    },
  };
}

export type FollowClient = Awaited<ReturnType<typeof createFollower>>;

/** Someone following a trip, as their browser remembers them (no account). */
export interface Follower {
  id: string;
  name: string;
}

const FOLLOWER_KEY = 'bp-follower';

export function savedFollower(): Follower | null {
  try {
    const v = JSON.parse(localStorage.getItem(FOLLOWER_KEY) ?? 'null') as Follower | null;
    return v?.id && v.name ? v : null;
  } catch {
    return null;
  }
}

export function saveFollower(name: string): Follower {
  const f = { id: savedFollower()?.id ?? crypto.randomUUID(), name: name.trim() };
  try {
    localStorage.setItem(FOLLOWER_KEY, JSON.stringify(f));
  } catch {
    /* private browsing: remembered for this visit only */
  }
  return f;
}

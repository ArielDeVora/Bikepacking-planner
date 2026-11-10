import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { Commit } from '../history/diff';
import { HistoryMissing, type RemoteHistory } from '../history/log';

interface ChangeRow {
  id: string;
  trip_id: string;
  user_id: string | null;
  at: string;
  label: string;
  kind: Commit['kind'];
  restored_to: string | null;
  changes: Commit['changes'];
}

const missing = (err: PostgrestError) => err.code === '42P01' || err.code === 'PGRST205' || /could not find the table/i.test(err.message);

function check(err: PostgrestError | null): void {
  if (!err) return;
  if (missing(err)) throw new HistoryMissing(err.message);
  throw new Error(err.message);
}

/** History in the `changes` table (supabase/migrations/002_history.sql). */
export function supabaseHistoryApi(client: SupabaseClient): RemoteHistory {
  return {
    async insert(commits) {
      const rows = commits.map((c) => ({
        id: c.id,
        trip_id: c.tripId,
        label: c.label,
        kind: c.kind,
        restored_to: c.restoredTo ?? null,
        changes: c.changes,
      }));
      const { error } = await client.from('changes').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
      check(error);
    },

    async list(tripId, before, limit) {
      let q = client.from('changes').select('*').eq('trip_id', tripId);
      if (before !== null) q = q.lt('at', new Date(before).toISOString());
      const { data, error } = await q.order('at', { ascending: false }).limit(limit);
      check(error);
      return (data as ChangeRow[]).map((r) => ({
        id: r.id,
        tripId: r.trip_id,
        userId: r.user_id ?? '',
        at: Date.parse(r.at),
        label: r.label,
        kind: r.kind,
        ...(r.restored_to ? { restoredTo: r.restored_to } : {}),
        changes: r.changes,
      }));
    },

    async prune(tripId, keepDays) {
      const { data, error } = await client.rpc('prune_changes', { p_trip: tripId, p_keep_days: keepDays });
      check(error);
      return Number(data) || 0;
    },
  };
}

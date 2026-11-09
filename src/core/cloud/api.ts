import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { OutRow, Row } from './rows';
import { SyncError, type SyncApi } from './sync';

const PAGE = 1000;

export function toSyncError(err: PostgrestError | Error | null | undefined): SyncError {
  if (!err) return new SyncError('server', 'Unknown error');
  const code = 'code' in err ? err.code : '';
  if (code === '42501') return new SyncError('denied', err.message);
  if (!code || /fetch|network|load failed/i.test(err.message)) return new SyncError('offline', err.message);
  return new SyncError('server', err.message);
}

export function supabaseSyncApi(client: SupabaseClient): SyncApi {
  return {
    async pull(tripId, since) {
      const out: Row[] = [];
      for (let from = 0; ; from += PAGE) {
        let q = client.from('entities').select('*').eq('trip_id', tripId);
        if (since) q = q.gte('updated_at', since);
        const { data, error } = await q.order('updated_at').order('id').range(from, from + PAGE - 1);
        if (error) throw toSyncError(error);
        out.push(...(data as Row[]));
        if (data.length < PAGE) return out;
      }
    },

    async fetch(ids) {
      const { data, error } = await client.from('entities').select('*').in('id', ids);
      if (error) throw toSyncError(error);
      return data as Row[];
    },

    async push(rows: OutRow[]) {
      const { data, error } = await client.from('entities').upsert(rows).select('id, trip_id, type, deleted, updated_at, updated_by');
      if (error) throw toSyncError(error);
      return (data as Omit<Row, 'data'>[]).map((r) => ({ ...r, data: {} }));
    },
  };
}

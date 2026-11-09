import type { Entity } from '../../model/types';

/** A row of the `entities` table. */
export interface Row {
  id: string;
  trip_id: string;
  type: string;
  data: Record<string, unknown>;
  deleted: boolean;
  updated_at: string;
  updated_by: string | null;
}

/** What the client sends; the server sets `updated_at` and `updated_by`. */
export type OutRow = Omit<Row, 'updated_at' | 'updated_by'>;

export function entityToRow(e: Entity): OutRow {
  const { id, type, tripId, deleted, updatedAt: _a, updatedBy: _b, ...data } = e;
  return { id, trip_id: tripId, type, deleted, data: JSON.parse(JSON.stringify(data)) as Record<string, unknown> };
}

export function rowToEntity(row: Row): Entity {
  return {
    ...row.data,
    id: row.id,
    type: row.type,
    tripId: row.trip_id,
    deleted: row.deleted,
    updatedAt: Date.parse(row.updated_at),
    updatedBy: row.updated_by ?? '',
  } as Entity;
}

/** JSON with sorted keys, so that values compare equal whatever order Postgres stored them in. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

/** Same content, ignoring who changed it and when. */
export function sameContent(a: Entity, b: Entity): boolean {
  const ra = entityToRow(a);
  const rb = entityToRow(b);
  return ra.deleted === rb.deleted && ra.type === rb.type && ra.trip_id === rb.trip_id && canonical(ra.data) === canonical(rb.data);
}

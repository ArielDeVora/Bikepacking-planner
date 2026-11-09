import { newId } from '../../model/ids';
import type { Entity, Trip } from '../../model/types';

const FORMAT = 'bikepacking-planner-backup';

export interface Backup {
  format: typeof FORMAT;
  version: 1;
  exportedAt: string;
  tripName: string;
  entities: Entity[];
}

export function isBackup(data: unknown): data is Backup {
  const b = data as Partial<Backup> | null;
  return !!b && b.format === FORMAT && Array.isArray(b.entities) && b.entities.some((e) => e?.type === 'trip');
}

export function makeBackup(entities: Entity[], now = new Date()): Backup {
  const live = entities.filter((e) => !e.deleted);
  const trip = live.find((e): e is Trip => e.type === 'trip');
  return { format: FORMAT, version: 1, exportedAt: now.toISOString(), tripName: trip?.name ?? '', entities: live };
}

/**
 * The backup's entities with fresh ids (references between them follow), so it can be restored
 * as a new trip next to the original.
 */
export function restoreBackup(backup: Backup, makeId: () => string = newId): Entity[] {
  const ids = new Map<string, string>();
  for (const e of backup.entities) ids.set(e.id, makeId());
  const map = (id: string) => ids.get(id) ?? id;
  const trip = backup.entities.find((e) => e.type === 'trip')!;
  const tripId = map(trip.id);
  return backup.entities.map((e) => {
    const copy = { ...e, id: map(e.id), tripId } as Entity;
    if (copy.type === 'segment') copy.stageId = map(copy.stageId);
    if (copy.type === 'comment') copy.targetId = map(copy.targetId);
    return copy;
  });
}

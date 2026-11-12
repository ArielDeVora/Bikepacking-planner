import type { BaseEntity } from './types';

/** Who last changed the entity by hand (the last writer for entities saved before this was kept). */
export const editedBy = (e: BaseEntity): string => e.editedBy ?? e.updatedBy;

/** When it was last changed by hand. */
export const editedAt = (e: BaseEntity): number => e.editedAt ?? e.updatedAt;

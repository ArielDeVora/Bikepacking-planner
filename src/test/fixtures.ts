import type { Stage, Trip } from '../model/types';

export const TRIP_ID = 'trip-1';

export function trip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: TRIP_ID,
    type: 'trip',
    tripId: TRIP_ID,
    name: 'Test trip',
    ownerId: 'u1',
    updatedAt: 0,
    updatedBy: 'u1',
    deleted: false,
    ...overrides,
  };
}

export function stage(id: string, order: string, overrides: Partial<Stage> = {}): Stage {
  return {
    id,
    type: 'stage',
    tripId: TRIP_ID,
    order,
    name: id,
    notes: '',
    updatedAt: 0,
    updatedBy: 'u1',
    deleted: false,
    ...overrides,
  };
}

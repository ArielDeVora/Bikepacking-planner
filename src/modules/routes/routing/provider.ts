import type { Coord } from '../../../lib/geo/polyline';
import type { LngLat, TravelMode } from '../../../model/types';

export interface RouteRequest {
  from: LngLat;
  to: LngLat;
  profile: string;
  /** Polygons (outer rings) the route must not enter. */
  nogos: LngLat[][];
}

export interface RoutingProfile {
  id: string;
  label: string;
}

/** A routing service. Swap BRouter for another service by implementing this interface. */
export interface RoutingProvider {
  id: string;
  label: string;
  /** Profiles offered for each travel mode; the first one is the default. */
  profiles: Partial<Record<TravelMode, RoutingProfile[]>>;
  route(req: RouteRequest, signal: AbortSignal): Promise<Coord[]>;
}

export type RoutingErrorKind = 'rateLimit' | 'noRoute' | 'network' | 'timeout' | 'server';

export class RoutingError extends Error {
  constructor(
    readonly kind: RoutingErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'RoutingError';
  }
}

export function defaultProfile(provider: RoutingProvider, mode: TravelMode): string | undefined {
  return provider.profiles[mode]?.[0]?.id;
}

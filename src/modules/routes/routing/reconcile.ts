import { edits, type CommandStack } from '../../../core/commands';
import type { TripStore } from '../../../core/store';
import { encodeLine } from '../../../lib/geo/polyline';
import { findPendingLeg, replaceLeg } from '../../../model/segment';
import type { Leg, LngLat, Segment } from '../../../model/types';
import { defaultProfile, RoutingError } from './provider';
import { RoutingCancelled, type RoutingQueue } from './queue';

export interface Reconciler {
  /** Requests routes for the pending legs of these segments. */
  scan(segments: Segment[]): void;
  profileOf(seg: Pick<Segment, 'mode' | 'profile'>): string | undefined;
}

/**
 * Routes pending legs and writes the result into the segment. Results are written with
 * `commands.patch`, so they don't add undo steps: undoing back to a pending leg routes it again
 * (usually straight from the cache).
 */
export function createReconciler(
  store: TripStore,
  commands: CommandStack,
  queue: RoutingQueue,
  onError: (err: RoutingError) => void,
  /**
   * Whether this client should route the segment's pending legs now. Lets the author route their
   * own edits, so other clients don't send duplicate requests (or stamp the segment as theirs).
   */
  shouldRoute: (seg: Segment) => boolean = () => true,
): Reconciler {
  const provider = queue.provider;

  const profileOf = (seg: Pick<Segment, 'mode' | 'profile'>) => seg.profile ?? defaultProfile(provider, seg.mode);

  const nogos = (): LngLat[][] =>
    store
      .list('zone', (z) => z.kind === 'avoid' && z.severity === 'nogo' && !!z.polygon[0]?.length)
      .map((z) => z.polygon[0]!);

  function write(id: string, from: LngLat, to: LngLat, profile: string, leg: Leg): void {
    const seg = store.get(id, 'segment');
    if (!seg || seg.geomType !== 'routed' || (profileOf(seg) ?? '') !== profile) return;
    const i = findPendingLeg(seg, from, to);
    if (i < 0) return;
    commands.patch([edits.update<Segment>(store, id, replaceLeg(seg, i, leg))]);
  }

  function scan(segments: Segment[]): void {
    for (const seg of segments) {
      if (seg.geomType !== 'routed' || seg.deleted || !shouldRoute(seg)) continue;
      const profile = profileOf(seg);
      seg.legs.forEach((leg, i) => {
        if (leg.status !== 'pending') return;
        const from = seg.anchors[i]!.lngLat;
        const to = seg.anchors[i + 1]!.lngLat;
        if (!profile) {
          write(seg.id, from, to, '', { line: leg.line, status: 'failed' });
          return;
        }
        const stillNeeded = () => {
          const s = store.get(seg.id, 'segment');
          return !!s && s.geomType === 'routed' && profileOf(s) === profile && findPendingLeg(s, from, to) >= 0;
        };
        queue.request({ from, to, profile, nogos: nogos() }, stillNeeded).then(
          (coords) => write(seg.id, from, to, profile, { line: encodeLine(coords) }),
          (err: unknown) => {
            if (err instanceof RoutingCancelled) return;
            write(seg.id, from, to, profile, { line: leg.line, status: 'failed' });
            onError(err instanceof RoutingError ? err : new RoutingError('server', String(err)));
          },
        );
      });
    }
  }

  return { scan, profileOf };
}

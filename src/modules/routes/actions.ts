import { MODES, STAGE_COLORS } from '../../config/modes';
import { edits, type Change, type Command } from '../../core/commands';
import type { TripStore } from '../../core/store';
import { newId } from '../../model/ids';
import { compareOrder, keyBetween } from '../../model/order';
import { insertAnchor, rebuildLegs, retryFailedLegs } from '../../model/segment';
import type { LngLat, Segment, Stage, TravelMode } from '../../model/types';

export const sortedSegments = (store: TripStore, stageId: string): Segment[] =>
  store.list('segment', (s) => s.stageId === stageId).sort(compareOrder);

export interface NewSegment {
  tripId: string;
  /** Stage to add to; the last stage (or a new one, if there are none) when unset. */
  stageId?: string;
  mode: TravelMode;
  points: LngLat[];
  label: string;
  segmentName: (n: number) => string;
  stageName: string;
}

export function createSegment(store: TripStore, opts: NewSegment): { command: Command; segmentId: string } {
  const changes: Change[] = [];
  let stage = opts.stageId ? store.get(opts.stageId, 'stage') : undefined;
  if (!stage) stage = store.list('stage').sort(compareOrder).at(-1);
  let stageId = stage?.id;
  if (!stageId) {
    stageId = newId();
    changes.push(
      edits.create<Stage>({
        id: stageId,
        type: 'stage',
        tripId: opts.tripId,
        order: keyBetween(null, null),
        name: opts.stageName,
        notes: '',
        color: STAGE_COLORS[0],
      }),
    );
  }

  const siblings = sortedSegments(store, stageId);
  const geomType = MODES[opts.mode].geomType;
  let geometry = { anchors: [] as Segment['anchors'], legs: [] as Segment['legs'] };
  for (const p of opts.points) geometry = insertAnchor({ ...geometry, geomType }, geometry.anchors.length, p);

  const segmentId = newId();
  changes.push(
    edits.create<Segment>({
      id: segmentId,
      type: 'segment',
      tripId: opts.tripId,
      stageId,
      order: keyBetween(siblings.at(-1)?.order ?? null, null),
      name: opts.segmentName(siblings.length + 1),
      notes: '',
      mode: opts.mode,
      geomType,
      stats: { lengthM: 0, ascentM: 0, descentM: 0 },
      ...geometry,
    }),
  );
  return { command: { label: opts.label, changes }, segmentId };
}

/**
 * Switches travel mode. The segment takes the new mode's geometry type and default profile,
 * and its legs are redrawn if either changes what they look like.
 */
export function changeMode(
  store: TripStore,
  seg: Segment,
  mode: TravelMode,
  profileOf: (s: Pick<Segment, 'mode' | 'profile'>) => string | undefined,
  label: string,
): Command | null {
  if (seg.mode === mode) return null;
  const geomType = MODES[mode].geomType;
  const profileChanged = profileOf(seg) !== profileOf({ mode, profile: undefined });
  const redraw = geomType !== seg.geomType || (geomType === 'routed' && profileChanged);
  return {
    label,
    changes: [
      edits.update<Segment>(store, seg.id, {
        mode,
        geomType,
        profile: undefined,
        ...(redraw ? rebuildLegs(seg, geomType) : {}),
      }),
    ],
  };
}

export function setSnap(store: TripStore, seg: Segment, snap: boolean, label: string): Command | null {
  const geomType = snap ? 'routed' : 'manual';
  if (seg.geomType === geomType) return null;
  return { label, changes: [edits.update<Segment>(store, seg.id, { geomType, ...rebuildLegs(seg, geomType) })] };
}

export function setProfile(store: TripStore, seg: Segment, profile: string | undefined, label: string): Command {
  const patch: Partial<Segment> = { profile };
  if (seg.geomType === 'routed') Object.assign(patch, rebuildLegs(seg, 'routed'));
  return { label, changes: [edits.update<Segment>(store, seg.id, patch)] };
}

export function retryChange(store: TripStore, seg: Segment): Change {
  return edits.update<Segment>(store, seg.id, retryFailedLegs(seg));
}

import { MODES } from '../../config/modes';
import { edits, type Change, type Command } from '../../core/commands';
import type { TripStore } from '../../core/store';
import { newId } from '../../model/ids';
import { addStageCommand } from '../../lib/route-edits';
import { groupSegments, routeStages, sortedStages, stageChildren, stageSegments } from '../../lib/tree';
import { keyBetween } from '../../model/order';
import { insertAnchor, rebuildLegs, retryFailedLegs } from '../../model/segment';
import type { LngLat, Segment, TravelMode } from '../../model/types';

export interface NewSegment {
  tripId: string;
  /** Stage to add to; the last stage (or a new one, if there are none) when unset. */
  stageId?: string;
  /** Group of that stage to add to, at its end. */
  groupId?: string;
  /** With no stage given: the route whose last stage to add to (or a new stage in it). */
  routeId?: string;
  mode: TravelMode;
  /** Routing profile; the mode's default when unset. */
  profile?: string;
  points: LngLat[];
  label: string;
  segmentName: (n: number) => string;
  stageName: string;
}

export function createSegment(store: TripStore, opts: NewSegment): { command: Command; segmentId: string } {
  const changes: Change[] = [];
  const route = !opts.stageId && opts.routeId ? store.get(opts.routeId, 'route') : undefined;
  let stage = opts.stageId ? store.get(opts.stageId, 'stage') : undefined;
  if (!stage) stage = route ? routeStages(store, route.id).at(-1) : sortedStages(store).at(-1);
  let stageId = stage?.id;
  if (!stageId) {
    const created = addStageCommand(store, opts.tripId, opts.stageName, opts.label, route?.id).changes[0]!;
    stageId = created.id;
    changes.push(created);
  }

  const group = opts.groupId ? store.get(opts.groupId, 'group') : undefined;
  const groupId = group?.stageId === stageId ? group.id : undefined;
  const siblings = groupId ? groupSegments(store, groupId) : stageChildren(store, stageId);
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
      ...(groupId ? { groupId } : {}),
      order: keyBetween(siblings.at(-1)?.order ?? null, null),
      name: opts.segmentName(stageSegments(store, stageId).length + 1),
      notes: '',
      mode: opts.mode,
      ...(opts.profile ? { profile: opts.profile } : {}),
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
  if (seg.geomType === 'imported') return { label, changes: [edits.update<Segment>(store, seg.id, { mode, profile: undefined })] };
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

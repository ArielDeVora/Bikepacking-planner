import type { TripStore } from '../core/store';
import { compareOrder } from '../model/order';
import type { Group, Route, Segment, Stage } from '../model/types';

/**
 * The order of the trip: its children (routes and stages that aren't in a route, in one order),
 * each route's stages, then each stage's children (groups and ungrouped segments, in one order),
 * then each group's segments. Everything that lists stages or segments "in trip order" uses
 * these helpers.
 */

export type TripChild = Route | Stage;
export type StageChild = Group | Segment;

/** Whether the stage sits in an existing route (a stage whose route is gone counts as loose). */
export const inRoute = (store: TripStore, stage: Stage): boolean => !!stage.routeId && !!store.get(stage.routeId, 'route');

/** The trip's routes and the stages that aren't in a route, in order. */
export function tripChildren(store: TripStore): TripChild[] {
  const routes = store.list('route');
  const loose = store.list('stage', (s) => !inRoute(store, s));
  return [...routes, ...loose].sort(compareOrder);
}

export const routeStages = (store: TripStore, routeId: string): Stage[] =>
  store.list('stage', (s) => s.routeId === routeId).sort(compareOrder);

export const sortedRoutes = (store: TripStore): Route[] => store.list('route').sort(compareOrder);

/** All stages, in display order (routes expanded). */
export function sortedStages(store: TripStore): Stage[] {
  return tripChildren(store).flatMap((c) => (c.type === 'route' ? routeStages(store, c.id) : [c]));
}

/** The list a stage is ordered in: its route's stages, or the trip's children. */
export function stageSiblings(store: TripStore, stage: Stage): TripChild[] {
  return inRoute(store, stage) ? routeStages(store, stage.routeId!) : tripChildren(store);
}

/** Whether the segment sits in an existing group (a segment whose group is gone counts as ungrouped). */
export const inGroup = (store: TripStore, seg: Segment): boolean => !!seg.groupId && !!store.get(seg.groupId, 'group');

/** A stage's groups and ungrouped segments, in order. */
export function stageChildren(store: TripStore, stageId: string): StageChild[] {
  const groups = store.list('group', (g) => g.stageId === stageId);
  const loose = store.list('segment', (s) => s.stageId === stageId && !inGroup(store, s));
  return [...groups, ...loose].sort(compareOrder);
}

export const groupSegments = (store: TripStore, groupId: string): Segment[] =>
  store.list('segment', (s) => s.groupId === groupId).sort(compareOrder);

/** All segments of a stage, in display order (groups expanded). */
export function stageSegments(store: TripStore, stageId: string): Segment[] {
  return stageChildren(store, stageId).flatMap((c) => (c.type === 'group' ? groupSegments(store, c.id) : [c]));
}

export function routeSegments(store: TripStore, routeId: string): Segment[] {
  return routeStages(store, routeId).flatMap((st) => stageSegments(store, st.id));
}

/** All segments of the trip, in order. */
export function tripSegments(store: TripStore): Segment[] {
  return sortedStages(store).flatMap((st) => stageSegments(store, st.id));
}

/** The segments of a route, stage or group (or the segment itself). */
export function segmentsOf(store: TripStore, id: string): Segment[] {
  const e = store.get(id);
  if (e?.type === 'route') return routeSegments(store, id);
  if (e?.type === 'stage') return stageSegments(store, id);
  if (e?.type === 'group') return groupSegments(store, id);
  return e?.type === 'segment' ? [e] : [];
}

/** The list a segment is ordered in: its group's segments, or its stage's children. */
export function siblingsOf(store: TripStore, seg: Segment): StageChild[] {
  return inGroup(store, seg) ? groupSegments(store, seg.groupId!) : stageChildren(store, seg.stageId);
}

/** The ids a segment's visibility depends on: itself, its group, stage and route. */
export function ancestorIds(store: TripStore, seg: Segment): string[] {
  const routeId = store.get(seg.stageId, 'stage')?.routeId;
  return [seg.id, seg.stageId, ...(seg.groupId ? [seg.groupId] : []), ...(routeId ? [routeId] : [])];
}

/** A stage's name, after its route's ("Rerouting › Day 3") when it's in one. */
export function stageLabel(store: TripStore, stage: Stage): string {
  const route = stage.routeId ? store.get(stage.routeId, 'route') : undefined;
  return route ? `${route.name} › ${stage.name}` : stage.name;
}

/** The route of the selected thing (a route, or the route of a stage, group or segment). */
export function routeOf(store: TripStore, id: string | undefined): Route | undefined {
  const e = id ? store.get(id) : undefined;
  if (!e) return undefined;
  if (e.type === 'route') return e;
  const stageId = e.type === 'stage' ? e.id : e.type === 'group' || e.type === 'segment' ? e.stageId : undefined;
  const routeId = stageId ? store.get(stageId, 'stage')?.routeId : undefined;
  return routeId ? store.get(routeId, 'route') : undefined;
}

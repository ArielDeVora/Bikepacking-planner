import { STAGE_COLORS } from '../config/modes';
import { edits, type Change, type Command } from '../core/commands';
import type { TripStore } from '../core/store';
import { copyGeometry } from '../model/edit-ops';
import { newId } from '../model/ids';
import { keyBetween } from '../model/order';
import type { Group, Route, Segment, Stage } from '../model/types';
import { inRoute, routeStages, sortedStages, tripChildren, type TripChild } from './tree';

/** Commands for routes (a level above stages) and for moving stages between routes. */

/** A new stage at the end of a route, or of the trip when no route is given. */
export function addStageCommand(store: TripStore, tripId: string, name: string, label: string, routeId?: string): Command {
  const route = routeId ? store.get(routeId, 'route') : undefined;
  const list: TripChild[] = route ? routeStages(store, route.id) : tripChildren(store);
  const count = store.list('stage').length;
  return {
    label,
    changes: [
      edits.create<Stage>({
        id: newId(),
        type: 'stage',
        tripId,
        ...(route ? { routeId: route.id } : {}),
        order: keyBetween(list.at(-1)?.order ?? null, null),
        name,
        notes: '',
        color: STAGE_COLORS[count % STAGE_COLORS.length],
      }),
    ],
  };
}

/** A new, empty route at the end of the trip. */
export function addRouteCommand(store: TripStore, tripId: string, name: string, label: string): Command {
  return {
    label,
    changes: [edits.create<Route>({ id: newId(), type: 'route', tripId, order: keyBetween(tripChildren(store).at(-1)?.order ?? null, null), name, notes: '' })],
  };
}

/**
 * Moves stages and routes, in this order, into a route (stages only) or directly into the trip:
 * before `beforeId`, or at the end when null.
 */
export function moveTopCommand(store: TripStore, ids: string[], routeId: string | undefined, beforeId: string | null, label: string): Command | null {
  const route = routeId ? store.get(routeId, 'route') : undefined;
  if (routeId && !route) return null;
  const moving = new Set(ids);
  const list: TripChild[] = route ? routeStages(store, route.id) : tripChildren(store);
  const others = list.filter((c) => !moving.has(c.id));
  const at = beforeId ? others.findIndex((c) => c.id === beforeId) : others.length;
  const index = at < 0 ? others.length : at;
  let prev = others[index - 1]?.order ?? null;
  const next = others[index]?.order ?? null;
  const changes: Change[] = [];
  for (const id of ids) {
    const e = store.get(id);
    if (e?.type !== 'stage' && !(e?.type === 'route' && !route)) continue;
    const order = keyBetween(prev, next);
    prev = order;
    changes.push(e.type === 'stage' ? edits.update<Stage>(store, id, { routeId: route?.id, order }) : edits.update<Route>(store, id, { order }));
  }
  return changes.length ? { label, changes } : null;
}

/** Stages in display order, each with the trip child it sits under (its route, or itself). */
const topOf = (store: TripStore, stage: Stage): string => (inRoute(store, stage) ? stage.routeId! : stage.id);

/** Puts stages into a new route, placed where the first of them is (in trip order). */
export function makeRouteCommand(store: TripStore, stages: Stage[], name: string, label: string): { command: Command; routeId: string } | null {
  const ids = new Set(stages.map((s) => s.id));
  const members = sortedStages(store).filter((s) => ids.has(s.id));
  const first = members[0];
  if (!first) return null;
  const children = tripChildren(store);
  const index = children.findIndex((c) => c.id === topOf(store, first));
  const prev = children.slice(0, Math.max(index, 0)).filter((c) => !ids.has(c.id)).at(-1)?.order ?? null;
  const next = children.slice(index).find((c) => !ids.has(c.id))?.order ?? null;
  const id = newId();
  const changes: Change[] = [edits.create<Route>({ id, type: 'route', tripId: first.tripId, order: keyBetween(prev, next), name, notes: '' })];
  let order: string | null = null;
  for (const s of members) {
    order = keyBetween(order, null);
    changes.push(edits.update<Stage>(store, s.id, { routeId: id, order }));
  }
  return { command: { label, changes }, routeId: id };
}

/** Removes the route and leaves its stages in the trip, where the route was. */
export function dissolveRouteCommand(store: TripStore, routeId: string, label: string): Command | null {
  if (!store.get(routeId, 'route')) return null;
  const children = tripChildren(store);
  const index = children.findIndex((c) => c.id === routeId);
  let prev = children[index - 1]?.order ?? null;
  const next = children[index + 1]?.order ?? null;
  const changes: Change[] = routeStages(store, routeId).map((s) => {
    const order = keyBetween(prev, next);
    prev = order;
    return edits.update<Stage>(store, s.id, { routeId: undefined, order });
  });
  changes.push(edits.remove(store, routeId));
  return { label, changes };
}

/** Soft-deletes a route and everything in it. */
export function deleteRouteCommand(store: TripStore, routeId: string, label: string): Command {
  const stageIds = new Set(routeStages(store, routeId).map((s) => s.id));
  const inside = [
    ...store.list('segment', (s) => stageIds.has(s.stageId)),
    ...store.list('group', (g) => stageIds.has(g.stageId)),
    ...[...stageIds].map((id) => store.get(id, 'stage')!),
  ];
  return { label, changes: [...inside.map((e) => edits.remove(store, e.id)), edits.remove(store, routeId)] };
}

/**
 * Copies a route with everything in it (stages, groups, segments; not comments), right after
 * the original: a variant to change without touching the original.
 */
export function duplicateRouteCommand(store: TripStore, routeId: string, name: string, label: string): { command: Command; routeId: string } | null {
  const route = store.get(routeId, 'route');
  if (!route) return null;
  const strip = <E extends { updatedAt: number; updatedBy: string; deleted: boolean }>(e: E) => {
    const { updatedAt: _a, updatedBy: _b, deleted: _c, ...rest } = e;
    return rest;
  };
  const children = tripChildren(store);
  const next = children[children.findIndex((c) => c.id === routeId) + 1]?.order ?? null;
  const copyId = newId();
  const changes: Change[] = [edits.create<Route>({ ...strip(route), id: copyId, name, order: keyBetween(route.order, next) })];
  for (const stage of routeStages(store, routeId)) {
    const stageId = newId();
    changes.push(edits.create<Stage>({ ...strip(stage), id: stageId, routeId: copyId }));
    const groupIds = new Map<string, string>();
    for (const g of store.list('group', (x) => x.stageId === stage.id)) {
      const id = newId();
      groupIds.set(g.id, id);
      changes.push(edits.create<Group>({ ...strip(g), id, stageId }));
    }
    for (const s of store.list('segment', (x) => x.stageId === stage.id)) {
      const groupId = s.groupId ? groupIds.get(s.groupId) : undefined;
      changes.push(edits.create<Segment>({ ...strip(s), ...copyGeometry(s), id: newId(), stageId, groupId }));
    }
  }
  return { command: { label, changes }, routeId: copyId };
}

import { edits, type Command } from '../../core/commands';
import type { t as translate } from '../../core/i18n';
import type { TripStore } from '../../core/store';
import { newId } from '../../model/ids';
import { groupSegments, inRoute, routeStages, stageSegments, tripChildren } from '../../lib/tree';
import type { PlanPart, RestPeriod, Route, ScheduleSettings, Segment, Stage, Trip } from '../../model/types';
import type { PlanRow } from './rows';
import { buildSchedule, DEFAULT_SCHEDULE, type PlanSegment, type Schedule } from './schedule';

/** What can be planned: a route, or the stages outside routes ('trip'). */
export const TRIP_SOURCE = 'trip';

export interface PlanSource {
  id: string;
  name: string;
}

export function planSources(store: TripStore, t: typeof translate): PlanSource[] {
  const children = tripChildren(store);
  const sources: PlanSource[] = children.filter((c): c is Route => c.type === 'route').map((r) => ({ id: r.id, name: r.name }));
  if (children.some((c) => c.type === 'stage')) sources.unshift({ id: TRIP_SOURCE, name: t('plan.looseStages') });
  return sources;
}

export function planStages(store: TripStore, source: string): Stage[] {
  if (source !== TRIP_SOURCE) return routeStages(store, source);
  return tripChildren(store).filter((c): c is Stage => c.type === 'stage' && !inRoute(store, c));
}

export function planSegments(store: TripStore, source: string): Segment[] {
  return planStages(store, source).flatMap((st) => stageSegments(store, st.id));
}

const sourceEntity = (store: TripStore, source: string): Route | Trip | undefined =>
  source === TRIP_SOURCE ? store.list('trip')[0] : store.get(source, 'route');

export function planSettings(store: TripStore, source: string): ScheduleSettings {
  const own = sourceEntity(store, source)?.schedule ?? {};
  const trip = store.list('trip')[0];
  return { ...DEFAULT_SCHEDULE, ...(trip?.startDate ? { startDate: trip.startDate } : {}), ...own };
}

/** A segment's fixed date: its own planned date, else its group's or stage's if it comes first in them. */
export function fixedDate(store: TripStore, seg: Segment): string | undefined {
  if (seg.plannedDate) return seg.plannedDate;
  if (seg.groupId) {
    const group = store.get(seg.groupId, 'group');
    if (group?.plannedDate && groupSegments(store, group.id)[0]?.id === seg.id) return group.plannedDate;
  }
  const stage = store.get(seg.stageId, 'stage');
  if (stage?.plannedDate && stageSegments(store, stage.id)[0]?.id === seg.id) return stage.plannedDate;
  return undefined;
}

export function restPeriods(store: TripStore, source: string): RestPeriod[] {
  const routeId = source === TRIP_SOURCE ? undefined : source;
  return store.list('restPeriod', (r) => r.routeId === routeId).sort((a, b) => a.from.localeCompare(b.from));
}

/**
 * What the schedule works through: each line of the calendar (a segment's stretch in one country)
 * with its own settings, else its segment's (days shared out by length), else the plan's. Without
 * the lines yet, whole segments.
 */
export function planPieces(store: TripStore, segments: Segment[], rows: PlanRow[] | null): PlanSegment[] {
  const whole = (s: Segment): PlanSegment => ({
    id: s.id,
    mode: s.mode,
    lengthM: s.stats.lengthM,
    ascentM: s.stats.ascentM,
    fixed: fixedDate(store, s),
    days: s.planDays,
    kmPerDay: s.planKmPerDay,
  });
  if (!rows) return segments.map(whole);
  const bySegment = new Map<string, PlanRow[]>();
  for (const r of rows) {
    const list = bySegment.get(r.segmentId);
    if (list) list.push(r);
    else bySegment.set(r.segmentId, [r]);
  }
  return segments.flatMap((s) => {
    const parts = bySegment.get(s.id);
    if (!parts?.length) return [whole(s)];
    const length = s.stats.lengthM || 1;
    return parts.map((r, i): PlanSegment => {
      const share = ((r.toKm - r.fromKm) * 1000) / length;
      const own: PlanPart = s.planParts?.[r.part] ?? {};
      return {
        id: r.key,
        mode: s.mode,
        lengthM: (r.toKm - r.fromKm) * 1000,
        ascentM: s.stats.ascentM * share,
        fixed: own.fixed ?? (i === 0 ? fixedDate(store, s) : undefined),
        days: own.days ?? (s.planDays !== undefined ? s.planDays * share : undefined),
        kmPerDay: own.kmPerDay ?? s.planKmPerDay,
      };
    });
  });
}

export function planSchedule(store: TripStore, source: string, rows: PlanRow[] | null = null): Schedule {
  return buildSchedule(planPieces(store, planSegments(store, source), rows), planSettings(store, source), restPeriods(store, source));
}

/** Sets a line's own settings (undefined clears one). */
export function setPartCommand(store: TripStore, segmentId: string, part: string, patch: PlanPart, label: string): Command | null {
  const seg = store.get(segmentId, 'segment');
  if (!seg) return null;
  const next: PlanPart = { ...(seg.planParts?.[part] ?? {}), ...patch };
  for (const k of Object.keys(next) as (keyof PlanPart)[]) if (next[k] === undefined) delete next[k];
  const parts = { ...(seg.planParts ?? {}) };
  if (Object.keys(next).length) parts[part] = next;
  else delete parts[part];
  return {
    label,
    changes: [edits.update<Segment>(store, seg.id, { planParts: Object.keys(parts).length ? parts : undefined })],
    mergeKey: `part:${seg.id}:${part}:${Object.keys(patch).join(',')}`,
  };
}

// Edits ------------------------------------------------------------------------------------------

export function setScheduleCommand(store: TripStore, source: string, patch: Partial<ScheduleSettings>, label: string): Command | null {
  const entity = sourceEntity(store, source);
  if (!entity) return null;
  const next = { ...(entity.schedule ?? {}), ...patch };
  return {
    label,
    changes: [edits.update<Route | Trip>(store, entity.id, { schedule: next })],
    mergeKey: `schedule:${entity.id}:${Object.keys(patch).join(',')}`,
  };
}

export function addRestPeriodCommand(
  store: TripStore,
  opts: { tripId: string; source: string; from: string; to: string; name: string; label: string },
): { command: Command; id: string } {
  const id = newId();
  const period = edits.create<RestPeriod>({
    id,
    type: 'restPeriod',
    tripId: opts.tripId,
    ...(opts.source === TRIP_SOURCE ? {} : { routeId: opts.source }),
    from: opts.from <= opts.to ? opts.from : opts.to,
    to: opts.from <= opts.to ? opts.to : opts.from,
    name: opts.name,
  });
  return { command: { label: opts.label, changes: [period] }, id };
}

export function editRestPeriodCommand(store: TripStore, id: string, patch: Partial<Pick<RestPeriod, 'from' | 'to' | 'name'>>, label: string): Command | null {
  const current = store.get(id, 'restPeriod');
  if (!current) return null;
  const next = { ...current, ...patch };
  if (next.to < next.from) [next.from, next.to] = [next.to, next.from];
  return { label, changes: [edits.update<RestPeriod>(store, id, { from: next.from, to: next.to, name: next.name })], mergeKey: `rest:${id}:${Object.keys(patch).join(',')}` };
}

import { MODE_ORDER } from '../../config/modes';
import type { Segment, Stage, TravelMode } from '../../model/types';

export interface ModeTotal {
  mode: TravelMode;
  lengthM: number;
  ascentM: number;
  segments: number;
}

export interface Stats {
  byMode: ModeTotal[];
  lengthM: number;
  /** Climb on bike and on foot. */
  ascentM: number;
  stages: number;
  /** Span of planned dates, first and last day included. */
  days: { count: number; from: string; to: string } | null;
}

const DAY_MS = 86_400_000;

export function computeStats(stages: Stage[], segments: Segment[]): Stats {
  const totals = new Map<TravelMode, ModeTotal>();
  for (const s of segments) {
    const t = totals.get(s.mode) ?? { mode: s.mode, lengthM: 0, ascentM: 0, segments: 0 };
    t.lengthM += s.stats.lengthM;
    t.ascentM += s.stats.ascentM;
    t.segments++;
    totals.set(s.mode, t);
  }
  const byMode = MODE_ORDER.map((m) => totals.get(m)).filter((t): t is ModeTotal => !!t);
  const dates = [...stages.map((s) => s.plannedDate), ...segments.map((s) => s.plannedDate)]
    .filter((d): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  const from = dates[0];
  const to = dates.at(-1);
  return {
    byMode,
    lengthM: byMode.reduce((sum, t) => sum + t.lengthM, 0),
    ascentM: byMode.filter((t) => t.mode === 'bike' || t.mode === 'walk').reduce((sum, t) => sum + t.ascentM, 0),
    stages: stages.length,
    days: from && to ? { count: Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1, from, to } : null,
  };
}

import type { ScheduleSettings, TravelMode } from '../../model/types';

export type { ScheduleSettings };

export const DEFAULT_SCHEDULE: ScheduleSettings = {
  startDate: '2027-04-03',
  kmPerDay: 80,
  walkKmPerDay: 20,
  restEvery: 6,
  climbKm: 1,
};

export interface PlanSegment {
  id: string;
  mode: TravelMode;
  lengthM: number;
  ascentM: number;
  /** A date it must start on (a visa, a flight, friends joining). */
  fixed?: string;
  /** Days a train, bus, boat, plane or car journey takes (default 1). */
  days?: number;
}

export interface RestPeriodInput {
  from: string;
  to: string;
  name: string;
}

/** Part of a segment covered on a day, in km from the start of the route. */
export interface DayPart {
  segmentId: string;
  fromKm: number;
  toKm: number;
}

export type DayKind = 'ride' | 'transport' | 'rest' | 'wait';

export interface PlanDay {
  /** Days since the first day. */
  index: number;
  date: string;
  kind: DayKind;
  parts: DayPart[];
  /** The rest period it's in, if any. */
  rest?: string;
}

export interface SegmentSpan {
  segmentId: string;
  /** Indexes of its first and last days. */
  first: number;
  last: number;
  startKm: number;
  endKm: number;
  fixed?: string;
  /** Days later than its fixed date that it can start. */
  late?: number;
}

export interface Schedule {
  start: string;
  days: PlanDay[];
  spans: Map<string, SegmentSpan>;
  totalKm: number;
}

const DAY_MS = 86_400_000;
const MOTORISED = new Set<TravelMode>(['train', 'bus', 'boat', 'plane', 'car']);
/** Bits of a day too small to open a new one for. */
const CRUMB = 0.05;

export const toDayNumber = (iso: string): number => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
export const fromDayNumber = (n: number): string => new Date(n * DAY_MS).toISOString().slice(0, 10);

/**
 * Works out the trip day by day: bike and walk segments at their daily distance (plus climbing),
 * one day per motorised journey, a rest day every few days of riding, no riding during rest
 * periods, and waiting for fixed dates (or noting how late they are).
 */
export function buildSchedule(segments: PlanSegment[], settings: ScheduleSettings, restPeriods: RestPeriodInput[] = []): Schedule {
  const start = toDayNumber(settings.startDate);
  const periods = restPeriods
    .map((r) => ({ from: toDayNumber(r.from), to: toDayNumber(r.to), name: r.name }))
    .filter((r) => !Number.isNaN(r.from) && !Number.isNaN(r.to) && r.to >= r.from);
  const periodAt = (day: number) => periods.find((r) => day >= r.from && day <= r.to);

  const days: PlanDay[] = [];
  const spans = new Map<string, SegmentSpan>();
  let day = start;
  let used = 0; // fraction of the current day spent
  let parts: DayPart[] = [];
  let kind: DayKind = 'ride';
  let ridden = 0; // riding days since the last rest day

  const push = (k: DayKind, p: DayPart[], rest?: string) =>
    days.push({ index: day - start, date: fromDayNumber(day), kind: k, parts: p, ...(rest ? { rest } : {}) });

  /** Skips rest periods and due rest days, so `day` is free to travel. */
  const settle = () => {
    for (;;) {
      const period = periodAt(day);
      if (period) {
        push('rest', [], period.name);
        day++;
        ridden = 0;
      } else if (settings.restEvery > 0 && ridden >= settings.restEvery) {
        push('rest', []);
        day++;
        ridden = 0;
      } else return;
    }
  };

  /** Closes the current day if anything happened on it, and moves on to the next free one. */
  const nextDay = () => {
    if (!parts.length && used === 0) return;
    push(kind, parts);
    if (kind === 'ride') ridden++;
    day++;
    used = 0;
    parts = [];
    kind = 'ride';
    settle();
  };

  const note = (segmentId: string, fromKm: number, toKm: number) => {
    const last = parts.at(-1);
    if (last && last.segmentId === segmentId && Math.abs(last.toKm - fromKm) < 1e-6) last.toKm = toKm;
    else parts.push({ segmentId, fromKm, toKm });
  };

  settle();
  let km = 0;
  for (const seg of segments) {
    const length = seg.lengthM / 1000;
    const span: SegmentSpan = { segmentId: seg.id, first: 0, last: 0, startKm: km, endKm: km + length, ...(seg.fixed ? { fixed: seg.fixed } : {}) };

    if (seg.fixed) {
      const fixed = toDayNumber(seg.fixed);
      if (!Number.isNaN(fixed)) {
        // The first day it could start on: today, unless today is already full.
        const free = used >= 1 - 1e-9 ? day + 1 : day;
        if (fixed > day) {
          nextDay();
          while (day < fixed) {
            const period = periodAt(day);
            push(period ? 'rest' : 'wait', [], period?.name);
            day++;
          }
          ridden = 0;
        } else if (fixed < free) span.late = free - fixed;
      }
    }

    if (MOTORISED.has(seg.mode)) {
      if (used > 0 || parts.length) nextDay();
      const n = Math.max(1, Math.round(seg.days ?? 1));
      span.first = day - start;
      for (let i = 0; i < n; i++) {
        kind = 'transport';
        note(seg.id, km + (length * i) / n, km + (length * (i + 1)) / n);
        used = 1;
        if (i < n - 1) {
          push(kind, parts);
          day++;
          parts = [];
        }
      }
      span.last = day - start;
      nextDay();
    } else {
      const pace = seg.mode === 'walk' ? settings.walkKmPerDay : settings.kmPerDay;
      const effort = length + (settings.climbKm * seg.ascentM) / 100;
      // Days this segment takes, spread over the ones left after earlier segments.
      let left = pace > 0 ? effort / pace : 0;
      let done = 0;
      if (1 - used < CRUMB && left >= CRUMB) nextDay();
      span.first = day - start;
      while (left > 1e-9) {
        const take = Math.min(left, 1 - used);
        const from = km + (done / (effort / pace || 1)) * length;
        done += take;
        left -= take;
        // A last crumb rides on the day before instead of starting a new one.
        const finish = left < CRUMB;
        const to = finish ? km + length : km + (done / (effort / pace)) * length;
        note(seg.id, from, to);
        used += take;
        span.last = day - start;
        if (finish) break;
        if (used >= 1 - 1e-9) nextDay();
      }
      if (length === 0) span.last = span.first;
    }
    km += length;
    spans.set(seg.id, span);
  }
  if (parts.length) push(kind, parts);
  return { start: settings.startDate, days, spans, totalKm: km };
}

/** The day a date falls on in the schedule (may be before the start or after the end). */
export const dayIndex = (schedule: Schedule, iso: string) => toDayNumber(iso) - toDayNumber(schedule.start);

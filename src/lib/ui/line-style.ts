import type { LineDash, Segment } from '../../model/types';

/** A value of `undefined` means "the travel mode's"; `null` means the segments differ. */
export interface LineStyleValue {
  color: string | undefined | null;
  width: number | undefined | null;
  dash: LineDash | undefined | null;
}

/** The common line style of some segments. */
export function lineStyleOf(segments: Pick<Segment, 'color' | 'lineWidth' | 'dash'>[]): LineStyleValue {
  const same = <T>(values: T[]): T | null => (values.every((v) => v === values[0]) ? values[0]! : null);
  return {
    color: same(segments.map((s) => s.color)),
    width: same(segments.map((s) => s.lineWidth)),
    dash: same(segments.map((s) => s.dash)),
  };
}

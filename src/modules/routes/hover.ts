/** The segment under the mouse, where the pointer is, and its planned days (if any). */
export interface Hovered {
  segmentId: string;
  x: number;
  y: number;
  dates: { from: string; to: string } | null;
}

import { distance } from './geo/geo';
import { segmentCoords } from '../model/segment';
import type { LngLat, Segment } from '../model/types';

/**
 * Puts segments end to end: the order and direction that make each one start where the previous
 * one ends (the smallest total gap). Exact up to EXACT_MAX segments, greedy beyond.
 */

export interface ChainLink {
  seg: Segment;
  /** Runs the other way round in the chain. */
  reversed: boolean;
}

export interface Chain {
  links: ChainLink[];
  /** Distance between each link's end and the next one's start, in metres. */
  gapsM: number[];
}

const EXACT_MAX = 10;
/** Gaps differing by less than this count as equal (GPS noise, rounding). */
const SAME_M = 30;

type Ends = [LngLat, LngLat];

function endsOf(seg: Segment): Ends | null {
  const a = seg.anchors[0]?.lngLat;
  const b = seg.anchors.at(-1)?.lngLat;
  if (a && b) return [a, b];
  const coords = segmentCoords(seg);
  const first = coords[0];
  const last = coords.at(-1);
  return first && last ? [[first[0], first[1]], [last[0], last[1]]] : null;
}

const entry = (e: Ends, reversed: boolean) => (reversed ? e[1] : e[0]);
const exit = (e: Ends, reversed: boolean) => (reversed ? e[0] : e[1]);

function gaps(links: { ends: Ends; reversed: boolean }[]): number[] {
  return links.slice(1).map((l, i) => distance(exit(links[i]!.ends, links[i]!.reversed), entry(l.ends, l.reversed)));
}
const total = (g: number[]) => g.reduce((a, b) => a + b, 0);

/** Order (indices) and directions with the smallest total gap, by dynamic programming over subsets. */
function exact(ends: Ends[], dirs: number[]): { order: number[]; reversed: boolean[] } {
  const n = ends.length;
  const full = (1 << n) - 1;
  const size = (1 << n) * n * 2;
  const cost = new Float64Array(size).fill(Infinity);
  const from = new Int32Array(size).fill(-1);
  const key = (mask: number, i: number, r: number) => (mask * n + i) * 2 + r;
  for (let i = 0; i < n; i++) for (const r of dirs) cost[key(1 << i, i, r)] = 0;
  for (let mask = 1; mask <= full; mask++) {
    for (let i = 0; i < n; i++) {
      if (!(mask & (1 << i))) continue;
      for (const r of dirs) {
        const c = cost[key(mask, i, r)]!;
        if (c === Infinity) continue;
        const out = exit(ends[i]!, r === 1);
        for (let j = 0; j < n; j++) {
          if (mask & (1 << j)) continue;
          for (const s of dirs) {
            const k = key(mask | (1 << j), j, s);
            const next = c + distance(out, entry(ends[j]!, s === 1));
            if (next < cost[k]!) {
              cost[k] = next;
              from[k] = key(mask, i, r);
            }
          }
        }
      }
    }
  }
  let best = -1;
  for (let i = 0; i < n; i++) for (const r of dirs) if (best < 0 || cost[key(full, i, r)]! < cost[best]!) best = key(full, i, r);
  const order: number[] = [];
  const reversed: boolean[] = [];
  for (let k = best; k >= 0; k = from[k]!) {
    order.unshift(Math.floor(k / 2) % n);
    reversed.unshift(k % 2 === 1);
  }
  return { order, reversed };
}

/** Grows a chain from the first segment, adding the nearest free end at either side. */
function greedy(ends: Ends[], dirs: boolean[]): { order: number[]; reversed: boolean[] } {
  const order = [0];
  const reversed = [false];
  const free = new Set(ends.map((_, i) => i).slice(1));
  while (free.size) {
    const head = entry(ends[order[0]!]!, reversed[0]!);
    const tail = exit(ends[order.at(-1)!]!, reversed.at(-1)!);
    let best: { i: number; r: boolean; atTail: boolean; d: number } | null = null;
    for (const i of free) {
      for (const r of dirs) {
        const dt = distance(tail, entry(ends[i]!, r));
        const dh = distance(exit(ends[i]!, r), head);
        if (!best || dt < best.d) best = { i, r, atTail: true, d: dt };
        if (dh < best.d) best = { i, r, atTail: false, d: dh };
      }
    }
    free.delete(best!.i);
    if (best!.atTail) {
      order.push(best!.i);
      reversed.push(best!.r);
    } else {
      order.unshift(best!.i);
      reversed.unshift(best!.r);
    }
  }
  return { order, reversed };
}

/**
 * The best chain through these segments (given in their current order). The current order and
 * directions are kept when they are as good; of the two ways along the chain, the one that
 * reverses the fewest kilometres is used. With `reverse: false`, only the order changes.
 */
export function chainSegments(segments: Segment[], { reverse = true }: { reverse?: boolean } = {}): Chain {
  const usable = segments.map((seg) => ({ seg, ends: endsOf(seg) }));
  const withEnds = usable.filter((u): u is { seg: Segment; ends: Ends } => !!u.ends);
  const without = usable.filter((u) => !u.ends).map((u) => ({ seg: u.seg, reversed: false }));
  const ends = withEnds.map((u) => u.ends);

  const asIs = withEnds.map((u) => ({ ...u, reversed: false }));
  let links = asIs;
  if (withEnds.length > 1) {
    const found = withEnds.length <= EXACT_MAX ? exact(ends, reverse ? [0, 1] : [0]) : greedy(ends, reverse ? [false, true] : [false]);
    const forward = found.order.map((i, k) => ({ ...withEnds[i]!, reversed: found.reversed[k]! }));
    const backward = [...forward].reverse().map((l) => ({ ...l, reversed: !l.reversed }));
    const flippedM = (list: typeof forward) => list.reduce((m, l) => m + (l.reversed ? l.seg.stats.lengthM || 1 : 0), 0);
    const candidate = reverse && flippedM(backward) < flippedM(forward) ? backward : forward;
    if (total(gaps(candidate)) < total(gaps(asIs)) - SAME_M) links = candidate;
  }
  return { links: [...links.map(({ seg, reversed }) => ({ seg, reversed })), ...without], gapsM: gaps(links) };
}

/** Whether the chain changes anything: a different order, or a segment turned round. */
export function chainChanges(segments: Segment[], chain: Chain): { reordered: boolean; reversed: number } {
  return {
    reordered: chain.links.some((l, i) => l.seg.id !== segments[i]?.id),
    reversed: chain.links.filter((l) => l.reversed).length,
  };
}

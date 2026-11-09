// Fractional order keys: each child stores its own sortable key, so inserting or moving
// one item never rewrites its siblings (and concurrent edits don't clobber each other).

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = DIGITS.length;

function digit(c: string | undefined): number {
  if (c === undefined) return 0;
  const d = DIGITS.indexOf(c);
  if (d < 0) throw new Error(`Invalid order key character: ${c}`);
  return d;
}

function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    let n = 0;
    while ((a[n] ?? '0') === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const da = digit(a[0]);
  const db = b === null ? BASE : digit(b[0]);
  if (db - da > 1) return DIGITS[Math.round((da + db) / 2)]!;
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return DIGITS[da]! + midpoint(a.slice(1), null);
}

/** Returns a key that sorts strictly between `a` and `b` (null = open end). */
export function keyBetween(a: string | null, b: string | null): string {
  if (a !== null && b !== null && a >= b) throw new Error(`keyBetween: ${a} >= ${b}`);
  if (a?.endsWith('0') || b?.endsWith('0')) throw new Error('Order keys must not end in 0');
  return midpoint(a ?? '', b);
}

export function compareOrder(a: { order: string; id: string }, b: { order: string; id: string }): number {
  if (a.order !== b.order) return a.order < b.order ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

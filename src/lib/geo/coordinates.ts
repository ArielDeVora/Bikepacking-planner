import type { LngLat } from '../../model/types';

/**
 * Reads a position typed or pasted in the usual ways, latitude first unless letters say otherwise:
 *   45.92, 6.87 · -33.9 18.42 · 45,92; 6,87
 *   41°41'24"N 44°48'0"E · 41°41'24.0"N 44°48'00.0"E (Google Maps) · N 41° 41.4' E 44° 48'
 *   41.69N 44.8E · 44.8E 41.69N · 41 41 24 N 44 48 0 E · 41d41m24s N, 44d48m E
 */
export function parseCoordinates(input: string): LngLat | null {
  let q = normalize(input);
  if (!q || !/\d/.test(q) || !/^[\d\s.,;:°'"NSEW+\-/]+$/.test(q)) return null;
  // Decimal commas: "45,92 6,87" or "45,92; 6,87".
  if (/^-?\d+,\d+\s*[;\s]\s*-?\d+,\d+$/.test(q)) q = q.replace(/(\d),(\d)/g, '$1.$2');

  const parts = /[NSEW]/.test(q) ? splitByHemisphere(q) : splitPlain(q);
  if (!parts || parts.length !== 2) return null;
  const [a, b] = parts.map(toAngle);
  if (!a || !b) return null;

  let lat: number;
  let lng: number;
  if (a.axis === 'lng' || b.axis === 'lat') {
    if (a.axis === 'lat' || b.axis === 'lng') return null;
    [lat, lng] = [b.value, a.value];
  } else {
    [lat, lng] = [a.value, b.value];
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return [lng, lat];
}

function normalize(s: string): string {
  return (
    s
      .replace(/[º˚]/g, '°')
      .replace(/[′’‘´`]/g, "'")
      .replace(/[″“”]|''/g, '"')
      // Spelled-out units: 41d 41m 24s, 41deg 41min. An "s" is seconds only after minutes; else it's south.
      .replace(/(\d)\s*(?:deg(?:rees?)?|d)(?![a-z])/gi, '$1°')
      .replace(/(\d)\s*(?:min|m)(?![a-z])/gi, "$1'")
      .replace(/('\s*\d+(?:\.\d+)?)\s*(?:sec|s)(?![a-z])/gi, '$1"')
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** Splits at the hemisphere letters, written before ("N 41° E 44°") or after ("41°N 44°E") the numbers. */
function splitByHemisphere(q: string): string[] | null {
  const letters = q.match(/[NSEW]/g) ?? [];
  if (letters.length !== 2) return null;
  const prefix = /^[NSEW]/.test(q);
  const re = prefix ? /[NSEW][^NSEW]*/g : /[^NSEW]*[NSEW]/g;
  const parts = (q.match(re) ?? []).map((p) => p.replace(/^[\s,;/]+|[\s,;/]+$/g, ''));
  const rest = q.replace(re, '').replace(/[\s,;/]/g, '');
  return rest ? null : parts;
}

/** Without letters: a comma, semicolon or slash between the two; else degree signs or an even split of the numbers. */
function splitPlain(q: string): string[] | null {
  const bySep = q.split(/\s*[,;/]\s*/).filter(Boolean);
  if (bySep.length === 2) return bySep;
  if (bySep.length > 2) return null;
  // Degree signs start each part: 41°41'24" 44°48'0".
  if (q.includes('°')) {
    const byDegree = q.split(/\s+(?=[+-]?[\d.]+\s*°)/);
    return byDegree.length === 2 ? byDegree : null;
  }
  // Bare numbers: 2 (decimal), 4 (degrees and minutes) or 6 (with seconds).
  const nums = q.split(' ');
  if (![2, 4, 6].includes(nums.length) || nums.some((n) => !/^-?\d+(\.\d+)?$/.test(n))) return null;
  const half = nums.length / 2;
  return [nums.slice(0, half).join(' '), nums.slice(half).join(' ')];
}

/** One angle: degrees, minutes and seconds (each optional after the first), a sign or a hemisphere. */
function toAngle(part: string): { value: number; axis: 'lat' | 'lng' | null } | null {
  const letter = part.match(/[NSEW]/)?.[0];
  const body = part.replace(/[NSEW]/g, '').trim();
  const negative = /^[-]/.test(body);
  const m = body.match(/^[+-]?\s*(\d+(?:\.\d+)?)\s*°?\s*(?:(\d+(?:\.\d+)?)\s*'?\s*)?(?:(\d+(?:\.\d+)?)\s*"?\s*)?$/);
  if (!m) return null;
  const [deg, min = 0, sec = 0] = [Number(m[1]), m[2] === undefined ? 0 : Number(m[2]), m[3] === undefined ? 0 : Number(m[3])];
  // Minutes and seconds under 60; only the last given part may have decimals.
  if (min >= 60 || sec >= 60) return null;
  if (m[3] !== undefined && (m[1]!.includes('.') || m[2]!.includes('.'))) return null;
  if (m[2] !== undefined && m[1]!.includes('.')) return null;
  if (negative && letter) return null;
  let value = deg + min / 60 + sec / 3600;
  if (negative || letter === 'S' || letter === 'W') value = -value;
  return { value, axis: letter === 'N' || letter === 'S' ? 'lat' : letter === 'E' || letter === 'W' ? 'lng' : null };
}

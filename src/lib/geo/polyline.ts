/** [lng, lat] or [lng, lat, elevation in metres]. */
export type Coord = [number, number] | [number, number, number];

const COORD_FACTOR = 1e5;
const ELE_FACTOR = 10;

function encodeValue(value: number, out: string[]): void {
  let v = value < 0 ? ~(value << 1) : value << 1;
  while (v >= 0x20) {
    out.push(String.fromCharCode((0x20 | (v & 0x1f)) + 63));
    v >>>= 5;
  }
  out.push(String.fromCharCode(v + 63));
}

/**
 * Google polyline encoding (lat, lng at 1e-5°), extended with an optional elevation channel
 * (0.1 m). The first character is the number of dimensions, `2` or `3`; elevation is kept only
 * if every point has one.
 */
export function encodeLine(coords: Coord[]): string {
  const dims = coords.length > 0 && coords.every((c) => c.length === 3 && Number.isFinite(c[2])) ? 3 : 2;
  const out: string[] = [String(dims)];
  let pLat = 0;
  let pLng = 0;
  let pEle = 0;
  for (const c of coords) {
    const lat = Math.round(c[1] * COORD_FACTOR);
    const lng = Math.round(c[0] * COORD_FACTOR);
    encodeValue(lat - pLat, out);
    encodeValue(lng - pLng, out);
    pLat = lat;
    pLng = lng;
    if (dims === 3) {
      const ele = Math.round((c[2] as number) * ELE_FACTOR);
      encodeValue(ele - pEle, out);
      pEle = ele;
    }
  }
  return out.join('');
}

export function decodeLine(encoded: string): Coord[] {
  const dims = encoded[0] === '3' ? 3 : 2;
  const coords: Coord[] = [];
  let i = 1;
  const next = (): number => {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = encoded.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  let lat = 0;
  let lng = 0;
  let ele = 0;
  while (i < encoded.length) {
    lat += next();
    lng += next();
    if (dims === 3) {
      ele += next();
      coords.push([lng / COORD_FACTOR, lat / COORD_FACTOR, ele / ELE_FACTOR]);
    } else {
      coords.push([lng / COORD_FACTOR, lat / COORD_FACTOR]);
    }
  }
  return coords;
}

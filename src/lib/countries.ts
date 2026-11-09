import { bbox, pointInPolygon, type BBox } from './geo/geo';
import type { LngLat } from '../model/types';

/**
 * Country outlines from Natural Earth (public domain, 1:50m, accurate to about a kilometre),
 * loaded on demand from jsDelivr (~3 MB, then cached by the browser).
 */
export const COUNTRIES_URL = 'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@v5.1.2/geojson/ne_50m_admin_0_countries.geojson';

export interface Country {
  code: string;
  name: string;
  polygons: { bbox: BBox; rings: LngLat[][] }[];
}

export class CountryIndex {
  constructor(readonly countries: Country[]) {}

  static fromGeoJSON(fc: GeoJSON.FeatureCollection): CountryIndex {
    const countries: Country[] = [];
    for (const f of fc.features) {
      const p = (f.properties ?? {}) as Record<string, string>;
      const g = f.geometry;
      const polys = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : [];
      const code = [p.ISO_A2_EH, p.ISO_A2, p.ADM0_A3].find((c) => c && c !== '-99') ?? '';
      countries.push({
        code,
        name: p.NAME_EN || p.NAME || p.ADMIN || code,
        polygons: polys.map((rings) => ({ bbox: bbox(rings[0] as LngLat[]), rings: rings as LngLat[][] })),
      });
    }
    return new CountryIndex(countries);
  }

  /** The country containing the point, or null at sea. */
  at(p: readonly number[]): Country | null {
    for (const c of this.countries) {
      for (const poly of c.polygons) {
        const b = poly.bbox;
        if (p[0]! < b[0] || p[0]! > b[2] || p[1]! < b[1] || p[1]! > b[3]) continue;
        if (pointInPolygon(p as LngLat, poly.rings)) return c;
      }
    }
    return null;
  }
}

let shared: Promise<CountryIndex> | null = null;

/** The country outlines, downloaded once per session (and cached by the browser). */
export function loadCountries(): Promise<CountryIndex> {
  shared ??= fetch(COUNTRIES_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<GeoJSON.FeatureCollection>;
    })
    .then((fc) => CountryIndex.fromGeoJSON(fc))
    .catch((err) => {
      shared = null;
      throw err;
    });
  return shared;
}

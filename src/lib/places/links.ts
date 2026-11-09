import type { LngLat, OsmRef } from '../../model/types';

export interface PlaceLink {
  label: string;
  href: string;
}

/** Rough outline of mainland China, where Chinese map apps are more useful (and Google is blocked). */
const inChina = ([lng, lat]: LngLat) => lng > 73.5 && lng < 135 && lat > 18 && lat < 53.6;

/** Links to the place in other map apps and reference sites. */
export function placeLinks(lngLat: LngLat, name: string, osm?: Pick<OsmRef, 'type' | 'id' | 'tags'>): PlaceLink[] {
  const [lng, lat] = lngLat;
  const ll = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  const q = encodeURIComponent(name);
  const links: PlaceLink[] = [
    { label: 'Google Maps', href: `https://www.google.com/maps/search/?api=1&query=${ll}` },
    {
      label: 'OpenStreetMap',
      href: osm ? `https://www.openstreetmap.org/${osm.type}/${osm.id}` : `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`,
    },
  ];
  const wikipedia = osm?.tags.wikipedia?.match(/^([a-z-]+):(.+)$/);
  if (wikipedia) {
    links.push({ label: 'Wikipedia', href: `https://${wikipedia[1]}.wikipedia.org/wiki/${encodeURIComponent(wikipedia[2]!.replace(/ /g, '_'))}` });
  }
  if (osm?.tags.wikidata && /^Q\d+$/.test(osm.tags.wikidata)) {
    links.push({ label: 'Wikidata', href: `https://www.wikidata.org/wiki/${osm.tags.wikidata}` });
  }
  if (inChina(lngLat)) {
    links.push(
      { label: 'Amap', href: `https://uri.amap.com/marker?position=${lng},${lat}&name=${q}&coordinate=wgs84` },
      { label: 'Baidu', href: `https://api.map.baidu.com/marker?location=${ll}&title=${q}&content=${q}&coord_type=wgs84&output=html` },
    );
  }
  return links;
}

/** Tags worth showing, in a readable form. */
export function describeTags(tags: Record<string, string>): { key: string; value: string; href?: string }[] {
  const out: { key: string; value: string; href?: string }[] = [];
  const add = (key: string, value: string | undefined, href?: string) => value && out.push({ key, value, href });
  const address = [tags['addr:street'] && `${tags['addr:street']} ${tags['addr:housenumber'] ?? ''}`.trim(), tags['addr:postcode'], tags['addr:city']]
    .filter(Boolean)
    .join(', ');
  add('address', address);
  add('opening_hours', tags.opening_hours);
  const phone = tags.phone ?? tags['contact:phone'];
  add('phone', phone, phone && `tel:${phone.replace(/[^\d+]/g, '')}`);
  const website = tags.website ?? tags['contact:website'] ?? tags.url;
  add('website', website?.replace(/^https?:\/\//, '').replace(/\/$/, ''), website && (/^https?:\/\//.test(website) ? website : `https://${website}`));
  add('email', tags.email ?? tags['contact:email']);
  add('fee', tags.fee);
  add('description', tags.description);
  return out;
}

export function formatLngLat([lng, lat]: LngLat): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

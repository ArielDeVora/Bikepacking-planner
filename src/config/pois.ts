import type { PoiCategory, PoiStatus } from '../model/types';

/** Icon paths are stroked on a 24×24 grid. */
export interface PoiCategoryConfig {
  id: PoiCategory;
  color: string;
  icon: string;
}

export const POI_ICONS = {
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  mountain: 'M2 20 9 7l4 7 3-4 6 10zM6.85 11 9 12.5l2.3-1.5',
  tent: 'M2 20h20M12 4 3.5 20M12 4l8.5 16M12 13l-3 7M12 13l3 7',
  drop: 'M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z',
  food: 'M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2 0-3 3-3 7h3',
  wrench: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z',
  bed: 'M3 18V7M3 13h18v5M21 18v-3a3 3 0 0 0-3-3h-7v1M7 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  document: 'M6 3h9l3 3v15H6zM9 9h6M9 13h6M9 17h4',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  pin: 'M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12zM12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  cart: 'M3 4h2l2.5 11h11L21 7H6.5M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM18 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  cross: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',
  cash: 'M3 6h18v12H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 9v6M18 9v6',
} as const;

export const POI_CATEGORIES: Record<PoiCategory, PoiCategoryConfig> = {
  sight: { id: 'sight', color: '#7048e8', icon: POI_ICONS.camera },
  nature: { id: 'nature', color: '#2f9e44', icon: POI_ICONS.mountain },
  camp: { id: 'camp', color: '#9c6644', icon: POI_ICONS.tent },
  water: { id: 'water', color: '#1c7ed6', icon: POI_ICONS.drop },
  food: { id: 'food', color: '#e8590c', icon: POI_ICONS.food },
  bikeShop: { id: 'bikeShop', color: '#d6336c', icon: POI_ICONS.wrench },
  accommodation: { id: 'accommodation', color: '#0c8599', icon: POI_ICONS.bed },
  admin: { id: 'admin', color: '#495057', icon: POI_ICONS.document },
  border: { id: 'border', color: '#c92a2a', icon: POI_ICONS.flag },
  other: { id: 'other', color: '#868e96', icon: POI_ICONS.pin },
};

export const POI_CATEGORY_ORDER: PoiCategory[] = ['sight', 'nature', 'camp', 'water', 'food', 'bikeShop', 'accommodation', 'admin', 'border', 'other'];
export const POI_STATUS_ORDER: PoiStatus[] = ['idea', 'mustSee', 'booked', 'skip'];

/** OpenStreetMap overlays (loaded from Overpass), each with the tags that select it. */
export interface OsmCategory {
  id: string;
  color: string;
  icon: string;
  /** Overpass filters, one statement each, without the bounding box. */
  filters: string[];
  match: (tags: Record<string, string>) => boolean;
  /** Category given to the POI when the place is added to the trip. */
  poi: PoiCategory;
}

export const OSM_CATEGORIES: OsmCategory[] = [
  {
    id: 'bikeShop',
    color: '#d6336c',
    icon: POI_ICONS.wrench,
    filters: ['nwr["shop"="bicycle"]', 'nwr["amenity"="bicycle_repair_station"]'],
    match: (t) => t.shop === 'bicycle' || t.amenity === 'bicycle_repair_station',
    poi: 'bikeShop',
  },
  {
    id: 'supermarket',
    color: '#e8590c',
    icon: POI_ICONS.cart,
    filters: ['nwr["shop"~"^(supermarket|convenience|greengrocer|bakery)$"]'],
    match: (t) => /^(supermarket|convenience|greengrocer|bakery)$/.test(t.shop ?? ''),
    poi: 'food',
  },
  {
    id: 'food',
    color: '#f76707',
    icon: POI_ICONS.food,
    filters: ['nwr["amenity"~"^(restaurant|cafe|fast_food)$"]'],
    match: (t) => /^(restaurant|cafe|fast_food)$/.test(t.amenity ?? ''),
    poi: 'food',
  },
  {
    id: 'water',
    color: '#1c7ed6',
    icon: POI_ICONS.drop,
    filters: ['nwr["amenity"="drinking_water"]', 'nwr["man_made"="water_tap"]["drinking_water"!="no"]'],
    match: (t) => t.amenity === 'drinking_water' || (t.man_made === 'water_tap' && t.drinking_water !== 'no'),
    poi: 'water',
  },
  {
    id: 'camp',
    color: '#9c6644',
    icon: POI_ICONS.tent,
    filters: ['nwr["tourism"="camp_site"]'],
    match: (t) => t.tourism === 'camp_site',
    poi: 'camp',
  },
  {
    id: 'hotel',
    color: '#0c8599',
    icon: POI_ICONS.bed,
    filters: ['nwr["tourism"~"^(hotel|guest_house|hostel|motel|alpine_hut|wilderness_hut)$"]'],
    match: (t) => /^(hotel|guest_house|hostel|motel|alpine_hut|wilderness_hut)$/.test(t.tourism ?? ''),
    poi: 'accommodation',
  },
  {
    id: 'pharmacy',
    color: '#2b8a3e',
    icon: POI_ICONS.cross,
    filters: ['nwr["amenity"="pharmacy"]'],
    match: (t) => t.amenity === 'pharmacy',
    poi: 'other',
  },
  {
    id: 'atm',
    color: '#5c940d',
    icon: POI_ICONS.cash,
    filters: ['nwr["amenity"="atm"]', 'nwr["amenity"="bank"]["atm"="yes"]'],
    match: (t) => t.amenity === 'atm' || (t.amenity === 'bank' && t.atm === 'yes'),
    poi: 'other',
  },
];

const OMT_FOOD = ['restaurant', 'fast_food', 'cafe', 'bar', 'beer', 'ice_cream', 'grocery', 'bakery', 'food_court', 'alcohol_shop'];
const OMT_SIGHTS = ['attraction', 'museum', 'monument', 'castle', 'art_gallery', 'place_of_worship', 'theatre', 'zoo', 'historic'];
const OMT_NATURE = ['park', 'viewpoint', 'peak', 'volcano', 'waterfall', 'cave_entrance', 'nature_reserve', 'national_park', 'hot_spring', 'glacier'];

/** POI category for a place of the base map (OpenMapTiles `poi` layer: class and subclass). */
export function poiCategoryFromOmt(cls: string, subclass: string): PoiCategory {
  if (cls === 'bicycle' || subclass === 'bicycle' || subclass === 'bicycle_repair_station') return 'bikeShop';
  if (cls === 'campsite' || subclass === 'camp_site') return 'camp';
  if (cls === 'lodging') return 'accommodation';
  if (cls === 'drinking_water' || subclass === 'drinking_water') return 'water';
  if (OMT_NATURE.includes(cls) || OMT_NATURE.includes(subclass)) return 'nature';
  if (OMT_FOOD.includes(cls) || subclass === 'supermarket' || subclass === 'convenience') return 'food';
  if (OMT_SIGHTS.includes(cls)) return 'sight';
  if (cls === 'town_hall' || subclass === 'embassy') return 'admin';
  return 'other';
}

/** Best-guess POI category for an OSM feature's tags. */
export function poiCategoryFromTags(tags: Record<string, string>): PoiCategory {
  const overlay = OSM_CATEGORIES.find((c) => c.match(tags));
  if (overlay) return overlay.poi;
  if (tags.barrier === 'border_control') return 'border';
  if (/^(restaurant|cafe|fast_food|pub|bar|food_court)$/.test(tags.amenity ?? '')) return 'food';
  if (isNature(tags)) return 'nature';
  if (tags.tourism && /^(attraction|museum|artwork|gallery|zoo)$/.test(tags.tourism)) return 'sight';
  if (tags.historic) return 'sight';
  if (tags.amenity === 'embassy' || tags.office === 'diplomatic' || tags.office === 'government') return 'admin';
  return 'other';
}

const NATURAL = /^(peak|volcano|saddle|ridge|cliff|arch|rock|stone|cave_entrance|glacier|waterfall|hot_spring|geyser|spring|beach|bay|cape|dune|valley|gorge|canyon|wood|heath|wetland)$/;

/** Landscapes and natural sites: peaks, waterfalls, viewpoints, parks and reserves. */
function isNature(tags: Record<string, string>): boolean {
  return (
    NATURAL.test(tags.natural ?? '') ||
    tags.tourism === 'viewpoint' ||
    tags.waterway === 'waterfall' ||
    tags.leisure === 'nature_reserve' ||
    tags.boundary === 'national_park' ||
    tags.boundary === 'protected_area'
  );
}

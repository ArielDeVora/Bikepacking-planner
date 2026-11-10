import { describe, expect, it } from 'vitest';
import { POI_CATEGORIES, POI_CATEGORY_ORDER, poiCategoryFromOmt, poiCategoryFromTags } from './pois';

describe('place categories', () => {
  it('lists every category once, each with its own colour', () => {
    expect(new Set(POI_CATEGORY_ORDER).size).toBe(Object.keys(POI_CATEGORIES).length);
    const colors = POI_CATEGORY_ORDER.map((c) => POI_CATEGORIES[c].color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it('recognises landscapes and natural sites from OSM tags', () => {
    expect(poiCategoryFromTags({ natural: 'peak' })).toBe('nature');
    expect(poiCategoryFromTags({ natural: 'waterfall' })).toBe('nature');
    expect(poiCategoryFromTags({ tourism: 'viewpoint' })).toBe('nature');
    expect(poiCategoryFromTags({ boundary: 'national_park' })).toBe('nature');
    expect(poiCategoryFromTags({ leisure: 'nature_reserve' })).toBe('nature');
    expect(poiCategoryFromTags({ tourism: 'museum' })).toBe('sight');
    expect(poiCategoryFromTags({ historic: 'castle' })).toBe('sight');
    expect(poiCategoryFromTags({ tourism: 'camp_site' })).toBe('camp');
  });

  it('recognises them on the base map too', () => {
    expect(poiCategoryFromOmt('park', 'national_park')).toBe('nature');
    expect(poiCategoryFromOmt('attraction', 'viewpoint')).toBe('nature');
    expect(poiCategoryFromOmt('museum', 'museum')).toBe('sight');
    expect(poiCategoryFromOmt('campsite', 'camp_site')).toBe('camp');
  });
});

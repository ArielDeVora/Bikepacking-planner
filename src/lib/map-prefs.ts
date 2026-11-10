import type { DataDrivenPropertyValueSpecification } from 'maplibre-gl';
import { PLACE_NAMES_ZOOM, type PlaceNames } from '../core/preferences';

/** `text-field` for place labels, following the "Place names" preference. */
export function placeNameField(names: PlaceNames): DataDrivenPropertyValueSpecification<string> {
  if (names === 'never') return '';
  if (names === 'always') return ['get', 'name'];
  return ['step', ['zoom'], '', PLACE_NAMES_ZOOM, ['get', 'name']];
}

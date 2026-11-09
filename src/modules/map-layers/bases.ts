import type { StringKey } from '../../core/i18n';

const OSM = '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors';

interface BaseCommon {
  id: string;
  label: StringKey;
}

/** The core vector style (OpenFreeMap). */
export interface StyleBase extends BaseCommon {
  kind: 'style';
}

export interface RasterBase extends BaseCommon {
  kind: 'raster';
  tiles: string[];
  maxzoom: number;
  attribution: string;
}

export type BaseMap = StyleBase | RasterBase;

const abc = (template: string) => ['a', 'b', 'c'].map((s) => template.replace('{s}', s));

export const BASE_MAPS: BaseMap[] = [
  { id: 'openfreemap', label: 'layers.base.openfreemap', kind: 'style' },
  {
    id: 'osm',
    label: 'layers.base.osm',
    kind: 'raster',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    maxzoom: 19,
    attribution: OSM,
  },
  {
    id: 'cyclosm',
    label: 'layers.base.cyclosm',
    kind: 'raster',
    tiles: abc('https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png'),
    maxzoom: 20,
    attribution: `<a href="https://www.cyclosm.org" target="_blank">CyclOSM</a>, hosted by <a href="https://openstreetmap.fr" target="_blank">OSM France</a> | ${OSM}`,
  },
  {
    id: 'opentopomap',
    label: 'layers.base.opentopomap',
    kind: 'raster',
    tiles: abc('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png'),
    maxzoom: 17,
    attribution: `Map style © <a href="https://opentopomap.org" target="_blank">OpenTopoMap</a> (CC-BY-SA), SRTM | ${OSM}`,
  },
  {
    id: 'satellite',
    label: 'layers.base.satellite',
    kind: 'raster',
    tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2023_3857/default/g/{z}/{y}/{x}.jpg'],
    maxzoom: 15,
    attribution:
      '<a href="https://cloudless.eox.at" target="_blank">EOxCloudless 2023</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2023), CC BY-NC-SA 4.0',
  },
];

export const TERRAIN_DEM = {
  tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
  maxzoom: 15,
  attribution:
    'Elevation: <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank">Mapzen Terrain Tiles</a> (SRTM, GMTED2010, ETOPO1 and others)',
};

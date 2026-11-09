/** Terrarium-encoded elevation tiles (AWS open data, no key): hillshading and elevation lookups. */
export const TERRAIN_DEM = {
  tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
  maxzoom: 15,
  attribution:
    'Elevation: <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank">Mapzen Terrain Tiles</a> (SRTM, GMTED2010, ETOPO1 and others)',
};

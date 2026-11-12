import type { LayerSpecification, Map as MapLibreMap, StyleSpecification } from 'maplibre-gl';

const cache = new Map<string, Promise<StyleSpecification>>();

function loadStyle(url: string): Promise<StyleSpecification> {
  let style = cache.get(url);
  if (!style) {
    style = fetch(url).then((res) => {
      if (!res.ok) throw new Error(`Map style: HTTP ${res.status}`);
      return res.json() as Promise<StyleSpecification>;
    });
    style.catch(() => cache.delete(url));
    cache.set(url, style);
  }
  return style;
}

/**
 * Swaps the base map's own layers for another style's, keeping everything the planner added
 * (routes, places, overlays) and the icons it drew. Both styles must use the same sources.
 * `current` is the ids of the base layers now on the map; returns the new ones, with the
 * visibility each has in its style.
 */
export async function swapBaseLayers(
  map: MapLibreMap,
  url: string,
  current: string[],
  hidden: boolean,
): Promise<{ ids: string[]; defaults: Map<string, 'visible' | 'none' | undefined> }> {
  const style = await loadStyle(url);
  const sources = style.sources ?? {};
  for (const [id, spec] of Object.entries(sources)) if (!map.getSource(id)) map.addSource(id, spec);
  const old = new Set(current);
  const order = map.getStyle().layers ?? [];
  // New layers go where the old ones began: below everything the planner added.
  const anchor = order.find((l) => !old.has(l.id))?.id;
  for (const id of current) if (map.getLayer(id)) map.removeLayer(id);
  const ids: string[] = [];
  const defaults = new Map<string, 'visible' | 'none' | undefined>();
  for (const layer of style.layers as LayerSpecification[]) {
    if (map.getLayer(layer.id)) continue;
    const shown = hidden ? { ...layer, layout: { ...layer.layout, visibility: 'none' as const } } : layer;
    map.addLayer(shown as LayerSpecification, anchor);
    ids.push(layer.id);
    defaults.set(layer.id, (layer.layout as { visibility?: 'visible' | 'none' } | undefined)?.visibility);
  }
  return { ids, defaults };
}

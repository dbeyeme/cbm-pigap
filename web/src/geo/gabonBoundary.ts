/**
 * Contours Gabon réalistes sur MapLibre :
 * - terre : Natural Earth 110m
 * - ZEE : Marine Regions EEZ (simplifiée) CC-BY-4.0
 */
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';

const SOURCE = 'pigap-gabon-boundaries';
const LAND_FILL = 'pigap-gabon-land-fill';
const LAND_LINE = 'pigap-gabon-land-line';
const EEZ_FILL = 'pigap-gabon-eez-fill';
const EEZ_LINE = 'pigap-gabon-eez-line';

let cached: GeoJSON.FeatureCollection | null = null;
let loading: Promise<GeoJSON.FeatureCollection> | null = null;

async function loadBoundaries(): Promise<GeoJSON.FeatureCollection> {
  if (cached) return cached;
  if (!loading) {
    loading = fetch('/geo/gabon-boundaries.geojson')
      .then((r) => {
        if (!r.ok) throw new Error('Contours Gabon indisponibles');
        return r.json();
      })
      .then((data: GeoJSON.FeatureCollection) => {
        cached = data;
        return data;
      })
      .finally(() => {
        loading = null;
      });
  }
  return loading;
}

function ensureLayers(map: MapLibreMap): void {
  if (map.getSource(SOURCE)) return;
  map.addSource(SOURCE, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  map.addLayer({
    id: EEZ_FILL,
    type: 'fill',
    source: SOURCE,
    filter: ['==', ['get', 'layer'], 'eez'],
    paint: {
      'fill-color': '#38bdf8',
      'fill-opacity': 0.12,
    },
  });
  map.addLayer({
    id: EEZ_LINE,
    type: 'line',
    source: SOURCE,
    filter: ['==', ['get', 'layer'], 'eez'],
    paint: {
      'line-color': '#7dd3fc',
      'line-width': 2,
      'line-opacity': 0.9,
      'line-dasharray': [2.5, 1.8],
    },
  });
  map.addLayer({
    id: LAND_FILL,
    type: 'fill',
    source: SOURCE,
    filter: ['==', ['get', 'layer'], 'land'],
    paint: {
      'fill-color': '#14532d',
      'fill-opacity': 0.18,
    },
  });
  map.addLayer({
    id: LAND_LINE,
    type: 'line',
    source: SOURCE,
    filter: ['==', ['get', 'layer'], 'land'],
    paint: {
      'line-color': '#f8fafc',
      'line-width': 2.2,
      'line-opacity': 0.95,
    },
  });
}

/** Dessine le contour terrestre + ZEE Gabon (idempotent). */
export async function syncGabonBoundariesOnMap(map: MapLibreMap): Promise<void> {
  const apply = async () => {
    ensureLayers(map);
    const data = await loadBoundaries();
    const src = map.getSource(SOURCE) as GeoJSONSource | undefined;
    src?.setData(data as never);
  };

  if (map.isStyleLoaded()) await apply();
  else {
    await new Promise<void>((resolve) => {
      map.once('load', () => resolve());
    });
    await apply();
  }
}

export function removeGabonBoundariesFromMap(map: MapLibreMap): void {
  for (const id of [LAND_LINE, LAND_FILL, EEZ_LINE, EEZ_FILL]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource(SOURCE)) map.removeSource(SOURCE);
}

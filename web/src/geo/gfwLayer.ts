import type { Map as MapLibreMap } from 'maplibre-gl';

import type { GfwEvenementPeche } from '../api';

/** Couche des épisodes de pêche apparente (essai Global Fishing Watch). */
export const SOURCE_GFW = 'pigap-gfw-peche';
export const COUCHE_GFW = 'gfw-peche-circles';
export const COUCHE_GFW_HALO = 'gfw-peche-halo';

const COULEUR = '#6d28d9';

function retirer(map: MapLibreMap): void {
  for (const id of [COUCHE_GFW, COUCHE_GFW_HALO]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource(SOURCE_GFW)) map.removeSource(SOURCE_GFW);
}

/**
 * Pose les épisodes de pêche apparente. Un halo plus large capte le clic.
 * `null` retire la couche.
 */
export function syncGfwOnMap(
  map: MapLibreMap,
  evenements: GfwEvenementPeche[] | null,
  selection: string | null,
): void {
  if (!map.isStyleLoaded()) {
    map.once('idle', () => syncGfwOnMap(map, evenements, selection));
    return;
  }
  retirer(map);
  if (!evenements?.length) return;

  map.addSource(SOURCE_GFW, {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: evenements
        .filter((e) => Number.isFinite(e.longitude) && Number.isFinite(e.latitude))
        .map((e) => ({
          type: 'Feature' as const,
          properties: {
            id: e.id,
            vessel_id: e.vessel_id ?? '',
            nom: e.nom ?? '',
            pavillon: e.pavillon ?? '',
            mmsi: e.mmsi ?? '',
            heures: e.heures,
            selected: e.id === selection ? 1 : 0,
          },
          geometry: { type: 'Point' as const, coordinates: [e.longitude, e.latitude] },
        })),
    },
  });
  // Halo d'abord : plus large, sous le point, pour que le clic vise plus facilement.
  // Le rayon suit le zoom : à l'échelle du pays un point de 6 px disparaît.
  map.addLayer({
    id: COUCHE_GFW_HALO,
    type: 'circle',
    source: SOURCE_GFW,
    paint: {
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        4,
        ['case', ['==', ['get', 'selected'], 1], 14, 10],
        8,
        ['case', ['==', ['get', 'selected'], 1], 18, 14],
        12,
        ['case', ['==', ['get', 'selected'], 1], 22, 16],
      ],
      'circle-color': COULEUR,
      'circle-opacity': 0.22,
    },
  });
  map.addLayer({
    id: COUCHE_GFW,
    type: 'circle',
    source: SOURCE_GFW,
    paint: {
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        4,
        ['case', ['==', ['get', 'selected'], 1], 7, 5],
        8,
        ['case', ['==', ['get', 'selected'], 1], 9, 7],
        12,
        ['case', ['==', ['get', 'selected'], 1], 11, 8],
      ],
      'circle-color': COULEUR,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
      'circle-opacity': 0.95,
    },
  });
}

/**
 * Style MapLibre — imagerie satellitaire réelle centrée Gabon.
 * Esri World Imagery (tuiles publiques) + labels Carto clairs en overlay léger.
 */
import type { StyleSpecification } from 'maplibre-gl';

import { GABON_COAST_BOUNDS } from './gabonMaritimeRoutes';

/** Style satellitaire photoréaliste (littoral / estuaire visibles). */
export const GABON_SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  name: 'cbm-pigap-gabon-satellite',
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    // Fond cartographique de secours sous l'imagerie : Esri renvoie des tuiles
    // « Map data not available » en pleine mer aux zooms élevés et sur certaines
    // emprises ; le fond Carto garantit un rendu continu sur tout le golfe de Guinée.
    cartoBase: {
      type: 'raster',
      tiles: ['https://basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}@2x.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors © CARTO',
      maxzoom: 20,
    },
    esriWorldImagery: {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution:
        'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
      maxzoom: 19,
    },
    cartoLabels: {
      type: 'raster',
      tiles: [
        'https://basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors © CARTO',
      maxzoom: 20,
    },
  },
  layers: [
    {
      id: 'gabon-base',
      type: 'raster',
      source: 'cartoBase',
      minzoom: 0,
      maxzoom: 22,
    },
    {
      id: 'gabon-satellite',
      type: 'raster',
      source: 'esriWorldImagery',
      minzoom: 0,
      maxzoom: 22,
    },
    {
      id: 'gabon-labels',
      type: 'raster',
      source: 'cartoLabels',
      minzoom: 5,
      maxzoom: 22,
      paint: { 'raster-opacity': 0.85 },
    },
  ],
};

/** Vue initiale Gabon — littoral Atlantique (Estuaire → Cap Lopez / Mayumba). */
/** Golfe de Guinée : zone de veille AIS élargie (navires en approche). */
export const GULF_OF_GUINEA_BOUNDS: [[number, number], [number, number]] = [
  [-5.5, -9.0],
  [14.0, 7.0],
];

export const GABON_MAP_VIEW = {
  center: [9.05, -0.35] as [number, number],
  zoom: 6.85,
  // Emprise navigable : golfe de Guinée (Côte d'Ivoire → Angola) pour les approches
  maxBounds: [
    [-8.0, -12.0],
    [GABON_COAST_BOUNDS.east + 6.0, 9.5],
  ] as [[number, number], [number, number]],
  fitBounds: [
    [8.35, -3.55],
    [10.85, 1.55],
  ] as [[number, number], [number, number]],
};

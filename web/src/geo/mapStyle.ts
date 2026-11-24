/**
 * Style MapLibre : imagerie satellitaire centrée Gabon, fond et noms de lieux
 * vectoriels OpenStreetMap (ADR-010).
 *
 * Le fond vectoriel et les polices viennent d'un service sans clé ; l'adresse est
 * surchargeable (`VITE_MAP_TILES_URL`) pour basculer vers une copie hébergée par
 * la plateforme sans toucher au code.
 */
import type {
  DataDrivenPropertyValueSpecification,
  ExpressionSpecification,
  FilterSpecification,
  StyleSpecification,
  SymbolLayerSpecification,
} from 'maplibre-gl';

import { GABON_COAST_BOUNDS } from './gabonMaritimeRoutes';

const TILES_ORIGIN = (import.meta.env.VITE_MAP_TILES_URL || 'https://tiles.openfreemap.org').replace(/\/+$/, '');

/**
 * Polices servies par le service de tuiles. Toute couche de texte ajoutée à la
 * carte doit en déclarer une : la police par défaut de MapLibre n'y existe pas.
 */
export const MAP_FONT_REGULAR = ['Noto Sans Regular'];
export const MAP_FONT_BOLD = ['Noto Sans Bold'];
export const MAP_FONT_ITALIC = ['Noto Sans Italic'];

/** Nom français quand il existe, sinon nom en caractères latins. */
const NOM_FR: ExpressionSpecification = [
  'coalesce',
  ['get', 'name:fr'],
  ['get', 'name:latin'],
  ['get', 'name'],
];

const HALO_SUR_IMAGE = 'rgba(7, 24, 46, 0.85)';

type CoucheNoms = {
  id: string;
  sourceLayer: 'place' | 'water_name' | 'waterway';
  filter: FilterSpecification;
  font: string[];
  size: DataDrivenPropertyValueSpecification<number>;
  minzoom?: number;
  maxzoom?: number;
  color?: string;
  layout?: SymbolLayerSpecification['layout'];
};

/** Couche de noms lisible sur l'imagerie : texte clair, halo sombre. */
function coucheNoms(c: CoucheNoms): SymbolLayerSpecification {
  return {
    id: c.id,
    type: 'symbol',
    source: 'osm',
    'source-layer': c.sourceLayer,
    ...(c.minzoom != null ? { minzoom: c.minzoom } : {}),
    ...(c.maxzoom != null ? { maxzoom: c.maxzoom } : {}),
    filter: c.filter,
    layout: {
      'text-field': NOM_FR,
      'text-font': c.font,
      'text-size': c.size,
      'text-max-width': 8,
      ...c.layout,
    },
    paint: {
      'text-color': c.color ?? '#ffffff',
      'text-halo-color': HALO_SUR_IMAGE,
      'text-halo-width': 1.4,
    },
  };
}

const estClasse = (...classes: string[]): ExpressionSpecification => [
  'match',
  ['get', 'class'],
  classes,
  true,
  false,
];

const EN_LIGNE: ExpressionSpecification = [
  'match',
  ['geometry-type'],
  ['LineString', 'MultiLineString'],
  true,
  false,
];

const EN_POINT: ExpressionSpecification = [
  'match',
  ['geometry-type'],
  ['Point', 'MultiPoint'],
  true,
  false,
];

/** Style satellitaire photoréaliste (littoral et estuaires visibles). */
export const GABON_SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  name: 'cbm-pigap-gabon-satellite',
  glyphs: `${TILES_ORIGIN}/fonts/{fontstack}/{range}.pbf`,
  sources: {
    // Fond vectoriel OpenStreetMap : terre, eau et noms de lieux. L'attribution
    // est fournie par le service et affichée automatiquement.
    osm: {
      type: 'vector',
      url: `${TILES_ORIGIN}/planet`,
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
  },
  layers: [
    // Fond de secours sous l'imagerie : terre et mer restent lisibles là où
    // l'imagerie manque (pleine mer aux zooms élevés, tuile en échec).
    { id: 'gabon-terre', type: 'background', paint: { 'background-color': '#2f3b33' } },
    {
      id: 'gabon-eau',
      type: 'fill',
      source: 'osm',
      'source-layer': 'water',
      filter: ['!=', ['get', 'brunnel'], 'tunnel'],
      paint: { 'fill-color': '#0b2740' },
    },
    {
      id: 'gabon-satellite',
      type: 'raster',
      source: 'esriWorldImagery',
      minzoom: 0,
      maxzoom: 22,
    },
    // Noms de lieux : les couches du haut sont placées en premier (pays, capitales).
    coucheNoms({
      id: 'noms-cours-eau',
      sourceLayer: 'waterway',
      minzoom: 9,
      filter: EN_LIGNE,
      font: MAP_FONT_ITALIC,
      size: 12,
      color: '#cfe6ff',
      layout: { 'symbol-placement': 'line', 'symbol-spacing': 350, 'text-letter-spacing': 0.1 },
    }),
    coucheNoms({
      id: 'noms-eaux-lignes',
      sourceLayer: 'water_name',
      filter: EN_LIGNE,
      font: MAP_FONT_ITALIC,
      size: 12,
      color: '#cfe6ff',
      layout: { 'symbol-placement': 'line', 'symbol-spacing': 350, 'text-letter-spacing': 0.1 },
    }),
    coucheNoms({
      id: 'noms-eaux',
      sourceLayer: 'water_name',
      filter: EN_POINT,
      font: MAP_FONT_ITALIC,
      size: ['interpolate', ['linear'], ['zoom'], 3, 10, 8, 13],
      color: '#cfe6ff',
      layout: { 'text-letter-spacing': 0.1, 'text-max-width': 6 },
    }),
    coucheNoms({
      id: 'noms-lieux-dits',
      sourceLayer: 'place',
      minzoom: 10,
      filter: estClasse('island', 'hamlet', 'suburb', 'neighbourhood'),
      font: MAP_FONT_REGULAR,
      size: 11,
    }),
    coucheNoms({
      id: 'noms-villages',
      sourceLayer: 'place',
      minzoom: 9,
      filter: estClasse('village'),
      font: MAP_FONT_REGULAR,
      size: ['interpolate', ['linear'], ['zoom'], 9, 10, 12, 12],
    }),
    coucheNoms({
      id: 'noms-villes-moyennes',
      sourceLayer: 'place',
      minzoom: 6,
      filter: estClasse('town'),
      font: MAP_FONT_REGULAR,
      size: ['interpolate', ['linear'], ['zoom'], 6, 11, 11, 14],
    }),
    coucheNoms({
      id: 'noms-provinces',
      sourceLayer: 'place',
      minzoom: 5,
      maxzoom: 9,
      filter: estClasse('state'),
      font: MAP_FONT_ITALIC,
      size: ['interpolate', ['linear'], ['zoom'], 5, 10, 8, 13],
      color: '#e7eef7',
      layout: { 'text-transform': 'uppercase', 'text-letter-spacing': 0.12, 'text-max-width': 9 },
    }),
    coucheNoms({
      id: 'noms-villes',
      sourceLayer: 'place',
      minzoom: 4,
      filter: ['all', estClasse('city'), ['!=', ['get', 'capital'], 2]],
      font: MAP_FONT_REGULAR,
      size: ['interpolate', ['linear'], ['zoom'], 4, 11, 7, 13, 11, 17],
    }),
    coucheNoms({
      id: 'noms-capitales',
      sourceLayer: 'place',
      minzoom: 3,
      filter: ['all', estClasse('city'), ['==', ['get', 'capital'], 2]],
      font: MAP_FONT_BOLD,
      size: ['interpolate', ['linear'], ['zoom'], 4, 12, 7, 14, 11, 19],
    }),
    coucheNoms({
      id: 'noms-pays',
      sourceLayer: 'place',
      maxzoom: 9,
      filter: estClasse('country'),
      font: MAP_FONT_BOLD,
      size: ['interpolate', ['linear'], ['zoom'], 3, 11, 7, 17],
      layout: { 'text-transform': 'uppercase', 'text-letter-spacing': 0.08, 'text-max-width': 7 },
    }),
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

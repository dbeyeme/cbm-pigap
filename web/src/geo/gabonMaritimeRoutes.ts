/**
 * Corridors démo — générés depuis data/open-data/gabon/ (ZEE Marine Regions + OSM).
 * Ne pas éditer à la main : python backend/scripts/fetch_gabon_opendata.py
 * Licences : CC-BY-4.0 (EEZ) / ODbL 1.0 (OSM) — voir data/open-data/gabon/SOURCES.md
 */

export type MaritimeRouteId =
  'sortie_cote_mer' | 'entree_mondah' | 'remontee_komo' | 'mer_vers_ogooue' | 'ogooue_interieur' | 'rade_port_gentil' | 'entree_etranger' | 'ntem_fleuve' | 'mayumba_cote';

export type MaritimeRoute = {
  id: MaritimeRouteId;
  label: string;
  subtitle: string;
  path: [number, number][];
};

export const GABON_ZONE_BBOX = {
  minLon: 6.5,
  maxLon: 14.5,
  minLat: -6.5,
  maxLat: 2.5,
} as const;

export const GABON_COAST_BOUNDS = {
  west: 8.2,
  south: -3.9,
  east: 11.4,
  north: 2.3,
} as const;

export function isInGabonZone(lon: number, lat: number): boolean {
  return (
    lon >= GABON_ZONE_BBOX.minLon &&
    lon <= GABON_ZONE_BBOX.maxLon &&
    lat >= GABON_ZONE_BBOX.minLat &&
    lat <= GABON_ZONE_BBOX.maxLat
  );
}

function nearDemoCorridor(lon: number, lat: number, maxDeg = 0.08): boolean {
  for (const route of GABON_MARITIME_ROUTES) {
    for (const [x, y] of route.path) {
      if (Math.hypot(lon - x, lat - y) <= maxDeg) return true;
    }
  }
  return false;
}

/** Approximation client ; validation stricte = API water_mask. */
export function isOnWater(lon: number, lat: number): boolean {
  if (!isInGabonZone(lon, lat)) return false;
  if (lon < 9.30 && lat >= -4.0 && lat <= 1.2) return true;
  return nearDemoCorridor(lon, lat);
}

export const GABON_MARITIME_ROUTES: MaritimeRoute[] = [
  {
    id: 'sortie_cote_mer',
    label: "Côte → mer (Estuaire)",
    subtitle: "ZEE Marine Regions — sortie artisanale",
    path: [
      [9.25, 0.28],
      [9.21111, 0.26556],
      [9.17222, 0.25111],
      [9.13333, 0.23667],
      [9.09444, 0.22222],
      [9.05556, 0.20778],
      [9.01667, 0.19333],
      [8.97778, 0.17889],
      [8.93889, 0.16444],
      [8.9, 0.15],
    ],
  },
  {
    id: 'entree_mondah',
    label: "Entrée baie de Mondah",
    subtitle: "ZEE — approche nord Estuaire",
    path: [
      [9.35, 0.72],
      [9.32778, 0.73444],
      [9.30556, 0.74889],
      [9.28333, 0.76333],
      [9.26111, 0.77778],
      [9.23889, 0.78222],
      [9.21667, 0.76667],
      [9.15444, 0.75183],
      [9.17222, 0.75556],
      [9.15, 0.73],
    ],
  },
  {
    id: 'remontee_komo',
    label: "Fleuve Komo",
    subtitle: "OSM Komo / Estuaire intérieur",
    path: [
      [10.59385, 0.47967],
      [10.58237, 0.3799],
      [10.57212, 0.29563],
      [10.51032, 0.2515],
      [10.42416, 0.20333],
      [10.36604, 0.22648],
      [10.28597, 0.24073],
      [10.22608, 0.29571],
      [10.19512, 0.30317],
      [10.16915, 0.22916],
    ],
  },
  {
    id: 'mer_vers_ogooue',
    label: "Ogooué → Lambaréné",
    subtitle: "OSM Ogooué aval (remontée ~9–10.3°E)",
    path: [
      [9.00937, -0.9126],
      [9.01765, -0.94407],
      [9.02133, -0.95086],
      [9.02399, -0.9342],
      [9.09088, -1.03164],
      [9.35391, -1.02536],
      [9.63434, -0.92714],
      [9.91057, -0.82085],
      [10.18016, -0.82165],
      [10.2671, -0.65142],
    ],
  },
  {
    id: 'ogooue_interieur',
    label: "Ogooué intérieur (Lambaréné+)",
    subtitle: "OSM Ogooué moyen (~10–11°E)",
    path: [
      [11.24863, -0.08765],
      [11.15839, -0.06729],
      [11.07234, -0.11928],
      [10.96815, -0.09207],
      [10.88065, -0.1077],
      [10.80012, -0.13802],
      [10.74683, -0.19062],
      [10.64649, -0.18009],
      [10.57813, -0.26347],
      [10.47979, -0.31488],
    ],
  },
  {
    id: 'rade_port_gentil',
    label: "Rade Port-Gentil / Cap Lopez",
    subtitle: "ZEE — pêche / approches",
    path: [
      [8.65, -0.7],
      [8.62222, -0.72222],
      [8.59444, -0.74444],
      [8.56667, -0.76667],
      [8.53889, -0.78889],
      [8.51111, -0.81111],
      [8.48333, -0.83333],
      [8.45556, -0.85556],
      [8.42778, -0.87778],
      [8.4, -0.9],
    ],
  },
  {
    id: 'entree_etranger',
    label: "Navire étranger → ZEE Gabon",
    subtitle: "Approche hauturière (EEZ open data)",
    path: [
      [7.8, -0.2],
      [7.87778, -0.22222],
      [7.95556, -0.24444],
      [8.03333, -0.26667],
      [8.11111, -0.28889],
      [8.18889, -0.31111],
      [8.26667, -0.33333],
      [8.34444, -0.35556],
      [8.42222, -0.37778],
      [8.5, -0.4],
    ],
  },
  {
    id: 'ntem_fleuve',
    label: "Fleuve Ntem",
    subtitle: "OSM Ntem",
    path: [
      [12.3143, 1.97032],
      [12.30177, 2.01811],
      [12.27448, 2.05052],
      [12.24523, 2.07562],
      [12.20694, 2.09182],
      [12.1679, 2.10219],
      [12.13262, 2.12359],
      [12.09876, 2.14085],
      [12.06144, 2.15099],
      [12.04501, 2.14269],
    ],
  },
  {
    id: 'mayumba_cote',
    label: "Mayumba (sud)",
    subtitle: "ZEE — côte sud",
    path: [
      [10.55, -3.35],
      [10.52778, -3.37222],
      [10.50556, -3.39444],
      [10.48333, -3.41667],
      [10.46111, -3.43889],
      [10.43889, -3.46111],
      [10.41667, -3.48333],
      [10.39444, -3.50556],
      [10.37222, -3.52778],
      [10.35, -3.55],
    ],
  },
];

export function getMaritimeRoute(id: MaritimeRouteId): MaritimeRoute {
  const r = GABON_MARITIME_ROUTES.find((x) => x.id === id);
  if (!r) throw new Error(`Route inconnue: ${id}`);
  return r;
}

import type maplibregl from 'maplibre-gl';

import type { MaillesActivite } from '../api';
import { MAP_FONT_REGULAR } from './mapStyle';

/**
 * Couche « Heures d'activité » : une maille par carré de la grille, colorée selon ses heures.
 *
 * Lisible sans la couleur seule : rampe claire vers foncée (lisible en niveaux de gris),
 * numéro de classe repris dans la légende, heures écrites dans chaque maille dès le zoom 9.
 * Aucune animation.
 */

export const SOURCE_ACTIVITE = 'pigap-activite';
export const COUCHE_ACTIVITE = 'pigap-activite-fill';
const COUCHE_CONTOUR = 'pigap-activite-line';
const COUCHE_SELECTION = 'pigap-activite-selection';
const COUCHE_ETIQUETTES = 'pigap-activite-labels';

/** Rampe séquentielle, de la plus claire à la plus foncée (contraste suffisant sur l'imagerie). */
export const COULEURS_CLASSES = ['#fff1a8', '#fdc76b', '#f6913f', '#d9562a', '#9f2a1b'];

export type ClasseActivite = { min: number; max: number; couleur: string; libelle: string };

function arrondiLisible(v: number): number {
  if (v <= 0) return 0;
  if (v < 1) return Math.max(0.1, Math.round(v * 10) / 10);
  if (v < 10) return Math.round(v * 2) / 2;
  if (v < 100) return Math.round(v);
  return Math.round(v / 10) * 10;
}

export function heuresLisibles(h: number): string {
  return `${h.toLocaleString('fr-FR', { maximumFractionDigits: h < 10 ? 2 : 1 })} h`;
}

/**
 * Classes calculées sur les quantiles des heures observées, arrondies à des bornes lisibles.
 * Moins de cinq classes quand les valeurs sont peu nombreuses ou identiques.
 */
export function classesActivite(valeurs: number[]): ClasseActivite[] {
  const tri = valeurs.filter((v) => v > 0).sort((a, b) => a - b);
  if (tri.length === 0) return [];
  const max = tri[tri.length - 1];
  const seuils: number[] = [];
  for (const q of [0.2, 0.4, 0.6, 0.8]) {
    const s = arrondiLisible(tri[Math.min(tri.length - 1, Math.floor(q * tri.length))]);
    if (s > 0 && s < max && !seuils.includes(s) && (seuils.length === 0 || s > seuils[seuils.length - 1])) seuils.push(s);
  }
  const bornes = [0, ...seuils, Number.POSITIVE_INFINITY];
  const n = bornes.length - 1;
  return bornes.slice(0, -1).map((min, i) => {
    const maxi = bornes[i + 1];
    const couleur = COULEURS_CLASSES[Math.round((i * (COULEURS_CLASSES.length - 1)) / Math.max(1, n - 1))];
    const libelle =
      n === 1
        ? `jusqu’à ${heuresLisibles(max)}`
        : i === 0
          ? `moins de ${heuresLisibles(maxi)}`
          : i === n - 1
            ? `${heuresLisibles(min)} et plus`
            : `${heuresLisibles(min)} à ${heuresLisibles(maxi)}`;
    return { min, max: maxi, couleur, libelle };
  });
}

export function classeDe(h: number, classes: ClasseActivite[]): number {
  const i = classes.findIndex((c) => h >= c.min && h < c.max);
  return i < 0 ? classes.length - 1 : i;
}

/** Pose ou met à jour la couche ; `null` la retire. */
export function syncActiviteOnMap(
  map: maplibregl.Map,
  data: MaillesActivite | null,
  classes: ClasseActivite[],
  selection: string | null,
): void {
  if (!map.isStyleLoaded()) {
    map.once('idle', () => syncActiviteOnMap(map, data, classes, selection));
    return;
  }
  if (!data) {
    for (const id of [COUCHE_ETIQUETTES, COUCHE_SELECTION, COUCHE_CONTOUR, COUCHE_ACTIVITE]) {
      if (map.getLayer(id)) map.removeLayer(id);
    }
    if (map.getSource(SOURCE_ACTIVITE)) map.removeSource(SOURCE_ACTIVITE);
    return;
  }
  const collection = {
    type: 'FeatureCollection' as const,
    features: data.features.map((f) => ({
      type: 'Feature' as const,
      id: f.id,
      geometry: f.geometry,
      properties: {
        id: f.id,
        classe: classeDe(f.properties.heures_activite, classes),
        etiquette: heuresLisibles(f.properties.heures_activite),
        heures_activite: f.properties.heures_activite,
        nb_embarcations: f.properties.nb_embarcations,
        nb_intervalles: f.properties.nb_intervalles,
      },
    })),
  };
  const source = map.getSource(SOURCE_ACTIVITE) as maplibregl.GeoJSONSource | undefined;
  if (source) source.setData(collection);
  else map.addSource(SOURCE_ACTIVITE, { type: 'geojson', data: collection });

  const couleur: maplibregl.ExpressionSpecification = [
    'match',
    ['get', 'classe'],
    ...classes.flatMap((c, i) => [i, c.couleur]),
    COULEURS_CLASSES[0],
  ] as unknown as maplibregl.ExpressionSpecification;

  // Les mailles passent sous les zones réglementées quand celles-ci sont déjà posées.
  const avant = map.getLayer('pigap-zones-fill') ? 'pigap-zones-fill' : undefined;
  if (!map.getLayer(COUCHE_ACTIVITE)) {
    map.addLayer(
      { id: COUCHE_ACTIVITE, type: 'fill', source: SOURCE_ACTIVITE, paint: { 'fill-color': couleur, 'fill-opacity': 0.72 } },
      avant,
    );
    map.addLayer(
      {
        id: COUCHE_CONTOUR,
        type: 'line',
        source: SOURCE_ACTIVITE,
        paint: { 'line-color': 'rgba(11, 31, 58, 0.45)', 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.2, 11, 0.8] },
      },
      avant,
    );
    map.addLayer({
      id: COUCHE_SELECTION,
      type: 'line',
      source: SOURCE_ACTIVITE,
      filter: ['==', ['get', 'id'], ''],
      paint: { 'line-color': '#0b1f3a', 'line-width': 3 },
    });
    map.addLayer({
      id: COUCHE_ETIQUETTES,
      type: 'symbol',
      source: SOURCE_ACTIVITE,
      minzoom: 9,
      layout: {
        'text-field': ['get', 'etiquette'],
        'text-font': MAP_FONT_REGULAR,
        'text-size': 11,
        'text-allow-overlap': false,
      },
      paint: { 'text-color': '#0b1526', 'text-halo-color': 'rgba(255, 255, 255, 0.92)', 'text-halo-width': 1.4 },
    });
  } else {
    map.setPaintProperty(COUCHE_ACTIVITE, 'fill-color', couleur);
  }
  map.setFilter(COUCHE_SELECTION, ['==', ['get', 'id'], selection ?? '']);
}

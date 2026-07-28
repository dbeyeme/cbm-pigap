import maplibregl from 'maplibre-gl';

import type { ZoneReglementee } from '../api';

export const ZONE_COLORS: Record<ZoneReglementee['type'], string> = {
  interdite: '#FF9B7A',
  protegee: '#7EB6FF',
  sensible: '#F0C75E',
};

export function zoneColor(type: ZoneReglementee['type']): string {
  return ZONE_COLORS[type];
}

const SOURCE = 'pigap-zones';
const FILL = 'pigap-zones-fill';
const LINE = 'pigap-zones-line';
const LABEL = 'pigap-zones-label';
const PREVIEW = 'pigap-zones-preview';
const PREVIEW_FILL = 'pigap-zones-preview-fill';
const PREVIEW_LINE = 'pigap-zones-preview-line';

export function zoneCentroid(zone: ZoneReglementee): [number, number] | null {
  const ring = zone.geometrie?.coordinates?.[0];
  if (!ring || ring.length < 3) return null;
  const pts = ring.slice(0, -1);
  if (!pts.length) return null;
  const lon = pts.reduce((s, c) => s + Number(c[0]), 0) / pts.length;
  const lat = pts.reduce((s, c) => s + Number(c[1]), 0) / pts.length;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return [lon, lat];
}

/** Clé géométrie grossière pour détecter les superpositions exactes. */
export function geometryKey(zone: ZoneReglementee): string {
  const ring = zone.geometrie?.coordinates?.[0] ?? [];
  return ring.map((c) => `${Number(c[0]).toFixed(4)},${Number(c[1]).toFixed(4)}`).join('|');
}

export function findOverlappingIds(zones: ZoneReglementee[]): Set<string> {
  const groups = new Map<string, string[]>();
  for (const z of zones) {
    const key = geometryKey(z);
    const list = groups.get(key) ?? [];
    list.push(z.id);
    groups.set(key, list);
  }
  const ids = new Set<string>();
  for (const list of groups.values()) {
    if (list.length > 1) list.forEach((id) => ids.add(id));
  }
  return ids;
}

function sanitizePolygon(
  geom: ZoneReglementee['geometrie'] | null | undefined,
): ZoneReglementee['geometrie'] | null {
  const ring = geom?.coordinates?.[0];
  if (!ring || ring.length < 4) return null;
  const cleaned = ring.map((c) => [Number(c[0]), Number(c[1])] as [number, number]);
  if (cleaned.some((c) => !Number.isFinite(c[0]) || !Number.isFinite(c[1]))) return null;
  return { type: 'Polygon', coordinates: [cleaned] };
}

type ZoneFeatureCollection = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: Record<string, unknown>;
    geometry: ZoneReglementee['geometrie'] | { type: 'Point'; coordinates: [number, number] };
  }>;
};

export function zonesToGeoJSON(
  zones: ZoneReglementee[],
  selectedId?: string | null,
): ZoneFeatureCollection {
  const overlap = findOverlappingIds(zones);
  const features: ZoneFeatureCollection['features'] = [];

  // Décalage léger des centroïdes superposés pour que chaque pastille soit visible
  const offsetIndex = new Map<string, number>();

  for (const z of zones) {
    const geom = sanitizePolygon(z.geometrie);
    if (!geom) continue;
    const selected = z.id === selectedId;
    features.push({
      type: 'Feature',
      properties: {
        id: z.id,
        nom: z.nom,
        type: z.type,
        actif: z.actif ? 1 : 0,
        selected: selected ? 1 : 0,
        color: zoneColor(z.type),
        overlap: overlap.has(z.id) ? 1 : 0,
        kind: 'poly',
      },
      geometry: geom,
    });

    const center = zoneCentroid({ ...z, geometrie: geom });
    if (!center) continue;
    const key = geometryKey(z);
    const idx = offsetIndex.get(key) ?? 0;
    offsetIndex.set(key, idx + 1);
    const dx = (idx % 3) * 0.012;
    const dy = Math.floor(idx / 3) * 0.01;
    features.push({
      type: 'Feature',
      properties: {
        id: z.id,
        nom: z.nom.length > 22 ? `${z.nom.slice(0, 20)}…` : z.nom,
        type: z.type,
        actif: z.actif ? 1 : 0,
        selected: selected ? 1 : 0,
        color: zoneColor(z.type),
        kind: 'label',
      },
      geometry: { type: 'Point', coordinates: [center[0] + dx, center[1] + dy] },
    });
  }

  return { type: 'FeatureCollection', features };
}

function ensureLayers(map: maplibregl.Map): void {
  if (map.getSource(SOURCE)) return;
  map.addSource(SOURCE, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });
  map.addLayer({
    id: FILL,
    type: 'fill',
    source: SOURCE,
    filter: ['==', ['get', 'kind'], 'poly'],
    paint: {
      'fill-color': ['get', 'color'],
      'fill-opacity': [
        'case',
        ['==', ['get', 'selected'], 1],
        0.55,
        ['==', ['get', 'actif'], 1],
        0.32,
        0.12,
      ],
    },
  });
  map.addLayer({
    id: LINE,
    type: 'line',
    source: SOURCE,
    filter: ['==', ['get', 'kind'], 'poly'],
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['case', ['==', ['get', 'selected'], 1], 4, 2.2],
      'line-opacity': ['case', ['==', ['get', 'actif'], 1], 0.98, 0.45],
    },
  });
  map.addLayer({
    id: LABEL,
    type: 'symbol',
    source: SOURCE,
    filter: ['==', ['get', 'kind'], 'label'],
    layout: {
      'text-field': ['get', 'nom'],
      'text-size': 12,
      'text-offset': [0, 0.2],
      'text-anchor': 'center',
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'text-color': '#f4fbff',
      'text-halo-color': '#021A22',
      'text-halo-width': 1.6,
      'text-opacity': ['case', ['==', ['get', 'actif'], 1], 1, 0.55],
    },
  });
}

/** Ajoute / met à jour les couches polygones zones sur une carte MapLibre. */
export function syncZonesOnMap(
  map: maplibregl.Map,
  zones: ZoneReglementee[],
  opts?: { selectedId?: string | null; visible?: boolean },
): void {
  if (!map.isStyleLoaded()) return;
  const visible = opts?.visible !== false;
  ensureLayers(map);
  const data = zonesToGeoJSON(visible ? zones : [], opts?.selectedId);
  (map.getSource(SOURCE) as maplibregl.GeoJSONSource).setData(data as never);

  for (const id of [FILL, LINE, LABEL]) {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    }
  }
}

export function syncPreviewBbox(
  map: maplibregl.Map,
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number } | null,
): void {
  if (!map.isStyleLoaded()) return;
  const empty = { type: 'FeatureCollection' as const, features: [] };
  if (!map.getSource(PREVIEW)) {
    map.addSource(PREVIEW, { type: 'geojson', data: empty });
    map.addLayer({
      id: PREVIEW_FILL,
      type: 'fill',
      source: PREVIEW,
      paint: { 'fill-color': '#7FE0D3', 'fill-opacity': 0.22 },
    });
    map.addLayer({
      id: PREVIEW_LINE,
      type: 'line',
      source: PREVIEW,
      paint: {
        'line-color': '#7FE0D3',
        'line-width': 2.5,
        'line-dasharray': [2, 1.5],
      },
    });
  }
  if (!bbox) {
    (map.getSource(PREVIEW) as maplibregl.GeoJSONSource).setData(empty);
    return;
  }
  const { minLon, minLat, maxLon, maxLat } = bbox;
  (map.getSource(PREVIEW) as maplibregl.GeoJSONSource).setData({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [minLon, minLat],
              [maxLon, minLat],
              [maxLon, maxLat],
              [minLon, maxLat],
              [minLon, minLat],
            ],
          ],
        },
      },
    ],
  } as never);
}

export function removeZonesFromMap(map: maplibregl.Map): void {
  for (const id of [LABEL, LINE, FILL, PREVIEW_LINE, PREVIEW_FILL]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  for (const id of [SOURCE, PREVIEW]) {
    if (map.getSource(id)) map.removeSource(id);
  }
}

export function fitMapToZones(map: maplibregl.Map, zones: ZoneReglementee[]): void {
  const coords: [number, number][] = [];
  for (const z of zones) {
    const geom = sanitizePolygon(z.geometrie);
    if (!geom) continue;
    for (const c of geom.coordinates[0]) coords.push(c);
  }
  if (!coords.length) return;
  const bounds = coords.reduce(
    (b, c) => b.extend(c),
    new maplibregl.LngLatBounds(coords[0], coords[0]),
  );
  map.fitBounds(bounds, { padding: 64, maxZoom: 10, duration: 600 });
}

export function fitMapToZone(map: maplibregl.Map, zone: ZoneReglementee): void {
  fitMapToZones(map, [zone]);
}

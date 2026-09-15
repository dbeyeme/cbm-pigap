import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import maplibregl from 'maplibre-gl';

/** Décalage dasharray pour effet « flux » sur les trajectoires. */
const DASH_FRAMES: [number, number][] = [
  [0, 4],
  [1, 4],
  [2, 4],
  [3, 4],
  [4, 4],
  [5, 4],
  [6, 4],
  [7, 4],
];

export type FlowAnimHandle = { stop: () => void };

export type VesselKind = 'pirogue' | 'navire';

/** Anime le dasharray d'une couche ligne MapLibre (flux maritime). */
export function startLineFlowAnimation(
  map: MapLibreMap,
  layerId: string,
  intervalMs = 160,
): FlowAnimHandle {
  let frame = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  const tick = () => {
    if (!map.getLayer(layerId)) return;
    try {
      map.setPaintProperty(layerId, 'line-dasharray', DASH_FRAMES[frame % DASH_FRAMES.length]);
      frame += 1;
    } catch {
      /* couche retirée */
    }
  };

  timer = setInterval(tick, intervalMs);
  return {
    stop: () => {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}

/** SVG inline — pas de fetch /icons (évite les « ? » cassés). */
function svgPirogue(): string {
  return `<svg class="ship-marker-svg" viewBox="0 0 40 40" width="36" height="36" aria-hidden="true">
    <ellipse cx="20" cy="30" rx="14" ry="3" fill="#001a3d" opacity="0.35"/>
    <path d="M4 26c2-1.2 7-2.4 16-2.4S34 24.8 36 26c-1.5 2.8-6.5 5-16 5S5.5 28.8 4 26Z" fill="#1a1208"/>
    <path d="M8 25.2c1.8-.6 5.5-1.1 12-1.1s10.2.5 12 1.1" stroke="#e8c48a" stroke-width="1.2" fill="none"/>
    <path d="M20 24.5V12" stroke="#8b6914" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M20 12.2 28 21H12L20 12.2Z" fill="#f5edd8" stroke="#8b6914" stroke-width="1"/>
    <circle cx="20" cy="10.2" r="1.8" fill="#f59e0b"/>
  </svg>`;
}

function svgNavire(): string {
  return `<svg class="ship-marker-svg" viewBox="0 0 40 40" width="36" height="36" aria-hidden="true">
    <ellipse cx="20" cy="31" rx="13" ry="2.8" fill="#001a3d" opacity="0.3"/>
    <path d="M5 26h28l-2.5 5.5H7.5L5 26Z" fill="#0b1f3a"/>
    <path d="M8 26V18h14v8" fill="#1e4d7b"/>
    <path d="M22 18h7v5h-7z" fill="#2563a8"/>
    <rect x="10" y="14" width="3.5" height="4" rx="0.5" fill="#cbd5e1"/>
    <rect x="15" y="12.5" width="3.5" height="5.5" rx="0.5" fill="#cbd5e1"/>
    <path d="M29 19.5h4l1.5 4H27.5l1.5-4Z" fill="#f59e0b"/>
    <circle cx="32" cy="16" r="1.4" fill="#ef4444"/>
  </svg>`;
}

function svgAlertPin(): string {
  return `<svg class="alert-marker-svg" viewBox="0 0 32 40" width="26" height="32" aria-hidden="true">
    <path d="M16 2C9.4 2 4 7.4 4 14c0 9 12 24 12 24s12-15 12-24c0-6.6-5.4-12-12-12Z" fill="#dc2626"/>
    <circle cx="16" cy="14" r="5.5" fill="#fff"/>
    <path d="M16 10.5v5" stroke="#991b1b" stroke-width="2" stroke-linecap="round"/>
    <circle cx="16" cy="18.2" r="1.1" fill="#991b1b"/>
  </svg>`;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Marqueur HTML : pirogue / navire (SVG inline). */
export function createShipMarkerElement(opts?: {
  alert?: boolean;
  kind?: VesselKind;
  label?: string;
  statut?: string;
}): HTMLDivElement {
  const kind = opts?.kind ?? 'pirogue';
  const el = document.createElement('div');
  const statut = opts?.statut ? ` ship-marker--${opts.statut}` : '';
  el.className = `ship-marker ship-marker--${kind}${opts?.alert ? ' ship-marker--alert' : ''}${statut}`;
  const label = opts?.label
    ? `<span class="ship-marker-label">${escapeHtml(opts.label)}</span>`
    : '';
  el.innerHTML = `
    <span class="radar-ring" aria-hidden="true"></span>
    <span class="radar-ring radar-ring--delay" aria-hidden="true"></span>
    ${kind === 'navire' ? svgNavire() : svgPirogue()}
    ${label}
  `;
  if (opts?.label) el.title = opts.label;
  return el;
}

/** Épingle alerte géolocalisée (SVG inline). */
export function createAlertMarkerElement(opts?: { label?: string }): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'alert-map-marker';
  el.title = opts?.label ?? 'Alerte';
  el.innerHTML = `
    ${svgAlertPin()}
    <span class="alert-map-pulse" aria-hidden="true"></span>
  `;
  return el;
}

export function placeShipMarkers(
  map: MapLibreMap,
  points: Array<{
    lng: number;
    lat: number;
    alert?: boolean;
    kind?: VesselKind;
    label?: string;
    statut?: string;
  }>,
  store: Marker[],
): void {
  for (const m of store) m.remove();
  store.length = 0;
  for (const p of points) {
    if (!Number.isFinite(p.lng) || !Number.isFinite(p.lat)) continue;
    const marker = new maplibregl.Marker({
      element: createShipMarkerElement({
        alert: p.alert,
        kind: p.kind,
        label: p.label,
        statut: p.statut,
      }),
      anchor: 'center',
      pitchAlignment: 'viewport',
      rotationAlignment: 'viewport',
    })
      .setLngLat([p.lng, p.lat])
      .addTo(map);
    const root = marker.getElement();
    root.style.zIndex = '2';
    root.style.overflow = 'visible';
    store.push(marker);
  }
}

export function placeAlertMarkers(
  map: MapLibreMap,
  points: Array<{ lng: number; lat: number; label?: string }>,
  store: Marker[],
  opts?: { max?: number },
): void {
  for (const m of store) m.remove();
  store.length = 0;
  const max = opts?.max ?? 40;
  for (const p of points.slice(0, max)) {
    if (!Number.isFinite(p.lng) || !Number.isFinite(p.lat)) continue;
    const marker = new maplibregl.Marker({
      element: createAlertMarkerElement({ label: p.label }),
      anchor: 'bottom',
    })
      .setLngLat([p.lng, p.lat])
      .addTo(map);
    store.push(marker);
  }
}

/** Silhouette AIS (cargo / radar) — distincte des pirogues / chaloupes PIGAP. */
function svgAis(): string {
  return `<svg class="ais-marker-svg" viewBox="0 0 40 40" width="34" height="34" aria-hidden="true">
    <ellipse cx="20" cy="31" rx="12" ry="2.4" fill="#431407" opacity="0.35"/>
    <path d="M6 27h28l-3 5H9l-3-5Z" fill="#9a3412"/>
    <path d="M10 27V17h16v10" fill="#c2410c"/>
    <path d="M26 17h6v6h-6z" fill="#ea580c"/>
    <rect x="12" y="13" width="3" height="4" rx="0.4" fill="#fed7aa"/>
    <rect x="17" y="11" width="3" height="6" rx="0.4" fill="#fed7aa"/>
    <rect x="22" y="14" width="3" height="3" rx="0.4" fill="#fed7aa"/>
    <path d="M20 11V6" stroke="#fdba74" stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="20" cy="5" r="2" fill="#fbbf24"/>
  </svg>`;
}

/** Marqueur AIS open data — badge + silhouette distincte des GPS PIGAP. */
export function createAisMarkerElement(opts?: {
  label?: string;
  demo?: boolean;
}): HTMLDivElement {
  const el = document.createElement('div');
  el.className = `ais-marker${opts?.demo ? ' ais-marker--demo' : ''}`;
  const title = opts?.label
    ? `<span class="ais-marker-label">${escapeHtml(opts.label)}</span>`
    : '';
  el.innerHTML = `
    <span class="ais-pulse" aria-hidden="true"></span>
    ${svgAis()}
    <span class="ais-badge">${opts?.demo ? 'AIS démo' : 'AIS'}</span>
    ${title}
  `;
  if (opts?.label) el.title = opts.label;
  return el;
}

export function placeAisMarkers(
  map: MapLibreMap,
  points: Array<{ lng: number; lat: number; label?: string; demo?: boolean }>,
  store: Marker[],
  opts?: { max?: number },
): void {
  for (const m of store) m.remove();
  store.length = 0;
  const max = opts?.max ?? 48;
  for (const p of points.slice(0, max)) {
    if (!Number.isFinite(p.lng) || !Number.isFinite(p.lat)) continue;
    const marker = new maplibregl.Marker({
      element: createAisMarkerElement({ label: p.label, demo: p.demo }),
      anchor: 'center',
    })
      .setLngLat([p.lng, p.lat])
      .addTo(map);
    store.push(marker);
  }
}

export function clearMarkers(store: Marker[]): void {
  for (const m of store) m.remove();
  store.length = 0;
}

/** Extrait [lng, lat] depuis declencheur.position (GeoJSON Point). */
export function coordsFromDeclencheur(
  declencheur: Record<string, unknown> | null | undefined,
): [number, number] | null {
  if (!declencheur) return null;
  const pos = declencheur.position as
    | { type?: string; coordinates?: unknown }
    | undefined;
  const coords = pos?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (lng < -20 || lng > 30 || lat < -10 || lat > 10) return null;
  return [lng, lat];
}

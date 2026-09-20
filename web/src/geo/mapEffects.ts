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
  /** Regroupe les alertes quasi-identiques (évite une colonne d'épingles empilées). */
  const clusters = new Map<string, { lng: number; lat: number; label: string; count: number }>();
  for (const p of points) {
    if (!Number.isFinite(p.lng) || !Number.isFinite(p.lat)) continue;
    const key = `${p.lng.toFixed(3)},${p.lat.toFixed(3)}`;
    const prev = clusters.get(key);
    if (prev) {
      prev.count += 1;
      continue;
    }
    clusters.set(key, {
      lng: p.lng,
      lat: p.lat,
      label: p.label ?? 'Alerte',
      count: 1,
    });
  }
  for (const c of [...clusters.values()].slice(0, max)) {
    const label = c.count > 1 ? `${c.label} (×${c.count})` : c.label;
    const marker = new maplibregl.Marker({
      element: createAlertMarkerElement({ label }),
      anchor: 'bottom',
    })
      .setLngLat([c.lng, c.lat])
      .addTo(map);
    store.push(marker);
  }
}

/** Silhouette AIS (cargo / radar) — distincte des pirogues / chaloupes PIGAP. */
/* ---------------------------------------------------------------------------
   Silhouettes de navires (vue de dessus) — cohérentes, orientées, dimensionnées.
   Type AIS → forme ; cap → rotation ; longueur → taille ; statut → couleur.
   --------------------------------------------------------------------------- */

export type VesselSilhouette =
  | 'cargo'
  | 'tanker'
  | 'peche'
  | 'passagers'
  | 'remorqueur'
  | 'plaisance'
  | 'pirogue'
  | 'inconnu';

export function silhouetteForType(typeLabel?: string | null, shipType?: string | null): VesselSilhouette {
  const t = (typeLabel ?? '').toLowerCase();
  const code = Number(shipType);
  if (t.includes('pêche') || code === 30) return 'peche';
  if (t.includes('pétrolier') || (code >= 80 && code <= 89)) return 'tanker';
  if (t.includes('cargo') || (code >= 70 && code <= 79)) return 'cargo';
  if (t.includes('passagers') || (code >= 60 && code <= 69)) return 'passagers';
  if (t.includes('remorqueur') || t.includes('pilot') || code === 31 || code === 32 || code === 52 || code === 50) return 'remorqueur';
  if (t.includes('voilier') || t.includes('plaisance') || code === 36 || code === 37) return 'plaisance';
  return 'inconnu';
}

const STATUT_COLORS: Record<string, { hull: string; deck: string }> = {
  a_quai: { hull: '#0d4f82', deck: '#7cc4ff' },
  au_mouillage: { hull: '#1b6ca8', deck: '#bfdbfe' },
  en_route: { hull: '#c2410c', deck: '#fed7aa' },
  en_route_voile: { hull: '#c2410c', deck: '#fed7aa' },
  en_peche: { hull: '#15803d', deck: '#bbf7d0' },
  approche: { hull: '#475569', deck: '#cbd5e1' },
  alerte: { hull: '#c81e1e', deck: '#fecaca' },
  inconnu: { hull: '#64748b', deck: '#e2e8f0' },
};

/** Silhouette vue de dessus, proue vers le haut (0°). viewBox 40×40. */
function svgHull(kind: VesselSilhouette, hull: string, deck: string): string {
  switch (kind) {
    case 'cargo':
      return `<path d="M20 3 L27 11 V34 Q20 38 13 34 V11 Z" fill="${hull}"/>
        <rect x="15" y="12" width="10" height="4" fill="${deck}"/><rect x="15" y="18" width="10" height="4" fill="${deck}"/>
        <rect x="15" y="24" width="10" height="4" fill="${deck}"/><rect x="16" y="30" width="8" height="4" rx="1" fill="#fff"/>`;
    case 'tanker':
      return `<path d="M20 3 L27 10 V34 Q20 38 13 34 V10 Z" fill="${hull}"/>
        <path d="M17 12 V29 M20 12 V29 M23 12 V29" stroke="${deck}" stroke-width="1.6"/>
        <rect x="16" y="30" width="8" height="4" rx="1" fill="#fff"/>`;
    case 'peche':
      return `<path d="M20 4 L26 12 V32 Q20 37 14 32 V12 Z" fill="${hull}"/>
        <rect x="16" y="13" width="8" height="7" rx="1.5" fill="#fff"/>
        <path d="M20 21 V33 M14 27 H26" stroke="${deck}" stroke-width="1.6" stroke-linecap="round"/>`;
    case 'passagers':
      return `<path d="M20 3 L26 9 V34 Q20 38 14 34 V9 Z" fill="${hull}"/>
        <rect x="15.5" y="10" width="9" height="22" rx="3" fill="#fff"/>
        <path d="M18 14 H22 M18 18 H22 M18 22 H22 M18 26 H22" stroke="${deck}" stroke-width="1.4"/>`;
    case 'remorqueur':
      return `<path d="M20 6 L25 12 V31 Q20 36 15 31 V12 Z" fill="${hull}"/>
        <rect x="16.5" y="12" width="7" height="8" rx="2" fill="#fff"/><circle cx="20" cy="27" r="2.5" fill="${deck}"/>`;
    case 'plaisance':
      return `<path d="M20 4 L24.5 14 V32 Q20 36 15.5 32 V14 Z" fill="${hull}"/>
        <path d="M20 8 V30" stroke="#fff" stroke-width="1.5"/><path d="M20 10 L28 26 H20 Z" fill="${deck}" opacity="0.9"/>`;
    case 'pirogue':
      return `<path d="M20 5 Q25 14 24 30 Q20 36 16 30 Q15 14 20 5 Z" fill="${hull}"/>
        <path d="M20 9 V31" stroke="${deck}" stroke-width="1.2" opacity="0.8"/>`;
    default:
      return `<path d="M20 4 L26 12 V33 Q20 38 14 33 V12 Z" fill="${hull}"/><circle cx="20" cy="22" r="3" fill="#fff"/>`;
  }
}

function svgVessel(kind: VesselSilhouette, statut: string, headingDeg: number | null, px: number): string {
  const c = STATUT_COLORS[statut] ?? STATUT_COLORS.inconnu;
  const rot = headingDeg == null ? 0 : headingDeg;
  const wake =
    statut === 'en_route' || statut === 'en_route_voile' || statut === 'en_peche' || statut === 'approche'
      ? `<path d="M16 36 Q20 44 24 36" stroke="${c.deck}" stroke-width="1.5" fill="none" opacity="0.8"/>
         <path d="M14 38 Q20 48 26 38" stroke="${c.deck}" stroke-width="1" fill="none" opacity="0.45"/>`
      : '';
  return `<svg class="vessel-svg" viewBox="0 0 40 50" width="${px}" height="${Math.round(px * 1.25)}" aria-hidden="true">
    <g transform="rotate(${rot} 20 22)">
      <ellipse cx="20" cy="24" rx="9" ry="16" fill="#000" opacity="0.18"/>
      ${svgHull(kind, c.hull, c.deck)}
      ${wake}
    </g>
  </svg>`;
}

/** Marqueur AIS : silhouette orientée + pastille pavillon + libellé. */
export function createAisMarkerElement(opts?: {
  label?: string;
  demo?: boolean;
  approche?: boolean;
  onClick?: () => void;
  kind?: VesselSilhouette;
  statut?: string;
  headingDeg?: number | null;
  lengthM?: number | null;
  flagCode?: string | null;
  name?: string;
}): HTMLDivElement {
  const el = document.createElement('div');
  const statut = opts?.approche ? 'approche' : (opts?.statut ?? 'inconnu');
  el.className = `ais-marker vessel-marker vessel-marker--${statut}${opts?.demo ? ' ais-marker--demo' : ''}${opts?.approche ? ' ais-marker--approche' : ''}${opts?.onClick ? ' ais-marker--clickable' : ''}`;
  if (opts?.onClick) {
    el.style.pointerEvents = 'auto';
    el.style.cursor = 'pointer';
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      opts.onClick?.();
    });
  }
  const len = opts?.lengthM ?? null;
  // Taille : 26 px pour une pirogue, jusqu'à 46 px pour un navire de 200 m et plus
  const px = len == null ? 32 : Math.max(26, Math.min(46, 24 + Math.sqrt(len) * 1.6));
  const kind = opts?.kind ?? 'inconnu';
  const flag = opts?.flagCode ? `<span class="vessel-flag" title="Pavillon ${escapeHtml(opts.flagCode)}">${escapeHtml(opts.flagCode)}</span>` : '';
  const name = opts?.name ? `<span class="vessel-name">${escapeHtml(opts.name)}</span>` : '';
  const sub = opts?.label ? `<span class="vessel-sub">${escapeHtml(opts.label)}</span>` : '';
  el.innerHTML = `
    <span class="ais-pulse" aria-hidden="true"></span>
    ${svgVessel(kind, statut, opts?.headingDeg ?? null, px)}
    <span class="vessel-chip">${flag}${name}${sub}</span>
  `;
  if (opts?.name || opts?.label) el.title = [opts?.name, opts?.label].filter(Boolean).join(' · ');
  return el;
}

export function placeAisMarkers(
  map: MapLibreMap,
  points: Array<{
    lng: number;
    lat: number;
    label?: string;
    demo?: boolean;
    approche?: boolean;
    mmsi?: string;
    kind?: VesselSilhouette;
    statut?: string;
    headingDeg?: number | null;
    lengthM?: number | null;
    flagCode?: string | null;
    name?: string;
  }>,
  store: Marker[],
  opts?: { max?: number; onSelect?: (mmsi: string) => void },
): void {
  for (const m of store) m.remove();
  store.length = 0;
  const max = opts?.max ?? 64;
  for (const p of points.slice(0, max)) {
    if (!Number.isFinite(p.lng) || !Number.isFinite(p.lat)) continue;
    const onSelect = opts?.onSelect;
    const marker = new maplibregl.Marker({
      element: createAisMarkerElement({
        label: p.label,
        demo: p.demo,
        approche: p.approche,
        onClick: onSelect && p.mmsi ? () => onSelect(p.mmsi as string) : undefined,
        kind: p.kind,
        statut: p.statut,
        headingDeg: p.headingDeg,
        lengthM: p.lengthM,
        flagCode: p.flagCode,
        name: p.name,
      }),
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

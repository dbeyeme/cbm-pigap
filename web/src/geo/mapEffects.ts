import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import maplibregl from 'maplibre-gl';

import {
  escapeHtml,
  libelleStatut,
  normaliserStatut,
  svgAlerte,
  svgMedaillon,
  svgRegroupement,
  svgSilhouette,
  type FleetStatut,
  type VesselSilhouette,
} from './vesselMarkers';

export type { VesselSilhouette } from './vesselMarkers';

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

export type FleetPoint = {
  lng: number;
  lat: number;
  alert?: boolean;
  kind?: VesselKind;
  label?: string;
  statut?: string;
  id?: string;
  regularite?: string;
  regulariteLibelle?: string | null;
  ageLibelle?: string | null;
  perimee?: boolean;
};

type FleetState = {
  map: MapLibreMap;
  points: FleetPoint[];
  onSelect?: (id: string) => void;
  redraw: () => void;
  /** Empreinte des positions affichées : un rafraîchissement sans changement ne redessine rien. */
  signature: string;
};

function signatureFlotte(points: FleetPoint[]): string {
  return points
    .map(
      (p) =>
        `${p.id ?? ''}|${p.lng.toFixed(5)}|${p.lat.toFixed(5)}|${p.statut ?? ''}|${p.alert ? 1 : 0}|${p.kind ?? ''}|${p.label ?? ''}|${p.regularite ?? ''}|${p.ageLibelle ?? ''}|${p.perimee ? 1 : 0}`,
    )
    .join(';');
}

/** Distance à l'écran, en pixels, sous laquelle deux embarcations sont regroupées. */
const RAYON_REGROUPEMENT = 40;
/** Zoom à partir duquel les noms s'affichent sans survol. */
const ZOOM_NOMS = 9.5;

const fleets = new WeakMap<Marker[], FleetState>();
const cartesSuivies = new WeakSet<MapLibreMap>();
let listeOuverte: maplibregl.Popup | null = null;

/** Affiche les noms à fort zoom seulement : à l'échelle du pays, la carte reste lisible. */
function suivreZoom(map: MapLibreMap): void {
  const appliquer = () =>
    map.getContainer().classList.toggle('vm-zoom-pres', map.getZoom() >= ZOOM_NOMS);
  appliquer();
  if (cartesSuivies.has(map)) return;
  cartesSuivies.add(map);
  map.on('zoom', appliquer);
}

function statutDe(p: FleetPoint): FleetStatut {
  return normaliserStatut(p.alert ? 'silence' : p.statut);
}

/** Médaillon d'une embarcation suivie : pointe sur la position, nom au survol ou à fort zoom. */
function createFleetMarkerElement(p: FleetPoint, selectable: boolean): HTMLDivElement {
  const statut = statutDe(p);
  const el = document.createElement('div');
  el.className = `vm vm--fleet vm--${statut}${selectable ? ' vm--clickable' : ''}${
    p.regularite === 'alerte' ? ' vm--ctrl' : p.regularite === 'a_verifier' ? ' vm--verif' : ''
  }`;
  const nom = p.label ? `<span class="vm-label">${escapeHtml(p.label)}</span>` : '';
  el.innerHTML = `${svgMedaillon(p.kind ?? 'pirogue', statut, p.regularite)}${nom}`;
  el.title = [
    p.label,
    libelleStatut(statut),
    p.regulariteLibelle,
    p.ageLibelle,
    p.perimee ? 'position périmée' : '',
    selectable ? 'ouvrir la fiche' : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return el;
}

function createClusterElement(groupe: FleetPoint[]): HTMLDivElement {
  const parts: Record<FleetStatut, number> = { actif: 0, recent: 0, silence: 0, neutre: 0 };
  for (const p of groupe) parts[statutDe(p)] += 1;
  const nCtrl = groupe.filter((p) => p.regularite === 'alerte').length;
  const el = document.createElement('div');
  el.className = `vm vm--cluster vm--clickable${nCtrl ? ' vm--ctrl' : ''}`;
  const marque = nCtrl
    ? `<span class="vm-ctrl" title="${nCtrl} navire${nCtrl > 1 ? 's' : ''} à contrôler"></span>`
    : '';
  el.innerHTML = `${svgRegroupement(parts)}${marque}`;
  const detail = (['actif', 'recent', 'silence'] as const)
    .filter((s) => parts[s] > 0)
    .map((s) => `${parts[s]} ${libelleStatut(s)}`)
    .join(', ');
  const ctrl = nCtrl ? `${nCtrl} à contrôler` : '';
  el.title = `${groupe.length} embarcations${detail ? ` : ${detail}` : ''}${ctrl ? ` · ${ctrl}` : ''}`;
  return el;
}

/** Regroupement glouton à l'écran : suffisant pour quelques centaines de positions. */
function regrouper(map: MapLibreMap, points: FleetPoint[]): FleetPoint[][] {
  const ecran = points.map((p) => map.project([p.lng, p.lat]));
  const pris = new Array<boolean>(points.length).fill(false);
  const groupes: FleetPoint[][] = [];
  const r2 = RAYON_REGROUPEMENT * RAYON_REGROUPEMENT;
  for (let i = 0; i < points.length; i += 1) {
    if (pris[i]) continue;
    pris[i] = true;
    const groupe = [points[i]];
    for (let j = i + 1; j < points.length; j += 1) {
      if (pris[j]) continue;
      const dx = ecran[i].x - ecran[j].x;
      const dy = ecran[i].y - ecran[j].y;
      if (dx * dx + dy * dy <= r2) {
        pris[j] = true;
        groupe.push(points[j]);
      }
    }
    groupes.push(groupe);
  }
  return groupes;
}

/** Liste des embarcations d'un groupe trop serré pour être séparé par le zoom. */
function ouvrirListe(
  map: MapLibreMap,
  centre: [number, number],
  groupe: FleetPoint[],
  onSelect?: (id: string) => void,
): void {
  listeOuverte?.remove();
  const racine = document.createElement('div');
  racine.className = 'vm-list';
  const max = 10;
  const lignes = groupe
    .slice(0, max)
    .map((p, i) => {
      const statut = statutDe(p);
      const suite = p.regulariteLibelle || libelleStatut(statut);
      const contenu = `<i class="vm-dot vm-dot--${statut}" aria-hidden="true"></i><span>${escapeHtml(p.label ?? 'Embarcation')}</span><em>${escapeHtml(suite)}</em>`;
      return onSelect && p.id
        ? `<li><button type="button" class="vm-list-item" data-i="${i}">${contenu}</button></li>`
        : `<li><span class="vm-list-item">${contenu}</span></li>`;
    })
    .join('');
  const reste = groupe.length - max;
  racine.innerHTML = `
    <header class="vm-list-head">
      <strong>${groupe.length} embarcations au même endroit</strong>
      <button type="button" class="vm-list-close">Fermer</button>
    </header>
    <ul>${lignes}</ul>
    ${reste > 0 ? `<p class="vm-list-more">et ${reste} autres : ouvrez le panneau Navires pour la liste complète.</p>` : ''}`;
  const popup = new maplibregl.Popup({
    closeButton: false,
    maxWidth: '300px',
    offset: 26,
    className: 'vm-popup',
  })
    .setLngLat(centre)
    .setDOMContent(racine)
    .addTo(map);
  listeOuverte = popup;
  racine.querySelector('.vm-list-close')?.addEventListener('click', () => popup.remove());
  racine.querySelectorAll<HTMLButtonElement>('button.vm-list-item').forEach((b) => {
    b.addEventListener('click', () => {
      const p = groupe[Number(b.dataset.i)];
      if (p?.id) onSelect?.(p.id);
      popup.remove();
    });
  });
}

function dessinerFlotte(store: Marker[]): void {
  const etat = fleets.get(store);
  if (!etat) return;
  for (const m of store) m.remove();
  store.length = 0;
  const { map, points } = etat;
  const onSelect = etat.onSelect ? (id: string) => etat.onSelect?.(id) : undefined;
  for (const groupe of regrouper(map, points)) {
    if (groupe.length === 1) {
      const p = groupe[0];
      const selectable = Boolean(onSelect && p.id);
      const el = createFleetMarkerElement(p, selectable);
      if (selectable) {
        const id = p.id as string;
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          onSelect?.(id);
        });
      }
      store.push(
        new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([p.lng, p.lat]).addTo(map),
      );
      continue;
    }
    const bounds = new maplibregl.LngLatBounds();
    for (const p of groupe) bounds.extend([p.lng, p.lat]);
    const c = bounds.getCenter();
    const centre: [number, number] = [c.lng, c.lat];
    const el = createClusterElement(groupe);
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const so = map.project(bounds.getSouthWest());
      const ne = map.project(bounds.getNorthEast());
      const etendue = Math.hypot(ne.x - so.x, ne.y - so.y);
      // Groupe étalé : le zoom le sépare. Groupe serré (même quai) : la liste le détaille.
      if (etendue > 24 && map.getZoom() < 13) {
        map.fitBounds(bounds, { padding: 110, maxZoom: 14, duration: 500 });
      } else {
        ouvrirListe(map, centre, groupe, onSelect);
      }
    });
    store.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(centre).addTo(map));
  }
}

function detacherFlotte(store: Marker[]): void {
  const etat = fleets.get(store);
  if (!etat) return;
  etat.map.off('zoomend', etat.redraw);
  fleets.delete(store);
}

/**
 * Place les embarcations suivies par la plateforme. Celles qui se chevauchent à
 * l'écran sont réunies dans un médaillon chiffré, recalculé à chaque fin de zoom.
 */
export function placeShipMarkers(
  map: MapLibreMap,
  points: FleetPoint[],
  store: Marker[],
  opts?: { onSelect?: (id: string) => void },
): void {
  const valides = points.filter((p) => Number.isFinite(p.lng) && Number.isFinite(p.lat));
  const signature = signatureFlotte(valides);
  const precedent = fleets.get(store);
  // Le suivi en direct rappelle cette fonction toutes les vingt secondes : sans changement,
  // les marqueurs restent en place (pas de clignotement, pas de clic perdu sur un marqueur remplacé).
  if (precedent && precedent.map === map && precedent.signature === signature && store.length > 0) {
    precedent.onSelect = opts?.onSelect;
    return;
  }
  detacherFlotte(store);
  const etat: FleetState = {
    map,
    points: valides,
    onSelect: opts?.onSelect,
    redraw: () => {
      // Le zoom change les regroupements : une liste ouverte ne correspond plus à rien.
      listeOuverte?.remove();
      listeOuverte = null;
      dessinerFlotte(store);
    },
    signature,
  };
  fleets.set(store, etat);
  map.on('zoomend', etat.redraw);
  suivreZoom(map);
  dessinerFlotte(store);
}

/** Épingle d'alerte géolocalisée. */
export function createAlertMarkerElement(opts?: { label?: string }): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'vm vm--alert';
  el.title = opts?.label ?? 'Alerte';
  el.innerHTML = svgAlerte();
  return el;
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

/** Type AIS vers silhouette ; le dessin lui-même se trouve dans `vesselMarkers.ts`. */
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

const aisSignatures = new WeakMap<Marker[], { map: MapLibreMap; signature: string }>();
const aisSelect = new WeakMap<Marker[], ((mmsi: string) => void) | undefined>();

export type AisPoint = {
  lng: number;
  lat: number;
  label?: string;
  demo?: boolean;
  approche?: boolean;
  mmsi?: string;
  kind?: VesselSilhouette;
  statut?: string;
  headingDeg?: number | null;
  speedKn?: number | null;
  lengthM?: number | null;
  flagCode?: string | null;
  name?: string;
  regularite?: string;
  regulariteLibelle?: string | null;
  ageLibelle?: string | null;
};

/** Marqueur AIS : silhouette orientée, vecteur de vitesse, pastille de pavillon et nom. */
function createAisMarkerElement(p: AisPoint, onClick?: () => void): HTMLDivElement {
  const el = document.createElement('div');
  const statut = p.approche ? 'approche' : (p.statut ?? 'inconnu');
  const regClass =
    p.regularite === 'alerte' ? ' vm--ctrl' : p.regularite === 'a_verifier' ? ' vm--verif' : '';
  el.className = `vm vm--ais vm--ais-${statut}${p.demo ? ' vm--demo' : ''}${onClick ? ' vm--clickable' : ''}${regClass}`;
  if (onClick) {
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      onClick();
    });
  }
  const len = p.lengthM ?? null;
  // Taille : 24 px pour une petite unité, jusqu'à 42 px pour un navire de 200 m et plus
  const px = len == null ? 30 : Math.max(24, Math.min(42, 22 + Math.sqrt(len) * 1.5));
  const flag = p.flagCode
    ? `<span class="vm-flag" title="Pavillon ${escapeHtml(p.flagCode)}">${escapeHtml(p.flagCode)}</span>`
    : '';
  const name = p.name ? `<span class="vm-name">${escapeHtml(p.name)}</span>` : '';
  const sub = p.label ? `<span class="vm-sub">${escapeHtml(p.label)}</span>` : '';
  const marque =
    p.regularite === 'alerte'
      ? `<span class="vm-ctrl" title="${escapeHtml(p.regulariteLibelle ?? 'Navire à contrôler')}"></span>`
      : p.regularite === 'a_verifier'
        ? `<span class="vm-verif" title="${escapeHtml(p.regulariteLibelle ?? 'À vérifier')}"></span>`
        : '';
  el.innerHTML = `
    ${marque}
    ${svgSilhouette(p.kind ?? 'inconnu', statut, p.headingDeg ?? null, px, p.speedKn)}
    <span class="vm-chip">${flag}${name}${sub}</span>
  `;
  el.title = [p.name, p.label, p.regulariteLibelle, p.ageLibelle].filter(Boolean).join(' · ');
  return el;
}

export function placeAisMarkers(
  map: MapLibreMap,
  points: AisPoint[],
  store: Marker[],
  opts?: { max?: number; onSelect?: (mmsi: string) => void },
): void {
  const max = opts?.max ?? 64;
  const signature = points
    .slice(0, max)
    .map(
      (p) =>
        `${p.mmsi ?? ''}|${p.lng.toFixed(5)}|${p.lat.toFixed(5)}|${p.statut ?? ''}|${p.headingDeg ?? ''}|${p.speedKn ?? ''}|${p.label ?? ''}|${p.approche ? 1 : 0}|${p.regularite ?? ''}|${p.ageLibelle ?? ''}`,
    )
    .join(';');
  const precedent = aisSignatures.get(store);
  aisSelect.set(store, opts?.onSelect);
  if (precedent && precedent.map === map && precedent.signature === signature && store.length > 0) return;
  aisSignatures.set(store, { map, signature });
  for (const m of store) m.remove();
  store.length = 0;
  suivreZoom(map);
  for (const p of points.slice(0, max)) {
    if (!Number.isFinite(p.lng) || !Number.isFinite(p.lat)) continue;
    const onSelect = opts?.onSelect ? (mmsi: string) => aisSelect.get(store)?.(mmsi) : undefined;
    const marker = new maplibregl.Marker({
      element: createAisMarkerElement(
        p,
        onSelect && p.mmsi ? () => onSelect(p.mmsi as string) : undefined,
      ),
      anchor: 'center',
    })
      .setLngLat([p.lng, p.lat])
      .addTo(map);
    store.push(marker);
  }
}

export function clearMarkers(store: Marker[]): void {
  detacherFlotte(store);
  aisSignatures.delete(store);
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

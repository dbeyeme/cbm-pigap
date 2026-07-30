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

/** Marqueur HTML : icône navire + anneaux radar. */
export function createShipMarkerElement(opts?: { alert?: boolean }): HTMLDivElement {
  const el = document.createElement('div');
  el.className = `ship-marker${opts?.alert ? ' ship-marker--alert' : ''}`;
  el.innerHTML = `
    <span class="radar-ring" aria-hidden="true"></span>
    <span class="radar-ring radar-ring--delay" aria-hidden="true"></span>
    <img src="/icons/ship.svg" alt="" width="28" height="28" draggable="false" />
  `;
  return el;
}

export function placeShipMarkers(
  map: MapLibreMap,
  points: Array<{ lng: number; lat: number; alert?: boolean }>,
  store: Marker[],
): void {
  for (const m of store) m.remove();
  store.length = 0;
  for (const p of points) {
    const marker = new maplibregl.Marker({
      element: createShipMarkerElement({ alert: p.alert }),
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

/**
 * Tâche de suivi GPS en arrière-plan. Le système l'appelle à chaque nouveau
 * relevé, même écran éteint ou interface fermée : elle doit donc être définie
 * au chargement du paquet (ce fichier est importé par `index.ts`), jamais dans
 * un composant.
 *
 * Chaque relevé est écrit dans la file hors ligne, puis un envoi est tenté.
 * Rien n'est enregistré si le pêcheur n'a pas démarré le suivi lui-même.
 */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { readStoredSession } from '../auth/session';
import { isInGabonZone } from '../geo/gabonMaritimeRoutes';
import { enqueuePosition } from '../offline/db';
import { subscribeSync, syncQuietly } from '../offline/sync';
import {
  readTrackingRequest,
  readTrackingState,
  withTrackingLock,
  writeTrackingProgress,
  writeTrackingRequest,
  type TrackingState,
} from './state';

export const TRACKING_TASK = 'pigap-suivi-gps';

/** Un relevé arrivé un peu en avance sur l'intervalle demandé reste accepté. */
const TOLERANCE = 0.8;
/**
 * Le téléphone peut livrer d'abord une position qu'il avait déjà en mémoire.
 * Au-delà de cette marge avant le démarrage, elle n'appartient pas à la sortie.
 */
const BEFORE_START_MS = 60_000;

type LocationTaskData = { locations?: Location.LocationObject[] };

type Listener = () => void;
const listeners = new Set<Listener>();

/** Prévient l'écran de suivi qu'un relevé vient d'être traité. */
export function subscribeTracking(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyTrackingListeners(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // un écran en défaut ne doit pas arrêter le suivi
    }
  }
}

type Recorded = { stored: number; utilisateurId: string | null };

const NOTHING_RECORDED: Recorded = { stored: 0, utilisateurId: null };

async function recordLocations(locations: Location.LocationObject[]): Promise<Recorded> {
  let state: TrackingState;
  try {
    state = await readTrackingState(true);
  } catch {
    // Stockage momentanément illisible : ce relevé est perdu, le suivi continue
    return NOTHING_RECORDED;
  }
  if (!state.actif || !state.embarcationId || !state.utilisateurId) {
    // Aucun suivi demandé : le service est coupé, rien n'est enregistré
    await Location.stopLocationUpdatesAsync(TRACKING_TASK).catch(() => undefined);
    return NOTHING_RECORDED;
  }

  const minGapMs = state.intervalleMs * TOLERANCE;
  const startedAt = state.debutA ? Date.parse(state.debutA) : 0;
  const before = state.dernierReleveA ? Date.parse(state.dernierReleveA) : 0;
  let last = before;
  let horsZone = state.horsZone;
  let stored = 0;

  const ordered = [...locations].sort((a, b) => a.timestamp - b.timestamp);
  for (const location of ordered) {
    const { longitude, latitude } = location.coords;
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue;
    if (location.timestamp < startedAt - BEFORE_START_MS) continue;
    if (location.timestamp - last < minGapMs) continue;
    last = location.timestamp;
    if (!isInGabonZone(longitude, latitude)) {
      // Hors des eaux gabonaises : le serveur le refuserait à coup sûr
      horsZone += 1;
      continue;
    }
    await enqueuePosition({
      utilisateur_id: state.utilisateurId,
      embarcation_id: state.embarcationId,
      lon: longitude,
      lat: latitude,
      horodatage: new Date(location.timestamp).toISOString(),
    });
    stored += 1;
  }

  if (last !== before || state.enErreur) {
    await writeTrackingProgress({
      dernierReleveA: last > 0 ? new Date(last).toISOString() : null,
      horsZone,
      enErreur: false,
    });
  }
  return { stored, utilisateurId: state.utilisateurId };
}

async function handleLocations(locations: Location.LocationObject[]): Promise<void> {
  const { stored, utilisateurId } = await withTrackingLock(() => recordLocations(locations));
  if (stored > 0 && utilisateurId) {
    // Envoi tenté avec la session conservée ; sans réseau, la file attend
    const session = await readStoredSession();
    if (session && session.user.id === utilisateurId) {
      await syncQuietly(session);
    }
  }
  notifyTrackingListeners();
}

/**
 * ADR-012 : quand le serveur refuse le relevé le plus récent parce qu'un autre
 * appareil suit déjà le bateau, le suivi s'arrête sur celui-ci. Insister ne
 * ferait que répéter le refus à chaque relevé.
 */
async function stopIfTrackedElsewhere(boatIds: string[]): Promise<void> {
  if (boatIds.length === 0) return;
  const request = await readTrackingRequest();
  if (!request.actif || !request.embarcationId || !boatIds.includes(request.embarcationId)) return;
  await writeTrackingRequest({
    actif: false,
    interrompuA: new Date().toISOString(),
    interruptionMotif: 'autre_appareil',
  });
  await Location.stopLocationUpdatesAsync(TRACKING_TASK).catch(() => undefined);
  notifyTrackingListeners();
}

// Valable pour tout envoi, qu'il parte de l'écran ou de la tâche d'arrière-plan
subscribeSync((summary) => {
  void stopIfTrackedElsewhere(summary.positions.exclusiveBoats).catch(() => undefined);
});

if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(TRACKING_TASK)) {
  TaskManager.defineTask<LocationTaskData>(TRACKING_TASK, async ({ data, error }) => {
    if (error) {
      await writeTrackingProgress({ enErreur: true }).catch(() => undefined);
      notifyTrackingListeners();
      return;
    }
    const locations = data?.locations ?? [];
    if (locations.length === 0) return;
    try {
      await handleLocations(locations);
    } catch {
      // Le prochain relevé retentera : la tâche ne doit jamais faire échouer le service
    }
  });
}

/**
 * Démarrage et arrêt du suivi GPS en arrière-plan (cahier §5.2, ADR-009).
 *
 * Le suivi ne démarre que sur un geste du pêcheur, application ouverte. Sur
 * Android, il tourne dans un service de premier plan avec une notification
 * permanente : l'autorisation de localisation « pendant l'utilisation »
 * suffit, l'autorisation « toujours » n'est jamais demandée.
 *
 * Si le téléphone arrête l'application pendant un suivi, le suivi ne reprend
 * pas en silence : au-delà d'une courte coupure, il est déclaré interrompu et
 * c'est au pêcheur de le redémarrer.
 */
import * as Location from 'expo-location';
import { PermissionsAndroid, Platform } from 'react-native';

import { isInGabonZone } from '../geo/gabonMaritimeRoutes';
import { enqueuePosition } from '../offline/db';
import { readCurrentPosition } from './position';
import {
  lastTrackingActivity,
  readTrackingRequest,
  readTrackingState,
  resetTrackingProgress,
  withTrackingLock,
  writeTrackingProgress,
  writeTrackingRequest,
  type TrackingRequest,
  type TrackingState,
} from './state';
import { TRACKING_TASK, notifyTrackingListeners } from './task';

/** `approximative` : le téléphone ne donne qu'une position floue, inutilisable en mer. */
export type LocationAccess = 'accordee' | 'approximative' | 'a_demander' | 'bloquee';

export type StartFailure = 'permission' | 'approximative' | 'gps_eteint' | 'indisponible';

export type StartResult = { ok: true } | { ok: false; reason: StartFailure; message: string };

export const MESSAGE_POSITION_APPROXIMATIVE =
  'Le téléphone ne donne qu’une position approximative. Dans les réglages, autorisez la position exacte à CBM-PIGAP.';

const MESSAGES: Record<StartFailure, string> = {
  permission:
    'Localisation non autorisée. Ouvrez les réglages du téléphone pour l’autoriser à CBM-PIGAP.',
  approximative: MESSAGE_POSITION_APPROXIMATIVE,
  gps_eteint: 'La localisation du téléphone est éteinte. Activez-la, puis réessayez.',
  indisponible: 'Le suivi écran éteint n’est pas disponible sur cette installation de l’application.',
};

/**
 * Coupure tolérée entre deux exécutions de l'application : en deçà, le suivi
 * demandé par le pêcheur est remis en état ; au-delà, il est déclaré interrompu.
 */
const RESUME_INTERVALS = 2;
const RESUME_MIN_MS = 3 * 60_000;

/** Cette exécution de l'application a démarré, ou remis en état, le suivi en cours. */
let ownedHere = false;
/** Un démarrage est en cours : la remise d'accord ne doit pas le contredire. */
let starting = false;

function toAccess(permission: Location.LocationPermissionResponse): LocationAccess {
  if (!permission.granted) return permission.canAskAgain ? 'a_demander' : 'bloquee';
  if (permission.android?.accuracy === 'coarse' || permission.ios?.accuracy === 'reduced') {
    return 'approximative';
  }
  return 'accordee';
}

export async function locationAccess(): Promise<LocationAccess> {
  try {
    return toAccess(await Location.getForegroundPermissionsAsync());
  } catch {
    return 'a_demander';
  }
}

/** Demande au système l'autorisation de localisation ; à appeler après l'explication. */
export async function requestLocationAccess(): Promise<LocationAccess> {
  try {
    return toAccess(await Location.requestForegroundPermissionsAsync());
  } catch {
    return 'bloquee';
  }
}

/** Android 13 et suivants : sans cet accord, la notification de suivi reste masquée. */
async function requestNotificationAccess(): Promise<void> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33) return;
  try {
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  } catch {
    // le suivi fonctionne sans la notification visible
  }
}

/** Faux quand le téléphone masque la notification de suivi (Android 13 et suivants). */
export async function notificationVisible(): Promise<boolean> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33) return true;
  try {
    return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  } catch {
    return true;
  }
}

/** Faux quand la localisation du téléphone est éteinte. */
export async function locationServicesOn(): Promise<boolean> {
  try {
    return await Location.hasServicesEnabledAsync();
  } catch {
    return true;
  }
}

async function isRunning(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(TRACKING_TASK);
  } catch {
    return false;
  }
}

export function intervalLabel(intervalleMs: number): string {
  const seconds = Math.round(intervalleMs / 1000);
  if (seconds < 60) return `toutes les ${seconds} s`;
  const minutes = Math.round(seconds / 60);
  return minutes <= 1 ? 'chaque minute' : `toutes les ${minutes} min`;
}

/** Lance, ou relance, les relevés et le service de premier plan avec sa notification. */
async function launchUpdates(embarcationNom: string, intervalleMs: number): Promise<void> {
  await Location.startLocationUpdatesAsync(TRACKING_TASK, {
    // Précision GPS : au large, les antennes et le Wi-Fi ne donnent rien
    accuracy: Location.Accuracy.High,
    timeInterval: intervalleMs,
    // Un relevé même à l'arrêt : un bateau en pêche bouge peu
    distanceInterval: 0,
    mayShowUserSettingsDialog: false,
    ...(Platform.OS === 'ios' ? { deferredUpdatesInterval: intervalleMs } : {}),
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.OtherNavigation,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Suivi GPS en cours',
      notificationBody: `Position de ${embarcationNom} relevée ${intervalLabel(intervalleMs)}. Ouvrez CBM-PIGAP pour arrêter.`,
      notificationColor: '#1E4D7B',
      killServiceOnDestroy: false,
    },
  });
}

async function markInterrupted(running: boolean): Promise<void> {
  await writeTrackingRequest({
    actif: false,
    interrompuA: new Date().toISOString(),
    interruptionMotif: 'systeme',
  });
  if (running) {
    await Location.stopLocationUpdatesAsync(TRACKING_TASK).catch(() => undefined);
  }
}

export async function startTracking(input: {
  utilisateurId: string;
  embarcationId: string;
  embarcationNom: string;
  intervalleMs: number;
}): Promise<StartResult> {
  const access = await locationAccess();
  if (access === 'approximative') {
    return { ok: false, reason: 'approximative', message: MESSAGES.approximative };
  }
  if (access !== 'accordee') {
    return { ok: false, reason: 'permission', message: MESSAGES.permission };
  }
  if (!(await locationServicesOn())) {
    return { ok: false, reason: 'gps_eteint', message: MESSAGES.gps_eteint };
  }

  starting = true;
  try {
    await requestNotificationAccess();

    // La demande est écrite avant le démarrage : la tâche la lit dès le premier relevé
    await resetTrackingProgress();
    await writeTrackingRequest({
      actif: true,
      utilisateurId: input.utilisateurId,
      embarcationId: input.embarcationId,
      embarcationNom: input.embarcationNom,
      debutA: new Date().toISOString(),
      intervalleMs: input.intervalleMs,
      interrompuA: null,
      interruptionMotif: null,
    });

    try {
      if (await isRunning()) {
        await Location.stopLocationUpdatesAsync(TRACKING_TASK);
      }
      await launchUpdates(input.embarcationNom, input.intervalleMs);
      ownedHere = true;
      return { ok: true };
    } catch {
      await writeTrackingRequest({ actif: false }).catch(() => undefined);
      return { ok: false, reason: 'indisponible', message: MESSAGES.indisponible };
    }
  } finally {
    starting = false;
  }
}

/**
 * Premier relevé, pris tout de suite : sans lui, le système n'en livre un
 * qu'au bout d'un intervalle complet et la sortie commencerait sans point de
 * départ. Rend vrai si une position a été mise en file.
 */
export async function recordStartPosition(request: {
  utilisateurId: string;
  embarcationId: string;
}): Promise<boolean> {
  let location: Location.LocationObject;
  try {
    location = await readCurrentPosition();
  } catch {
    return false;
  }
  const recorded = await withTrackingLock(async () => {
    const state = await readTrackingState();
    // Suivi arrêté entre-temps, ou relevé déjà pris par la tâche : rien à ajouter
    if (!state.actif || state.embarcationId !== request.embarcationId || state.dernierReleveA) {
      return null;
    }
    const { longitude, latitude } = location.coords;
    const stamp = new Date(location.timestamp).toISOString();
    if (!isInGabonZone(longitude, latitude)) {
      await writeTrackingProgress({ dernierReleveA: stamp, horsZone: state.horsZone + 1 });
      return false;
    }
    await enqueuePosition({
      utilisateur_id: request.utilisateurId,
      embarcation_id: request.embarcationId,
      lon: longitude,
      lat: latitude,
      horodatage: stamp,
    });
    await writeTrackingProgress({ dernierReleveA: stamp });
    return true;
  });
  if (recorded !== null) notifyTrackingListeners();
  return recorded === true;
}

export async function stopTracking(): Promise<void> {
  ownedHere = false;
  // L'arrêt est noté d'abord : un relevé tardif ne sera pas enregistré
  await writeTrackingRequest({ actif: false, interrompuA: null, interruptionMotif: null }).catch(
    () => undefined,
  );
  try {
    if (await isRunning()) {
      await Location.stopLocationUpdatesAsync(TRACKING_TASK);
    }
  } catch {
    // service déjà arrêté
  }
}

function resumeWindowMs(request: TrackingRequest): number {
  return Math.max(request.intervalleMs * RESUME_INTERVALS, RESUME_MIN_MS);
}

/**
 * Remet d'accord ce que le pêcheur a demandé et ce que fait le téléphone. À
 * appeler application ouverte (démarrage, retour au premier plan).
 *
 * - Service absent alors qu'un suivi est demandé : suivi interrompu, signalé.
 * - Suivi demandé dans une exécution précédente de l'application (le téléphone
 *   l'a arrêtée puis relancée) : après une courte coupure, le service et sa
 *   notification sont remis en état ; au-delà, le suivi est déclaré interrompu
 *   et le pêcheur le redémarre lui-même.
 * - Service qui tourne sans demande : arrêté.
 */
export async function reconcileTracking(): Promise<TrackingState> {
  if (starting) return readTrackingState();
  const [state, running] = await Promise.all([readTrackingState(), isRunning()]);
  if (state.actif && !running) {
    await markInterrupted(false);
  } else if (state.actif && running && !ownedHere) {
    const silence = Date.now() - lastTrackingActivity(state);
    if (silence > resumeWindowMs(state) || !state.embarcationNom) {
      await markInterrupted(true);
    } else {
      try {
        await launchUpdates(state.embarcationNom, state.intervalleMs);
        ownedHere = true;
      } catch {
        await markInterrupted(true);
      }
    }
  } else if (!state.actif && running) {
    await Location.stopLocationUpdatesAsync(TRACKING_TASK).catch(() => undefined);
  }
  return readTrackingState();
}

/** Le pêcheur a pris connaissance de l'interruption : le message disparaît. */
export async function acknowledgeInterruption(): Promise<void> {
  await writeTrackingRequest({ interrompuA: null, interruptionMotif: null }).catch(() => undefined);
}

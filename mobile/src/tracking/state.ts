/**
 * État du suivi GPS, conservé sur le téléphone : la tâche d'arrière-plan le
 * relit à chaque relevé, y compris quand l'interface n'est pas ouverte.
 *
 * Deux enregistrements distincts pour qu'aucun n'écrase l'autre : la demande
 * du pêcheur (écrite par l'écran) et l'avancement (écrit par la tâche).
 */
import { getSetting, setSetting } from '../offline/db';

/** Ce que le pêcheur a demandé : écrit par l'écran de suivi seulement. */
export type TrackingRequest = {
  /** Le pêcheur a démarré le suivi et ne l'a pas arrêté. */
  actif: boolean;
  utilisateurId: string | null;
  embarcationId: string | null;
  embarcationNom: string | null;
  debutA: string | null;
  /** Écart demandé entre deux relevés. */
  intervalleMs: number;
  /** Le suivi s'est arrêté sans action du pêcheur. */
  interrompuA: string | null;
  /**
   * Pourquoi : `systeme` (le téléphone a coupé le service) ou `autre_appareil`
   * (le serveur indique qu'un autre appareil suit déjà ce bateau, ADR-012).
   */
  interruptionMotif: 'systeme' | 'autre_appareil' | null;
};

/** Ce que la tâche a fait : écrit par la tâche d'arrière-plan seulement. */
export type TrackingProgress = {
  /** Heure du dernier relevé traité : sert à espacer les relevés. */
  dernierReleveA: string | null;
  /** Relevés écartés parce qu'ils étaient hors des eaux gabonaises. */
  horsZone: number;
  /** Le téléphone n'a pas pu fournir de position au dernier essai. */
  enErreur: boolean;
};

export type TrackingState = TrackingRequest & TrackingProgress;

const KEY_REQUEST = 'suivi_demande';
const KEY_PROGRESS = 'suivi_avancement';

const IDLE_REQUEST: TrackingRequest = {
  actif: false,
  utilisateurId: null,
  embarcationId: null,
  embarcationNom: null,
  debutA: null,
  intervalleMs: 5 * 60_000,
  interrompuA: null,
  interruptionMotif: null,
};

const IDLE_PROGRESS: TrackingProgress = {
  dernierReleveA: null,
  horsZone: 0,
  enErreur: false,
};

export const TRACKING_IDLE: TrackingState = { ...IDLE_REQUEST, ...IDLE_PROGRESS };

/**
 * `strict` : une lecture impossible lève une erreur au lieu de rendre l'état
 * de repos. La tâche de suivi s'en sert pour ne jamais prendre un stockage
 * momentanément illisible pour une demande d'arrêt.
 */
async function readJson<T extends object>(key: string, fallback: T, strict = false): Promise<T> {
  let raw: string | null;
  try {
    raw = await getSetting(key);
  } catch (err) {
    if (strict) throw err;
    return fallback;
  }
  if (!raw) return fallback;
  try {
    return { ...fallback, ...(JSON.parse(raw) as Partial<T>) };
  } catch {
    return fallback;
  }
}

export async function readTrackingRequest(strict = false): Promise<TrackingRequest> {
  const request = await readJson(KEY_REQUEST, IDLE_REQUEST, strict);
  return { ...request, actif: request.actif === true };
}

export async function readTrackingState(strict = false): Promise<TrackingState> {
  const [request, progress] = await Promise.all([
    readTrackingRequest(strict),
    readJson(KEY_PROGRESS, IDLE_PROGRESS, strict),
  ]);
  return { ...request, ...progress };
}

/** Dernier signe de vie du suivi : dernier relevé traité, sinon heure de démarrage. */
export function lastTrackingActivity(state: TrackingState): number {
  const stamp = state.dernierReleveA ?? state.debutA;
  const time = stamp ? Date.parse(stamp) : NaN;
  return Number.isFinite(time) ? time : 0;
}

export async function writeTrackingRequest(patch: Partial<TrackingRequest>): Promise<void> {
  const next = { ...(await readTrackingRequest()), ...patch };
  await setSetting(KEY_REQUEST, JSON.stringify(next));
}

export async function writeTrackingProgress(patch: Partial<TrackingProgress>): Promise<void> {
  const next = { ...(await readJson(KEY_PROGRESS, IDLE_PROGRESS)), ...patch };
  await setSetting(KEY_PROGRESS, JSON.stringify(next));
}

export async function resetTrackingProgress(): Promise<void> {
  await setSetting(KEY_PROGRESS, JSON.stringify(IDLE_PROGRESS));
}

let recording: Promise<unknown> = Promise.resolve();

/**
 * Enregistre les relevés l'un après l'autre. Au démarrage, le relevé immédiat
 * et le premier relevé du service arrivent à la même seconde : passés en file,
 * le second voit le premier et ne le double pas.
 */
export function withTrackingLock<T>(work: () => Promise<T>): Promise<T> {
  const run = recording.then(work);
  recording = run.catch(() => undefined);
  return run;
}

/** Le pêcheur a lu l'explication du suivi : elle n'est plus imposée à chaque démarrage. */
export async function hasSeenTrackingNotice(utilisateurId: string): Promise<boolean> {
  try {
    return Boolean(await getSetting(`suivi_explique_${utilisateurId}`));
  } catch {
    return false;
  }
}

export async function markTrackingNoticeSeen(utilisateurId: string): Promise<void> {
  await setSetting(`suivi_explique_${utilisateurId}`, new Date().toISOString()).catch(() => undefined);
}

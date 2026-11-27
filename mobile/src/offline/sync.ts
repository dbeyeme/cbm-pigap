/**
 * Envoi de tout ce qui attend sur le téléphone : sorties en mer, déclarations
 * de captures et positions GPS. Appelé à l'ouverture, au retour de l'application au premier
 * plan, après chaque saisie et par la tâche de suivi GPS. Un seul envoi tourne
 * à la fois ; les appels simultanés partagent le même résultat.
 */
import type { Session } from '../auth/session';
import { getSetting, setSetting } from './db';
import { syncPendingCaptures, type SyncReport } from './syncCaptures';
import { syncPendingPositions, type PositionSyncReport } from './syncPositions';
import { EMPTY_SORTIES_REPORT, syncPendingSorties, type SortieSyncReport } from './syncSorties';

export type SyncSummary = {
  at: string;
  sorties: SortieSyncReport;
  captures: SyncReport;
  positions: PositionSyncReport;
  /** Le serveur a refusé la session : il faut se reconnecter pour envoyer. */
  sessionExpired: boolean;
  /** Message à afficher si l'envoi s'est arrêté avant la fin. */
  message: string | null;
};

export type SyncState = {
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastMessage: string | null;
};

const KEY_ATTEMPT = 'sync_dernier_essai_a';
const KEY_SUCCESS = 'sync_dernier_succes_a';
const KEY_MESSAGE = 'sync_dernier_message';

type Listener = (summary: SyncSummary) => void;

let running: Promise<SyncSummary> | null = null;
/** Envoi demandé pendant qu'un autre tournait : il partira juste après. */
let queued: Promise<SyncSummary> | null = null;
const listeners = new Set<Listener>();

/** Prévient les écrans ouverts qu'un envoi vient de se terminer. */
export function subscribeSync(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const EMPTY_CAPTURES: SyncReport = {
  pushed: 0,
  accepted: 0,
  duplicates: 0,
  rejected: 0,
  deferred: 0,
  error: null,
  stopped: null,
};

async function run(session: Session): Promise<SyncSummary> {
  const at = new Date().toISOString();
  const userId = session.user.id;

  let sorties: SortieSyncReport = EMPTY_SORTIES_REPORT;
  let captures: SyncReport = EMPTY_CAPTURES;
  let positions: PositionSyncReport = {
    pushed: 0,
    accepted: 0,
    rejected: 0,
    remaining: 0,
    error: null,
    stopped: null,
    rejectMessage: null,
    exclusiveBoats: [],
  };

  // Les sorties d'abord : peu nombreuses, elles servent à la sécurité en mer
  sorties = await syncPendingSorties(session.token, userId);
  if (sorties.stopped !== 'session') {
    captures = await syncPendingCaptures(session.token, userId);
  }
  if (sorties.stopped !== 'session' && captures.stopped !== 'session') {
    positions = await syncPendingPositions(session.token, userId);
  }

  const sessionExpired =
    sorties.stopped === 'session' || captures.stopped === 'session' || positions.stopped === 'session';
  const message = sorties.error ?? captures.error ?? positions.error;
  const summary: SyncSummary = { at, sorties, captures, positions, sessionExpired, message };

  try {
    await setSetting(KEY_ATTEMPT, at);
    await setSetting(KEY_MESSAGE, message ?? '');
    if (!message) await setSetting(KEY_SUCCESS, at);
  } catch {
    // l'état affiché sera simplement moins précis
  }

  for (const listener of [...listeners]) {
    try {
      listener(summary);
    } catch {
      // un écran en défaut ne doit pas bloquer les autres
    }
  }
  return summary;
}

/**
 * Lance un envoi. Si un envoi tourne déjà, il a lu la file avant la saisie qui
 * motive cet appel : un second envoi est alors enchaîné, et c'est son résultat
 * qui est rendu. L'appelant sait ainsi vraiment si sa saisie est partie.
 */
export function syncAll(session: Session): Promise<SyncSummary> {
  if (!running) {
    running = run(session).finally(() => {
      running = null;
    });
    return running;
  }
  if (!queued) {
    queued = running
      .catch(() => undefined)
      .then(() => {
        queued = null;
        return syncAll(session);
      });
  }
  return queued;
}

/** Envoi discret : aucune erreur ne remonte, la file reste en l'état. */
export async function syncQuietly(session: Session | null): Promise<SyncSummary | null> {
  if (!session) return null;
  try {
    return await syncAll(session);
  } catch {
    return null;
  }
}

export async function readSyncState(): Promise<SyncState> {
  try {
    const [attempt, success, message] = await Promise.all([
      getSetting(KEY_ATTEMPT),
      getSetting(KEY_SUCCESS),
      getSetting(KEY_MESSAGE),
    ]);
    return {
      lastAttemptAt: attempt,
      lastSuccessAt: success,
      lastMessage: message ? message : null,
    };
  } catch {
    return { lastAttemptAt: null, lastSuccessAt: null, lastMessage: null };
  }
}

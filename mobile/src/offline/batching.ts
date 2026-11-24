/**
 * Envoi d'une file locale par lots, sans qu'une saisie refusée ne bloque les
 * autres : quand le serveur refuse un lot entier, le lot est coupé en deux
 * jusqu'à isoler la ou les lignes en cause. Une coupure de réseau, une session
 * expirée ou une panne du serveur arrêtent l'envoi et laissent la file intacte.
 *
 * Une ligne n'est écartée pour de bon que si le serveur la refuse avec un code
 * métier connu. Toute autre réponse (404 d'une passerelle, 400 sans code,
 * erreur inattendue) laisse la file en l'état : mieux vaut réessayer que perdre
 * une saisie.
 *
 * Module sans dépendance, pour pouvoir être testé seul.
 */
import { isApiError, isNetworkError } from '../lib/apiErrors';

export type StopReason = 'reseau' | 'session' | 'bloque' | 'serveur' | 'budget';

export type SendVerdict =
  | { kind: 'ok' }
  /** Refus définitif. `whole` : tout le lot est concerné, inutile de le découper. */
  | { kind: 'refus'; message: string; code: string | null; whole?: boolean }
  /** L'envoi s'arrête, la file est conservée. */
  | { kind: 'arret'; reason: Exclude<StopReason, 'budget'>; message: string };

export type BatchOutcome = {
  accepted: number;
  rejected: number;
  calls: number;
  stop: { reason: StopReason; message: string } | null;
};

/** Codes métier qui valent refus définitif d'une ligne ou d'un lot. */
export type RefusalCodes = {
  /** Le refus vise certaines lignes du lot : le lot est redécoupé pour les isoler. */
  row: ReadonlyArray<string>;
  /** Le refus vaut pour tout le lot (bateau inconnu, par exemple). */
  whole?: ReadonlyArray<string>;
};

/** Traduit une erreur d'appel en décision pour la file. */
export function verdictFromError(err: unknown, codes: RefusalCodes): SendVerdict {
  if (isNetworkError(err)) {
    return { kind: 'arret', reason: 'reseau', message: 'Pas de réseau : vos saisies restent sur le téléphone.' };
  }
  if (!isApiError(err)) {
    return { kind: 'arret', reason: 'serveur', message: 'Envoi interrompu. Nouvel essai au prochain envoi.' };
  }
  const { status, message, code } = err;
  if (status === 401) {
    return { kind: 'arret', reason: 'session', message };
  }
  if (code && codes.whole?.includes(code)) {
    return { kind: 'refus', message, code, whole: true };
  }
  if (code && codes.row.includes(code)) {
    return { kind: 'refus', message, code };
  }
  if (status === 402 || status === 403) {
    // Abonnement requis, appareil non rattaché, droit manquant : rien n'est perdu
    return { kind: 'arret', reason: 'bloque', message };
  }
  // Tout le reste, y compris un 4xx sans code métier connu : la file est conservée
  return { kind: 'arret', reason: 'serveur', message };
}

export async function sendInBatches<T>(
  items: T[],
  options: {
    /** Taille maximale d'un lot. */
    size: number;
    /** Nombre maximal d'appels pour cet envoi ; le reste partira au suivant. */
    budget: number;
    send: (batch: T[]) => Promise<SendVerdict>;
    onAccepted: (batch: T[]) => Promise<void>;
    onRejected: (batch: T[], message: string, code: string | null) => Promise<void>;
  },
): Promise<BatchOutcome> {
  const outcome: BatchOutcome = { accepted: 0, rejected: 0, calls: 0, stop: null };

  async function push(batch: T[]): Promise<boolean> {
    if (batch.length === 0) return true;
    if (outcome.calls >= options.budget) {
      outcome.stop = { reason: 'budget', message: 'Envoi en plusieurs fois : la suite partira au prochain envoi.' };
      return false;
    }
    outcome.calls += 1;
    const verdict = await options.send(batch);
    if (verdict.kind === 'ok') {
      await options.onAccepted(batch);
      outcome.accepted += batch.length;
      return true;
    }
    if (verdict.kind === 'arret') {
      outcome.stop = { reason: verdict.reason, message: verdict.message };
      return false;
    }
    if (batch.length === 1 || verdict.whole) {
      await options.onRejected(batch, verdict.message, verdict.code);
      outcome.rejected += batch.length;
      return true;
    }
    const middle = Math.ceil(batch.length / 2);
    if (!(await push(batch.slice(0, middle)))) return false;
    return push(batch.slice(middle));
  }

  const size = Math.max(1, options.size);
  for (let start = 0; start < items.length; start += size) {
    if (!(await push(items.slice(start, start + size)))) break;
  }
  return outcome;
}

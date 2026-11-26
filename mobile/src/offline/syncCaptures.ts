/**
 * Envoie la file locale des déclarations vers `POST /api/v1/captures/sync`.
 * Le serveur reconnaît une déclaration déjà reçue à son identifiant : un
 * renvoi après une coupure ne crée pas de doublon.
 *
 * Une déclaration que le serveur refuse pour de bon passe à l'état « refusée » :
 * elle ne repart plus et ne retarde pas les autres. Un refus passager
 * (abonnement à régulariser, par exemple) la laisse à envoyer.
 */
import { syncCapturesBatch, type CaptureCreatePayload } from '../api';
import { messageForCode, parseApiError } from '../lib/apiErrors';
import { sendInBatches, verdictFromError, type RefusalCodes, type StopReason } from './batching';
import {
  listPendingCaptures,
  markCaptureRejected,
  markSynced,
  markSyncError,
  type LocalCapture,
} from './db';

/** Le serveur accepte au plus 100 déclarations par appel. */
const BATCH_SIZE = 50;
const MAX_CALLS = 20;

/** Requête refusée dans son ensemble : une déclaration mal formée, à isoler. */
const REFUSALS: RefusalCodes = { row: ['VALIDATION_ERROR'] };

/** Refus par déclaration qui ne changeront pas en réessayant. */
const DEFINITIVE_ITEM_CODES = new Set([
  'CAPTURE_ID_CONFLICT',
  'EMBARCATION_NOT_FOUND',
  'PECHEUR_NOT_FOUND',
  'EMBARCATION_PECHEUR_MISMATCH',
  'ROLE_FORBIDDEN',
  'PRIX_TROP_ELEVE',
  'PRIX_INVALIDE',
  'PRIX_REQUIS',
]);

export type SyncReport = {
  pushed: number;
  accepted: number;
  duplicates: number;
  /** Déclarations refusées pour de bon pendant cet envoi. */
  rejected: number;
  /** Déclarations que le serveur n'a pas prises cette fois, à renvoyer plus tard. */
  deferred: number;
  /** Message à afficher quand l'envoi s'est arrêté ; la file est conservée. */
  error: string | null;
  stopped: StopReason | null;
};

function toPayload(c: LocalCapture): CaptureCreatePayload {
  return {
    id: c.id,
    pecheur_id: c.pecheur_id,
    embarcation_id: c.embarcation_id,
    espece: c.espece,
    quantite_kg: c.quantite_kg,
    methode: c.methode,
    point_debarquement: c.point_debarquement,
    date_capture: c.date_capture,
    ...(c.position ? { position_capture: { type: 'Point' as const, coordinates: c.position } } : {}),
    ...(c.prix_fcfa_kg != null ? { prix_fcfa_kg: c.prix_fcfa_kg } : {}),
  };
}

export async function syncPendingCaptures(
  token: string,
  utilisateurId: string,
): Promise<SyncReport> {
  const pending = await listPendingCaptures(utilisateurId);
  const report: SyncReport = {
    pushed: pending.length,
    accepted: 0,
    duplicates: 0,
    rejected: 0,
    deferred: 0,
    error: null,
    stopped: null,
  };
  if (pending.length === 0) return report;

  const outcome = await sendInBatches(pending, {
    size: BATCH_SIZE,
    budget: MAX_CALLS,
    send: async (batch) => {
      try {
        const result = await syncCapturesBatch(token, batch.map(toPayload));
        await markSynced([...result.accepts, ...result.duplicates]);
        report.accepted += result.accepts.length;
        report.duplicates += result.duplicates.length;
        for (const reject of result.rejects) {
          if (!reject.id) continue;
          const message =
            messageForCode(reject.code ?? null) ?? parseApiError(reject.detail ?? 'Déclaration refusée');
          if (reject.code && DEFINITIVE_ITEM_CODES.has(reject.code)) {
            await markCaptureRejected(reject.id, message);
            report.rejected += 1;
          } else {
            await markSyncError(reject.id, message);
            report.deferred += 1;
          }
        }
        return { kind: 'ok' };
      } catch (err) {
        return verdictFromError(err, REFUSALS);
      }
    },
    // Les lignes acceptées sont marquées dès la réponse, ligne par ligne
    onAccepted: async () => undefined,
    onRejected: async (batch, message) => {
      report.rejected += batch.length;
      for (const c of batch) await markCaptureRejected(c.id, message);
    },
  });

  if (outcome.stop) {
    report.stopped = outcome.stop.reason;
    report.error = outcome.stop.message;
  }
  return report;
}

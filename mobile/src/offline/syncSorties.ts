/**
 * Envoie la file locale des sorties en mer vers `POST /api/v1/sorties`
 * (lot 11, ADR-016). Chaque sortie part complète, retour compris s'il est
 * déclaré : le serveur la reconnaît à son `client_id`, un renvoi est donc sans
 * danger. Un départ et un retour faits hors ligne partent ensemble.
 *
 * Les sorties partent une à une, dans l'ordre des départs, et l'envoi s'arrête
 * à la première erreur passagère : un départ ne double jamais celui qui le
 * précède pour le même bateau. Une sortie n'est écartée pour de bon que sur un
 * code métier connu ; toute autre réponse laisse la file intacte.
 */
import { postSortie, type SortiePayload } from '../api';
import { SORTIE_CODES_DEFINITIFS } from '../lib/sorties';
import { verdictFromError, type StopReason } from './batching';
import {
  listPendingSorties,
  markSortieError,
  markSortieRejected,
  markSortieSynced,
  type LocalSortie,
} from './db';

/** Nombre maximal d'appels pour un envoi ; le reste partira au suivant. */
const MAX_CALLS = 20;

export type SortieSyncReport = {
  pushed: number;
  accepted: number;
  /** Sorties refusées pour de bon pendant cet envoi. */
  rejected: number;
  /** Motif du dernier refus définitif, à montrer au pêcheur. */
  rejectMessage: string | null;
  /** Message à afficher quand l'envoi s'est arrêté ; la file est conservée. */
  error: string | null;
  stopped: StopReason | null;
};

export const EMPTY_SORTIES_REPORT: SortieSyncReport = {
  pushed: 0,
  accepted: 0,
  rejected: 0,
  rejectMessage: null,
  error: null,
  stopped: null,
};

function point(coordinates: [number, number] | null) {
  return coordinates ? { type: 'Point' as const, coordinates } : null;
}

export function toSortiePayload(s: LocalSortie): SortiePayload {
  return {
    client_id: s.client_id,
    embarcation_id: s.embarcation_id,
    port_depart_id: s.port_depart_id,
    position_depart: point(s.position_depart),
    depart_a: s.depart_a,
    retour_prevu_a: s.retour_prevu_a,
    secteur_vise: s.secteur_vise,
    retour_a: s.retour_a,
    port_retour_id: s.port_retour_id,
    position_retour: point(s.position_retour),
  };
}

export async function syncPendingSorties(
  token: string,
  utilisateurId: string,
): Promise<SortieSyncReport> {
  const pending = await listPendingSorties(utilisateurId);
  const report: SortieSyncReport = { ...EMPTY_SORTIES_REPORT, pushed: pending.length };

  let calls = 0;
  for (const sortie of pending) {
    if (calls >= MAX_CALLS) {
      report.stopped = 'budget';
      report.error = 'Envoi en plusieurs fois : la suite partira au prochain envoi.';
      break;
    }
    calls += 1;
    try {
      const read = await postSortie(token, toSortiePayload(sortie));
      await markSortieSynced(sortie.client_id, sortie.revision, {
        id: read?.id ?? null,
        retour_a: read?.retour_a ?? null,
      });
      report.accepted += 1;
    } catch (err) {
      const verdict = verdictFromError(err, { row: SORTIE_CODES_DEFINITIFS });
      if (verdict.kind === 'refus') {
        if (verdict.code === 'SORTIE_DEJA_TERMINEE' && sortie.retour_a) {
          // Retour déjà enregistré sur la plateforme : ce que le pêcheur voulait
          await markSortieSynced(sortie.client_id, sortie.revision, { id: null, retour_a: null });
          report.accepted += 1;
          continue;
        }
        await markSortieRejected(sortie.client_id, verdict.message);
        report.rejected += 1;
        report.rejectMessage = verdict.message;
        continue;
      }
      if (verdict.kind === 'arret') {
        if (verdict.reason === 'serveur' || verdict.reason === 'bloque') {
          await markSortieError(sortie.client_id, verdict.message);
        }
        report.stopped = verdict.reason;
        report.error = verdict.message;
      }
      break;
    }
  }
  return report;
}

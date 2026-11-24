/**
 * File hors ligne des positions GPS (cahier §5.2, contrainte §10 « faible
 * couverture réseau »). Chaque position est écrite en SQLite avant tout envoi ;
 * la synchronisation pousse les positions en attente par bateau, dans l'ordre
 * chronologique, par `POST /api/v1/positions/batch`.
 *
 * Une coupure de réseau, une session expirée, une panne du serveur ou une
 * réponse inattendue conservent la file. Seul un refus métier connu du serveur
 * est définitif, et il ne touche que les positions en cause : le serveur
 * refusant un lot entier, le lot est redécoupé pour les isoler.
 */
import { postPositionsBatch } from '../api';
import { sendInBatches, verdictFromError, type RefusalCodes, type StopReason } from './batching';
import {
  listPendingPositions,
  markPositionsRejected,
  markPositionsSynced,
  type LocalPosition,
} from './db';

const BATCH_SIZE = 100;
const MAX_CALLS = 40;

/** Un autre appareil suit déjà ce bateau dans la fenêtre d'exclusivité (ADR-012). */
const CODE_EXCLUSIVITE = 'SUIVI_DEJA_ASSURE';

const REFUSALS: RefusalCodes = {
  // Position à terre, parcours impossible, relevé en conflit avec un autre
  // appareil, relevé mal formé : seules les lignes en cause sont écartées
  row: ['POSITION_HORS_EAU', 'TRAJECTOIRE_PASSAGE_TERRESTRE', CODE_EXCLUSIVITE, 'VALIDATION_ERROR'],
  // Bateau inconnu du serveur ou hors du compte : aucune ligne du lot ne passera
  whole: ['EMBARCATION_NOT_FOUND'],
};

export type PositionSyncReport = {
  /** Positions en attente au début de l'envoi. */
  pushed: number;
  accepted: number;
  rejected: number;
  remaining: number;
  /** Message à afficher quand l'envoi s'est arrêté ; la file est conservée. */
  error: string | null;
  stopped: StopReason | null;
  /** Motif du dernier refus définitif du serveur, s'il y en a eu un. */
  rejectMessage: string | null;
  /**
   * Bateaux dont le relevé le plus récent a été refusé parce qu'un autre
   * appareil en assure déjà le suivi : continuer ici ne ferait que répéter le
   * refus, le suivi doit s'arrêter sur ce téléphone.
   */
  exclusiveBoats: string[];
};

function groupByBoat(items: LocalPosition[]): Map<string, LocalPosition[]> {
  const groups = new Map<string, LocalPosition[]>();
  for (const p of items) {
    const list = groups.get(p.embarcation_id) ?? [];
    list.push(p);
    groups.set(p.embarcation_id, list);
  }
  return groups;
}

export async function syncPendingPositions(
  token: string,
  utilisateurId: string,
): Promise<PositionSyncReport> {
  const pending = await listPendingPositions(utilisateurId);
  const report: PositionSyncReport = {
    pushed: pending.length,
    accepted: 0,
    rejected: 0,
    remaining: pending.length,
    error: null,
    stopped: null,
    rejectMessage: null,
    exclusiveBoats: [],
  };
  if (pending.length === 0) return report;

  let calls = 0;
  for (const [boatId, items] of groupByBoat(pending)) {
    if (calls >= MAX_CALLS) {
      report.stopped = 'budget';
      report.error = 'Envoi en plusieurs fois : la suite partira au prochain envoi.';
      break;
    }
    const newest = items[items.length - 1];
    const outcome = await sendInBatches(items, {
      size: BATCH_SIZE,
      budget: MAX_CALLS - calls,
      send: async (batch) => {
        try {
          await postPositionsBatch(
            token,
            batch.map((p) => ({
              embarcation_id: p.embarcation_id,
              position: { type: 'Point' as const, coordinates: [p.lon, p.lat] as [number, number] },
              horodatage: p.horodatage,
              source: 'mobile',
            })),
          );
          return { kind: 'ok' };
        } catch (err) {
          return verdictFromError(err, REFUSALS);
        }
      },
      onAccepted: (batch) => markPositionsSynced(batch.map((p) => p.id)),
      onRejected: async (batch, message, code) => {
        report.rejectMessage = message;
        if (code === CODE_EXCLUSIVITE && batch.includes(newest) && !report.exclusiveBoats.includes(boatId)) {
          report.exclusiveBoats.push(boatId);
        }
        await markPositionsRejected(
          batch.map((p) => p.id),
          message,
        );
      },
    });
    calls += outcome.calls;
    report.accepted += outcome.accepted;
    report.rejected += outcome.rejected;
    report.remaining -= outcome.accepted + outcome.rejected;
    if (outcome.stop) {
      report.stopped = outcome.stop.reason;
      report.error = outcome.stop.message;
      break;
    }
  }
  return report;
}

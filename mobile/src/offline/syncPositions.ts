/**
 * File hors-ligne des positions GPS (cahier §5.2, contrainte §10 « faible
 * couverture réseau »). Chaque position est écrite en SQLite avant tout envoi ;
 * la synchronisation pousse les positions en attente par embarcation via
 * `POST /api/v1/positions/batch`, dans l'ordre chronologique.
 *
 * Une coupure réseau conserve la file (nouvelle tentative au prochain envoi).
 * Un refus métier du serveur (position à terre, trajectoire traversant la
 * terre) est définitif : la position est marquée rejetée et n'est pas renvoyée.
 */
import { postPositionsBatch } from '../api';
import { parseApiError } from '../lib/apiErrors';
import {
  listPendingPositions,
  markPositionsRejected,
  markPositionsSynced,
  type LocalPosition,
} from './db';

export type PositionSyncReport = {
  pushed: number;
  accepted: number;
  rejected: number;
  remaining: number;
  /** Message réseau : la file est conservée. */
  error: string | null;
};

export function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /network request failed|failed to fetch|networkerror|réseau|timeout/i.test(msg);
}

function groupByBoat(items: LocalPosition[]): Map<string, LocalPosition[]> {
  const groups = new Map<string, LocalPosition[]>();
  for (const p of items) {
    const list = groups.get(p.embarcation_id) ?? [];
    list.push(p);
    groups.set(p.embarcation_id, list);
  }
  return groups;
}

export async function syncPendingPositions(token: string): Promise<PositionSyncReport> {
  const pending = await listPendingPositions();
  const report: PositionSyncReport = {
    pushed: pending.length,
    accepted: 0,
    rejected: 0,
    remaining: pending.length,
    error: null,
  };
  if (pending.length === 0) return report;

  for (const [, items] of groupByBoat(pending)) {
    const ids = items.map((p) => p.id);
    try {
      await postPositionsBatch(
        token,
        items.map((p) => ({
          embarcation_id: p.embarcation_id,
          position: { type: 'Point' as const, coordinates: [p.lon, p.lat] as [number, number] },
          horodatage: p.horodatage,
          source: 'mobile',
        })),
      );
      await markPositionsSynced(ids);
      report.accepted += ids.length;
      report.remaining -= ids.length;
    } catch (err) {
      if (isNetworkError(err)) {
        report.error = 'Réseau indisponible : positions conservées sur le téléphone';
        return report;
      }
      const message = parseApiError(err instanceof Error ? err.message : 'Position refusée');
      await markPositionsRejected(ids, message);
      report.rejected += ids.length;
      report.remaining -= ids.length;
    }
  }
  return report;
}

/**
 * Synchronise la file SQLite locale vers `POST /api/v1/captures/sync`.
 * Idempotent : le serveur dédoublonne via l'UUID client.
 */
import { syncCapturesBatch } from '../api';
import { parseApiError } from '../lib/apiErrors';
import { listPendingCaptures, markSynced, markSyncError } from './db';

export type SyncReport = {
  pushed: number;
  accepted: number;
  duplicates: number;
  rejected: number;
  error: string | null;
};

export async function syncPendingCaptures(token: string): Promise<SyncReport> {
  const pending = await listPendingCaptures();
  if (pending.length === 0) {
    return { pushed: 0, accepted: 0, duplicates: 0, rejected: 0, error: null };
  }

  try {
    const result = await syncCapturesBatch(
      token,
      pending.map((c) => ({
        id: c.id,
        pecheur_id: c.pecheur_id,
        embarcation_id: c.embarcation_id,
        espece: c.espece,
        quantite_kg: c.quantite_kg,
        methode: c.methode,
        point_debarquement: c.point_debarquement,
        date_capture: c.date_capture,
      })),
    );

    const done = [...result.accepts, ...result.duplicates];
    await markSynced(done);

    for (const reject of result.rejects) {
      if (reject.id) {
        await markSyncError(reject.id, reject.detail ?? reject.code ?? 'REJECTED');
      }
    }

    return {
      pushed: pending.length,
      accepted: result.accepts.length,
      duplicates: result.duplicates.length,
      rejected: result.rejects.length,
      error: null,
    };
  } catch (err) {
    const message = parseApiError(
      err instanceof Error ? err.message : 'Sync réseau impossible',
    );
    for (const c of pending) {
      await markSyncError(c.id, message);
    }
    return {
      pushed: pending.length,
      accepted: 0,
      duplicates: 0,
      rejected: 0,
      error: message,
    };
  }
}

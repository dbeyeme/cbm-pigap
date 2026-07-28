/**
 * Helpers purs pour tests / simulation sync offline (sans SQLite).
 * Miroir logique de l'idempotence serveur via client_id.
 */

export type PendingCapture = {
  id: string;
  espece: string;
  quantite_kg: number;
};

export type SyncOutcome = {
  accepts: string[];
  duplicates: string[];
};

/** Simule un serveur qui refuse les doublons d'UUID client. */
export function applyIdempotentSync(
  alreadySynced: Set<string>,
  pending: PendingCapture[],
): SyncOutcome {
  const accepts: string[] = [];
  const duplicates: string[] = [];
  for (const item of pending) {
    if (alreadySynced.has(item.id)) {
      duplicates.push(item.id);
    } else {
      alreadySynced.add(item.id);
      accepts.push(item.id);
    }
  }
  return { accepts, duplicates };
}

/**
 * Stockage local SQLite : déclarations de captures (§5.4, ADR-001), positions
 * GPS (§5.2) et réglages de l'application. Toute saisie est écrite ici avant
 * la moindre tentative d'envoi, et chaque ligne garde le compte qui l'a
 * saisie : un autre compte ouvert sur le même téléphone ne la voit pas et ne
 * l'envoie pas.
 */
import * as SQLite from 'expo-sqlite';

import type { EspeceMVP, MethodeMVP } from './catalog';

/** Durée de conservation locale des positions déjà traitées par le serveur. */
const RETENTION_POSITIONS_MS = 7 * 86_400_000;

/**
 * `pending` : à envoyer ; `synced` : reçue par le serveur ; `rejected` : refusée
 * pour de bon par le serveur, elle ne repart plus et attend d'être retirée.
 */
export type CaptureStatus = 'pending' | 'synced' | 'rejected';

export type LocalCapture = {
  id: string;
  pecheur_id: string;
  embarcation_id: string;
  espece: EspeceMVP | string;
  quantite_kg: number;
  methode: MethodeMVP | string;
  point_debarquement: string;
  date_capture: string;
  /** Prix de vente déclaré au kilo, facultatif. */
  prix_fcfa_kg: number | null;
  /** Lieu de pêche [longitude, latitude], si le pêcheur l'a joint. */
  position: [number, number] | null;
  sync_status: CaptureStatus;
  created_at: string;
  last_error: string | null;
};

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function ensureColumn(
  db: SQLite.SQLiteDatabase,
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (!columns.some((c) => c.name === column)) {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('pigap_captures.db');
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS captures_local (
          id TEXT PRIMARY KEY NOT NULL,
          pecheur_id TEXT NOT NULL,
          embarcation_id TEXT NOT NULL,
          espece TEXT NOT NULL,
          quantite_kg REAL NOT NULL,
          methode TEXT NOT NULL,
          point_debarquement TEXT NOT NULL,
          date_capture TEXT NOT NULL,
          sync_status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          last_error TEXT
        );
        CREATE TABLE IF NOT EXISTS positions_local (
          id TEXT PRIMARY KEY NOT NULL,
          embarcation_id TEXT NOT NULL,
          lon REAL NOT NULL,
          lat REAL NOT NULL,
          horodatage TEXT NOT NULL,
          sync_status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          last_error TEXT
        );
        CREATE INDEX IF NOT EXISTS ix_positions_local_status
          ON positions_local (sync_status, horodatage);
        CREATE TABLE IF NOT EXISTS embarcations_cache (
          id TEXT PRIMARY KEY NOT NULL,
          pecheur_id TEXT NOT NULL,
          nom TEXT NOT NULL,
          immatriculation TEXT NOT NULL,
          type TEXT,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS bateaux_connus (
          utilisateur_id TEXT NOT NULL,
          id TEXT NOT NULL,
          pecheur_id TEXT NOT NULL,
          nom TEXT NOT NULL,
          immatriculation TEXT NOT NULL,
          type TEXT,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (utilisateur_id, id)
        );
      `);
      // Évolutions de schéma : colonnes ajoutées sur les installations existantes
      await ensureColumn(db, 'captures_local', 'utilisateur_id', 'TEXT');
      await ensureColumn(db, 'captures_local', 'position_lon', 'REAL');
      await ensureColumn(db, 'captures_local', 'position_lat', 'REAL');
      await ensureColumn(db, 'captures_local', 'prix_fcfa_kg', 'INTEGER');
      await ensureColumn(db, 'positions_local', 'utilisateur_id', 'TEXT');
      return db;
    })().catch((err) => {
      // Une ouverture ratée ne doit pas condamner les appels suivants
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

/** Seules les lignes du compte : aucune saisie ne part sous un autre compte (ADR-012). */
const OWNER_FILTER = 'utilisateur_id = ?';

const KEY_ORPHAN_POSITIONS = 'orphelins_positions_attribues_a';
const KEY_ORPHAN_CAPTURES = 'orphelins_captures_attribues_a';

/**
 * Les saisies faites avant que l'application ne mémorise leur auteur n'ont pas
 * de propriétaire. Elles sont attribuées une fois pour toutes : les relevés GPS
 * au premier compte pêcheur connecté après la mise à jour, les déclarations et
 * les bateaux connus au premier compte connecté. Ensuite, plus rien n'est
 * réattribué.
 */
export async function claimOrphanRows(utilisateurId: string, estPecheur: boolean): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  const done = async (key: string) =>
    Boolean(
      (await db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [key]))
        ?.value,
    );
  const mark = (key: string) =>
    db.runAsync(
      'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, now],
    );

  if (!(await done(KEY_ORPHAN_CAPTURES))) {
    await db.runAsync('UPDATE captures_local SET utilisateur_id = ? WHERE utilisateur_id IS NULL', [
      utilisateurId,
    ]);
    // Bateaux gardés par la version précédente, qui ne connaissait pas leur compte
    await db.runAsync(
      `INSERT OR IGNORE INTO bateaux_connus
         (utilisateur_id, id, pecheur_id, nom, immatriculation, type, updated_at)
       SELECT ?, id, pecheur_id, nom, immatriculation, type, updated_at FROM embarcations_cache`,
      [utilisateurId],
    );
    await db.runAsync('DELETE FROM embarcations_cache');
    await mark(KEY_ORPHAN_CAPTURES);
  }
  if (estPecheur && !(await done(KEY_ORPHAN_POSITIONS))) {
    await db.runAsync('UPDATE positions_local SET utilisateur_id = ? WHERE utilisateur_id IS NULL', [
      utilisateurId,
    ]);
    await mark(KEY_ORPHAN_POSITIONS);
  }
}

function rowToCapture(row: Record<string, unknown>): LocalCapture {
  const lon = row.position_lon == null ? null : Number(row.position_lon);
  const lat = row.position_lat == null ? null : Number(row.position_lat);
  const status = String(row.sync_status);
  return {
    id: String(row.id),
    pecheur_id: String(row.pecheur_id),
    embarcation_id: String(row.embarcation_id),
    espece: String(row.espece),
    quantite_kg: Number(row.quantite_kg),
    methode: String(row.methode),
    point_debarquement: String(row.point_debarquement),
    date_capture: String(row.date_capture),
    prix_fcfa_kg:
      row.prix_fcfa_kg == null || row.prix_fcfa_kg === ''
        ? null
        : Number(row.prix_fcfa_kg),
    position:
      lon != null && lat != null && Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null,
    sync_status: status === 'synced' ? 'synced' : status === 'rejected' ? 'rejected' : 'pending',
    created_at: String(row.created_at),
    last_error: row.last_error == null ? null : String(row.last_error),
  };
}

export async function enqueueCapture(input: {
  id: string;
  utilisateur_id: string;
  pecheur_id: string;
  embarcation_id: string;
  espece: string;
  quantite_kg: number;
  methode: string;
  point_debarquement: string;
  date_capture: string;
  prix_fcfa_kg?: number | null;
  /** Lieu de pêche [longitude, latitude] ; absent si le pêcheur l'a retiré. */
  position?: [number, number] | null;
}): Promise<LocalCapture> {
  const db = await getDb();
  const created_at = new Date().toISOString();
  const position = input.position ?? null;
  const prix = input.prix_fcfa_kg ?? null;
  await db.runAsync(
    `INSERT INTO captures_local (
      id, utilisateur_id, pecheur_id, embarcation_id, espece, quantite_kg, methode,
      point_debarquement, date_capture, position_lon, position_lat, prix_fcfa_kg,
      sync_status, created_at, last_error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL)`,
    [
      input.id,
      input.utilisateur_id,
      input.pecheur_id,
      input.embarcation_id,
      input.espece,
      input.quantite_kg,
      input.methode,
      input.point_debarquement,
      input.date_capture,
      position ? position[0] : null,
      position ? position[1] : null,
      prix,
      created_at,
    ],
  );
  return {
    id: input.id,
    pecheur_id: input.pecheur_id,
    embarcation_id: input.embarcation_id,
    espece: input.espece,
    quantite_kg: input.quantite_kg,
    methode: input.methode,
    point_debarquement: input.point_debarquement,
    date_capture: input.date_capture,
    prix_fcfa_kg: prix,
    position,
    sync_status: 'pending',
    created_at,
    last_error: null,
  };
}

export async function listLocalCaptures(utilisateurId: string): Promise<LocalCapture[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM captures_local WHERE ${OWNER_FILTER} ORDER BY created_at DESC`,
    [utilisateurId],
  );
  return rows.map(rowToCapture);
}

/**
 * Déclarations à envoyer. Celles qui ont déjà essuyé une erreur passent après
 * les autres : une saisie en difficulté ne retarde jamais une saisie saine.
 */
export async function listPendingCaptures(utilisateurId: string): Promise<LocalCapture[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM captures_local
     WHERE sync_status = 'pending' AND ${OWNER_FILTER}
     ORDER BY (last_error IS NOT NULL) ASC, created_at ASC`,
    [utilisateurId],
  );
  return rows.map(rowToCapture);
}

export async function markSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE captures_local SET sync_status = 'synced', last_error = NULL
     WHERE id IN (${placeholders})`,
    ids,
  );
}

/** Erreur passagère : la déclaration reste à envoyer, le motif est gardé. */
export async function markSyncError(id: string, message: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE captures_local SET last_error = ? WHERE id = ?`, [
    message.slice(0, 500),
    id,
  ]);
}

/** Refus définitif du serveur : la déclaration ne sera pas renvoyée. */
export async function markCaptureRejected(id: string, message: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE captures_local SET sync_status = 'rejected', last_error = ? WHERE id = ?`,
    [message.slice(0, 500), id],
  );
}

/** Retire de la liste une déclaration refusée, à la demande de son auteur. */
export async function deleteRejectedCapture(utilisateurId: string, id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `DELETE FROM captures_local WHERE id = ? AND sync_status = 'rejected' AND ${OWNER_FILTER}`,
    [id, utilisateurId],
  );
}

export async function countByStatus(
  utilisateurId: string,
): Promise<{ pending: number; synced: number; rejected: number }> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ sync_status: string; c: number }>(
    `SELECT sync_status, COUNT(*) AS c FROM captures_local
     WHERE ${OWNER_FILTER} GROUP BY sync_status`,
    [utilisateurId],
  );
  const out = { pending: 0, synced: 0, rejected: 0 };
  for (const row of rows) {
    if (row.sync_status === 'pending') out.pending = Number(row.c);
    if (row.sync_status === 'synced') out.synced = Number(row.c);
    if (row.sync_status === 'rejected') out.rejected = Number(row.c);
  }
  return out;
}

export type CachedEmbarcation = {
  id: string;
  pecheur_id: string;
  nom: string;
  immatriculation: string;
  type?: string | null;
};

/**
 * Remplace la liste des bateaux du compte, dès qu'une lecture réseau réussit.
 * Chaque compte a sa propre liste : un agent qui se connecte sur le téléphone
 * d'un pêcheur n'efface pas les bateaux de celui-ci.
 */
export async function cacheEmbarcations(
  utilisateurId: string,
  boats: CachedEmbarcation[],
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM bateaux_connus WHERE ${OWNER_FILTER}`, [utilisateurId]);
    for (const b of boats) {
      await db.runAsync(
        `INSERT OR REPLACE INTO bateaux_connus
           (utilisateur_id, id, pecheur_id, nom, immatriculation, type, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [utilisateurId, b.id, b.pecheur_id, b.nom, b.immatriculation, b.type ?? null, now],
      );
    }
  });
}

/** Bateaux connus du téléphone : permet de déclarer et de suivre sans réseau. */
export async function listCachedEmbarcations(utilisateurId: string): Promise<CachedEmbarcation[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT id, pecheur_id, nom, immatriculation, type FROM bateaux_connus
     WHERE ${OWNER_FILTER} ORDER BY nom`,
    [utilisateurId],
  );
  return rows.map((row) => ({
    id: String(row.id),
    pecheur_id: String(row.pecheur_id),
    nom: String(row.nom),
    immatriculation: String(row.immatriculation),
    type: row.type == null ? null : String(row.type),
  }));
}


/* Positions GPS hors ligne (§5.2) */

export type LocalPosition = {
  id: string;
  embarcation_id: string;
  lon: number;
  lat: number;
  horodatage: string;
  sync_status: 'pending' | 'synced' | 'rejected';
  created_at: string;
  last_error: string | null;
};

function rowToPosition(row: Record<string, unknown>): LocalPosition {
  const status = String(row.sync_status);
  return {
    id: String(row.id),
    embarcation_id: String(row.embarcation_id),
    lon: Number(row.lon),
    lat: Number(row.lat),
    horodatage: String(row.horodatage),
    sync_status: status === 'synced' ? 'synced' : status === 'rejected' ? 'rejected' : 'pending',
    created_at: String(row.created_at),
    last_error: row.last_error == null ? null : String(row.last_error),
  };
}

function newId(): string {
  const hex = () => Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
  return `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-${hex()}-${hex()}${hex()}${hex()}`;
}

/** Écrit la position sur le téléphone (toujours, même avec du réseau). */
export async function enqueuePosition(input: {
  utilisateur_id: string;
  embarcation_id: string;
  lon: number;
  lat: number;
  horodatage: string;
}): Promise<LocalPosition> {
  const db = await getDb();
  const id = newId();
  const created_at = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO positions_local
       (id, utilisateur_id, embarcation_id, lon, lat, horodatage, sync_status, created_at, last_error)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, NULL)`,
    [id, input.utilisateur_id, input.embarcation_id, input.lon, input.lat, input.horodatage, created_at],
  );
  return {
    id,
    embarcation_id: input.embarcation_id,
    lon: input.lon,
    lat: input.lat,
    horodatage: input.horodatage,
    sync_status: 'pending',
    created_at,
    last_error: null,
  };
}

export async function listPendingPositions(utilisateurId: string): Promise<LocalPosition[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM positions_local
     WHERE sync_status = 'pending' AND ${OWNER_FILTER}
     ORDER BY horodatage ASC`,
    [utilisateurId],
  );
  return rows.map(rowToPosition);
}

export async function countPendingPositions(utilisateurId: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) AS c FROM positions_local WHERE sync_status = 'pending' AND ${OWNER_FILTER}`,
    [utilisateurId],
  );
  return Number(row?.c ?? 0);
}

/** Relevés d'un bateau encore sur le téléphone : affichés sur la carte avant leur envoi. */
export async function listPendingPositionsForBoat(
  utilisateurId: string,
  embarcationId: string,
): Promise<LocalPosition[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM positions_local
     WHERE sync_status = 'pending' AND embarcation_id = ? AND ${OWNER_FILTER}
     ORDER BY horodatage ASC`,
    [embarcationId, utilisateurId],
  );
  return rows.map(rowToPosition);
}

/** Décompte des relevés d'un bateau pris depuis une date (suivi en cours). */
export async function countPositionsSince(
  utilisateurId: string,
  embarcationId: string,
  sinceIso: string,
): Promise<{ total: number; pending: number; synced: number; rejected: number }> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ sync_status: string; c: number }>(
    `SELECT sync_status, COUNT(*) AS c FROM positions_local
     WHERE embarcation_id = ? AND created_at >= ? AND ${OWNER_FILTER}
     GROUP BY sync_status`,
    [embarcationId, sinceIso, utilisateurId],
  );
  const out = { total: 0, pending: 0, synced: 0, rejected: 0 };
  for (const row of rows) {
    const n = Number(row.c);
    out.total += n;
    if (row.sync_status === 'pending') out.pending = n;
    else if (row.sync_status === 'synced') out.synced = n;
    else if (row.sync_status === 'rejected') out.rejected = n;
  }
  return out;
}

/** Les positions traitées depuis plus de sept jours n'ont plus d'utilité locale. */
async function purgeOldPositions(db: SQLite.SQLiteDatabase): Promise<void> {
  const cutoff = new Date(Date.now() - RETENTION_POSITIONS_MS).toISOString();
  await db.runAsync(
    `DELETE FROM positions_local WHERE sync_status IN ('synced', 'rejected') AND created_at < ?`,
    [cutoff],
  );
}

export async function markPositionsSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE positions_local SET sync_status = 'synced', last_error = NULL WHERE id IN (${placeholders})`,
    ids,
  );
  await purgeOldPositions(db);
}

/** Refus définitif du serveur : la position ne sera pas renvoyée. */
export async function markPositionsRejected(ids: string[], message: string): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE positions_local SET sync_status = 'rejected', last_error = ? WHERE id IN (${placeholders})`,
    [message.slice(0, 500), ...ids],
  );
  await purgeOldPositions(db);
}


/* Réglages locaux de l'application (écran de bienvenue vu, état du suivi…) */

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ?',
    [key],
  );
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}

export async function deleteSetting(key: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM app_settings WHERE key = ?', [key]);
}

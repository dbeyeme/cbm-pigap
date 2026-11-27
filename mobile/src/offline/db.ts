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

/**
 * Provenance du lieu de pêche (lot 11) : `gps` (position du téléphone),
 * `saisie` (coordonnées tapées), `trace` (point proposé depuis la trace de la
 * sortie). `null` sans lieu, ou pour une déclaration enregistrée avant que
 * l'application ne note la provenance.
 */
export type OrigineLieu = 'gps' | 'saisie' | 'trace';

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
  origine_lieu: OrigineLieu | null;
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
      await ensureColumn(db, 'captures_local', 'origine_lieu', 'TEXT');
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS sorties_local (
          client_id TEXT PRIMARY KEY NOT NULL,
          utilisateur_id TEXT NOT NULL,
          embarcation_id TEXT NOT NULL,
          embarcation_nom TEXT,
          port_depart_id TEXT,
          depart_lon REAL,
          depart_lat REAL,
          depart_a TEXT NOT NULL,
          retour_prevu_a TEXT NOT NULL,
          secteur_vise TEXT,
          retour_a TEXT,
          port_retour_id TEXT,
          retour_lon REAL,
          retour_lat REAL,
          revision INTEGER NOT NULL DEFAULT 1,
          sync_status TEXT NOT NULL,
          server_id TEXT,
          created_at TEXT NOT NULL,
          last_error TEXT
        );
        CREATE INDEX IF NOT EXISTS ix_sorties_local_owner
          ON sorties_local (utilisateur_id, depart_a);
      `);
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

function asOrigineLieu(value: unknown): OrigineLieu | null {
  return value === 'gps' || value === 'saisie' || value === 'trace' ? value : null;
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
    origine_lieu: asOrigineLieu(row.origine_lieu),
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
  /** Provenance du lieu ; ignorée sans lieu. */
  origine_lieu?: OrigineLieu | null;
}): Promise<LocalCapture> {
  const db = await getDb();
  const created_at = new Date().toISOString();
  const position = input.position ?? null;
  const origine = position ? (input.origine_lieu ?? null) : null;
  const prix = input.prix_fcfa_kg ?? null;
  await db.runAsync(
    `INSERT INTO captures_local (
      id, utilisateur_id, pecheur_id, embarcation_id, espece, quantite_kg, methode,
      point_debarquement, date_capture, position_lon, position_lat, prix_fcfa_kg,
      origine_lieu, sync_status, created_at, last_error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL)`,
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
      origine,
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
    origine_lieu: origine,
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


/* Sorties en mer (lot 11, ADR-016) */

/** Durée de conservation locale d'une sortie close et reçue par le serveur. */
const RETENTION_SORTIES_MS = 7 * 86_400_000;

export type SortieStatus = 'pending' | 'synced' | 'rejected';

export type LocalSortie = {
  /** Identifiant tiré sur le téléphone : un renvoi ne crée jamais de doublon. */
  client_id: string;
  embarcation_id: string;
  embarcation_nom: string | null;
  port_depart_id: string | null;
  /** Point de départ [longitude, latitude], à défaut de port. */
  position_depart: [number, number] | null;
  depart_a: string;
  retour_prevu_a: string;
  secteur_vise: string | null;
  retour_a: string | null;
  port_retour_id: string | null;
  position_retour: [number, number] | null;
  /** Augmente à chaque changement local : un envoi ne marque reçue que la version envoyée. */
  revision: number;
  sync_status: SortieStatus;
  /** Identifiant donné par le serveur, une fois la sortie reçue. */
  server_id: string | null;
  created_at: string;
  last_error: string | null;
};

function pointFrom(lon: unknown, lat: unknown): [number, number] | null {
  if (lon == null || lat == null) return null;
  const x = Number(lon);
  const y = Number(lat);
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
}

function optText(value: unknown): string | null {
  return value == null || value === '' ? null : String(value);
}

function rowToSortie(row: Record<string, unknown>): LocalSortie {
  const status = String(row.sync_status);
  return {
    client_id: String(row.client_id),
    embarcation_id: String(row.embarcation_id),
    embarcation_nom: optText(row.embarcation_nom),
    port_depart_id: optText(row.port_depart_id),
    position_depart: pointFrom(row.depart_lon, row.depart_lat),
    depart_a: String(row.depart_a),
    retour_prevu_a: String(row.retour_prevu_a),
    secteur_vise: optText(row.secteur_vise),
    retour_a: optText(row.retour_a),
    port_retour_id: optText(row.port_retour_id),
    position_retour: pointFrom(row.retour_lon, row.retour_lat),
    revision: Number(row.revision ?? 1),
    sync_status: status === 'synced' ? 'synced' : status === 'rejected' ? 'rejected' : 'pending',
    server_id: optText(row.server_id),
    created_at: String(row.created_at),
    last_error: optText(row.last_error),
  };
}

/** Écrit la sortie sur le téléphone avant toute tentative d'envoi. */
export async function enqueueSortie(input: {
  client_id: string;
  utilisateur_id: string;
  embarcation_id: string;
  embarcation_nom?: string | null;
  port_depart_id?: string | null;
  position_depart?: [number, number] | null;
  depart_a: string;
  retour_prevu_a: string;
  secteur_vise?: string | null;
}): Promise<LocalSortie> {
  const db = await getDb();
  const created_at = new Date().toISOString();
  const depart = input.position_depart ?? null;
  await db.runAsync(
    `INSERT INTO sorties_local (
      client_id, utilisateur_id, embarcation_id, embarcation_nom, port_depart_id,
      depart_lon, depart_lat, depart_a, retour_prevu_a, secteur_vise,
      revision, sync_status, created_at, last_error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'pending', ?, NULL)`,
    [
      input.client_id,
      input.utilisateur_id,
      input.embarcation_id,
      input.embarcation_nom ?? null,
      input.port_depart_id ?? null,
      depart ? depart[0] : null,
      depart ? depart[1] : null,
      input.depart_a,
      input.retour_prevu_a,
      input.secteur_vise ?? null,
      created_at,
    ],
  );
  return {
    client_id: input.client_id,
    embarcation_id: input.embarcation_id,
    embarcation_nom: input.embarcation_nom ?? null,
    port_depart_id: input.port_depart_id ?? null,
    position_depart: depart,
    depart_a: input.depart_a,
    retour_prevu_a: input.retour_prevu_a,
    secteur_vise: input.secteur_vise ?? null,
    retour_a: null,
    port_retour_id: null,
    position_retour: null,
    revision: 1,
    sync_status: 'pending',
    server_id: null,
    created_at,
    last_error: null,
  };
}

/**
 * Clôt la sortie sur le téléphone ; elle repart, complète, au prochain envoi.
 * Sans effet sur une sortie déjà close ou refusée.
 */
export async function declareRetourLocal(
  utilisateurId: string,
  clientId: string,
  retour: {
    retour_a: string;
    port_retour_id?: string | null;
    position_retour?: [number, number] | null;
  },
): Promise<boolean> {
  const db = await getDb();
  const point = retour.position_retour ?? null;
  const result = await db.runAsync(
    `UPDATE sorties_local
     SET retour_a = ?, port_retour_id = ?, retour_lon = ?, retour_lat = ?,
         revision = revision + 1, sync_status = 'pending', last_error = NULL
     WHERE client_id = ? AND ${OWNER_FILTER} AND retour_a IS NULL AND sync_status != 'rejected'`,
    [
      retour.retour_a,
      retour.port_retour_id ?? null,
      point ? point[0] : null,
      point ? point[1] : null,
      clientId,
      utilisateurId,
    ],
  );
  return result.changes > 0;
}

/** Sortie en cours du compte (la plus récente non close), pour un bateau ou pour tous. */
export async function currentSortie(
  utilisateurId: string,
  embarcationId?: string | null,
): Promise<LocalSortie | null> {
  const db = await getDb();
  const row = embarcationId
    ? await db.getFirstAsync<Record<string, unknown>>(
        `SELECT * FROM sorties_local
         WHERE ${OWNER_FILTER} AND embarcation_id = ? AND retour_a IS NULL AND sync_status != 'rejected'
         ORDER BY depart_a DESC LIMIT 1`,
        [utilisateurId, embarcationId],
      )
    : await db.getFirstAsync<Record<string, unknown>>(
        `SELECT * FROM sorties_local
         WHERE ${OWNER_FILTER} AND retour_a IS NULL AND sync_status != 'rejected'
         ORDER BY depart_a DESC LIMIT 1`,
        [utilisateurId],
      );
  return row ? rowToSortie(row) : null;
}

/** Sorties à envoyer, dans l'ordre des départs : un départ ne double jamais le précédent. */
export async function listPendingSorties(utilisateurId: string): Promise<LocalSortie[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM sorties_local
     WHERE sync_status = 'pending' AND ${OWNER_FILTER}
     ORDER BY depart_a ASC, created_at ASC`,
    [utilisateurId],
  );
  return rows.map(rowToSortie);
}

export async function countPendingSorties(utilisateurId: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) AS c FROM sorties_local WHERE sync_status = 'pending' AND ${OWNER_FILTER}`,
    [utilisateurId],
  );
  return Number(row?.c ?? 0);
}

/** Sorties refusées pour de bon, montrées jusqu'à ce que leur auteur les retire. */
export async function listRejectedSorties(utilisateurId: string): Promise<LocalSortie[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM sorties_local
     WHERE sync_status = 'rejected' AND ${OWNER_FILTER}
     ORDER BY depart_a DESC`,
    [utilisateurId],
  );
  return rows.map(rowToSortie);
}

export async function deleteRejectedSortie(utilisateurId: string, clientId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `DELETE FROM sorties_local WHERE client_id = ? AND sync_status = 'rejected' AND ${OWNER_FILTER}`,
    [clientId, utilisateurId],
  );
}

/**
 * Le serveur a reçu la sortie. Elle n'est marquée reçue que si rien n'a changé
 * sur le téléphone depuis l'envoi (retour déclaré entre-temps, par exemple) ;
 * sinon elle repartira, complète, au prochain envoi. Un retour constaté par un
 * agent est reporté sur le téléphone.
 */
export async function markSortieSynced(
  clientId: string,
  revision: number,
  serveur: { id: string | null; retour_a: string | null },
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE sorties_local SET server_id = COALESCE(?, server_id), retour_a = COALESCE(retour_a, ?)
     WHERE client_id = ?`,
    [serveur.id, serveur.retour_a, clientId],
  );
  await db.runAsync(
    `UPDATE sorties_local SET sync_status = 'synced', last_error = NULL
     WHERE client_id = ? AND revision = ?`,
    [clientId, revision],
  );
  const cutoff = new Date(Date.now() - RETENTION_SORTIES_MS).toISOString();
  await db.runAsync(
    `DELETE FROM sorties_local WHERE sync_status = 'synced' AND retour_a IS NOT NULL AND retour_a < ?`,
    [cutoff],
  );
}

/** Erreur passagère : la sortie reste à envoyer, le motif est gardé. */
export async function markSortieError(clientId: string, message: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE sorties_local SET last_error = ? WHERE client_id = ?`, [
    message.slice(0, 500),
    clientId,
  ]);
}

/** Refus définitif du serveur : la sortie ne sera pas renvoyée. */
export async function markSortieRejected(clientId: string, message: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE sorties_local SET sync_status = 'rejected', last_error = ? WHERE client_id = ?`,
    [message.slice(0, 500), clientId],
  );
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

/**
 * SQLite offline-first pour déclarations de captures (§5.4 / ADR-001) et
 * positions GPS (§5.2). Toute saisie est écrite localement avant tentative de
 * sync réseau.
 */
import * as SQLite from 'expo-sqlite';

import type { EspeceMVP, MethodeMVP, SyncStatus } from './catalog';

export type LocalCapture = {
  id: string;
  pecheur_id: string;
  embarcation_id: string;
  espece: EspeceMVP | string;
  quantite_kg: number;
  methode: MethodeMVP | string;
  point_debarquement: string;
  date_capture: string;
  sync_status: SyncStatus;
  created_at: string;
  last_error: string | null;
};

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

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
      `);
      return db;
    })();
  }
  return dbPromise;
}

function rowToCapture(row: Record<string, unknown>): LocalCapture {
  return {
    id: String(row.id),
    pecheur_id: String(row.pecheur_id),
    embarcation_id: String(row.embarcation_id),
    espece: String(row.espece),
    quantite_kg: Number(row.quantite_kg),
    methode: String(row.methode),
    point_debarquement: String(row.point_debarquement),
    date_capture: String(row.date_capture),
    sync_status: row.sync_status === 'synced' ? 'synced' : 'pending',
    created_at: String(row.created_at),
    last_error: row.last_error == null ? null : String(row.last_error),
  };
}

export async function enqueueCapture(input: {
  id: string;
  pecheur_id: string;
  embarcation_id: string;
  espece: string;
  quantite_kg: number;
  methode: string;
  point_debarquement: string;
  date_capture: string;
}): Promise<LocalCapture> {
  const db = await getDb();
  const created_at = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO captures_local (
      id, pecheur_id, embarcation_id, espece, quantite_kg, methode,
      point_debarquement, date_capture, sync_status, created_at, last_error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL)`,
    [
      input.id,
      input.pecheur_id,
      input.embarcation_id,
      input.espece,
      input.quantite_kg,
      input.methode,
      input.point_debarquement,
      input.date_capture,
      created_at,
    ],
  );
  return {
    ...input,
    sync_status: 'pending',
    created_at,
    last_error: null,
  };
}

export async function listLocalCaptures(): Promise<LocalCapture[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM captures_local ORDER BY created_at DESC`,
  );
  return rows.map(rowToCapture);
}

export async function listPendingCaptures(): Promise<LocalCapture[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM captures_local WHERE sync_status = 'pending' ORDER BY created_at ASC`,
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

export async function markSyncError(id: string, message: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE captures_local SET last_error = ? WHERE id = ?`, [
    message.slice(0, 500),
    id,
  ]);
}

export async function countByStatus(): Promise<{ pending: number; synced: number }> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ sync_status: string; c: number }>(
    `SELECT sync_status, COUNT(*) AS c FROM captures_local GROUP BY sync_status`,
  );
  let pending = 0;
  let synced = 0;
  for (const row of rows) {
    if (row.sync_status === 'pending') pending = Number(row.c);
    if (row.sync_status === 'synced') synced = Number(row.c);
  }
  return { pending, synced };
}

export type CachedEmbarcation = {
  id: string;
  pecheur_id: string;
  nom: string;
  immatriculation: string;
  type?: string | null;
};

/** Remplace le cache embarcations (appelé dès qu'un fetch réseau réussit). */
export async function cacheEmbarcations(boats: CachedEmbarcation[]): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execAsync('DELETE FROM embarcations_cache');
  for (const b of boats) {
    await db.runAsync(
      `INSERT INTO embarcations_cache (id, pecheur_id, nom, immatriculation, type, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [b.id, b.pecheur_id, b.nom, b.immatriculation, b.type ?? null, now],
    );
  }
}

/** Lecture cache — permet la déclaration hors-ligne à froid. */
export async function listCachedEmbarcations(): Promise<CachedEmbarcation[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT id, pecheur_id, nom, immatriculation, type FROM embarcations_cache ORDER BY nom`,
  );
  return rows.map((row) => ({
    id: String(row.id),
    pecheur_id: String(row.pecheur_id),
    nom: String(row.nom),
    immatriculation: String(row.immatriculation),
    type: row.type == null ? null : String(row.type),
  }));
}


/* ——— Positions GPS hors-ligne (§5.2) ——— */

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

/** Écrit la position localement (toujours, même avec réseau). */
export async function enqueuePosition(input: {
  embarcation_id: string;
  lon: number;
  lat: number;
  horodatage: string;
}): Promise<LocalPosition> {
  const db = await getDb();
  const id = newId();
  const created_at = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO positions_local (id, embarcation_id, lon, lat, horodatage, sync_status, created_at, last_error)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, NULL)`,
    [id, input.embarcation_id, input.lon, input.lat, input.horodatage, created_at],
  );
  return { id, ...input, sync_status: 'pending', created_at, last_error: null };
}

export async function listPendingPositions(): Promise<LocalPosition[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM positions_local WHERE sync_status = 'pending' ORDER BY horodatage ASC`,
  );
  return rows.map(rowToPosition);
}

export async function countPendingPositions(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) AS c FROM positions_local WHERE sync_status = 'pending'`,
  );
  return Number(row?.c ?? 0);
}

export async function markPositionsSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE positions_local SET sync_status = 'synced', last_error = NULL WHERE id IN (${placeholders})`,
    ids,
  );
  // Les positions envoyées depuis plus de 7 jours n'ont plus d'utilité locale
  const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString();
  await db.runAsync(
    `DELETE FROM positions_local WHERE sync_status = 'synced' AND created_at < ?`,
    [cutoff],
  );
}

/** Refus métier du serveur : la position ne sera pas renvoyée. */
export async function markPositionsRejected(ids: string[], message: string): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE positions_local SET sync_status = 'rejected', last_error = ? WHERE id IN (${placeholders})`,
    [message.slice(0, 500), ...ids],
  );
}


// ---------------------------------------------------------------------------
// Réglages locaux de l'application (ex. écran de bienvenue déjà vu)
// ---------------------------------------------------------------------------

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

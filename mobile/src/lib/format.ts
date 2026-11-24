/**
 * Mise en forme des valeurs affichées : heures (« 18 h 05 »), dates, pluriels
 * exacts, coordonnées. Fonctions pures, sans dépendance.
 */

/** Espace insécable : un nombre ne se sépare jamais de son unité. */
const NBSP = ' ';

function toDate(value: string | number | Date): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** « 18 h 05 » */
export function formatHeure(value: string | number | Date): string {
  const d = toDate(value);
  if (!d) return '';
  return `${d.getHours()}${NBSP}h${NBSP}${pad(d.getMinutes())}`;
}

/** « 24/11/2026 » */
export function formatDate(value: string | number | Date): string {
  const d = toDate(value);
  if (!d) return '';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Date seule (« 2027-01-15 ») affichée sans décalage de fuseau : « 15/01/2027 ». */
export function formatJour(isoDay: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDay ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** « 24/11/2026 à 18 h 05 » */
export function formatDateHeure(value: string | number | Date): string {
  const d = toDate(value);
  if (!d) return '';
  return `${formatDate(d)} à ${formatHeure(d)}`;
}

/** « à 18 h 05 » le jour même, « le 23/11/2026 à 18 h 05 » sinon. */
export function formatMoment(value: string | number | Date, now: Date = new Date()): string {
  const d = toDate(value);
  if (!d) return '';
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return sameDay ? `à ${formatHeure(d)}` : `le ${formatDate(d)} à ${formatHeure(d)}`;
}

/** « 1 relevé », « 3 relevés » : le nombre reste collé à son nom. */
export function pluriel(n: number, singulier: string, plusieurs: string): string {
  return `${n}${NBSP}${n > 1 ? plusieurs : singulier}`;
}

/** Nombre à virgule française, sans zéros inutiles. */
export function formatNombre(value: number, decimales = 0): string {
  return value.toFixed(decimales).replace('.', ',');
}

/** « 12 500 FCFA » */
export function formatFcfa(value: number): string {
  const entier = Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${entier}${NBSP}FCFA`;
}

/* Coordonnées géographiques */

export type Hemisphere = 'N' | 'S';

/** « 0,3845° N · 9,2410° E » : quatre décimales, soit une dizaine de mètres. */
export function formatCoordonnees(lon: number, lat: number): string {
  const ns = lat < 0 ? 'S' : 'N';
  const eo = lon < 0 ? 'O' : 'E';
  return `${formatNombre(Math.abs(lat), 4)}°${NBSP}${ns} · ${formatNombre(Math.abs(lon), 4)}°${NBSP}${eo}`;
}

/** Lit un nombre saisi à la française (« 0,3845 ») ou à l'anglaise (« 0.3845 »). */
export function parseNombre(text: string): number | null {
  const cleaned = text.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/**
 * Convertit une saisie manuelle (latitude avec son hémisphère, longitude est)
 * en position [longitude, latitude]. `null` si la saisie n'est pas un point du globe.
 */
export function parsePosition(
  latitudeText: string,
  hemisphere: Hemisphere,
  longitudeText: string,
): [number, number] | null {
  const lat = parseNombre(latitudeText);
  const lon = parseNombre(longitudeText);
  if (lat == null || lon == null || lat > 90 || lon > 180) return null;
  return [lon, hemisphere === 'S' ? -lat : lat];
}

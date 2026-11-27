/**
 * Sorties en mer (lot 11, ADR-016) : calcul de l'heure de retour prévue,
 * lecture d'une heure saisie, état d'une sortie en cours. Fonctions pures, sans
 * dépendance, pour pouvoir être testées seules.
 */

/**
 * Choix rapides de l'heure de retour, en heures après le départ. Simples
 * raccourcis de saisie : la durée maximale acceptée est fixée par le serveur
 * (paramétrage `sorties.json`), pas par l'application.
 */
export const RETOUR_CHOIX_HEURES: ReadonlyArray<number> = [4, 8, 12];

/** Heure de retour prévue après un nombre d'heures. */
export function retourDans(heures: number, depuis: Date = new Date()): Date {
  return new Date(depuis.getTime() + heures * 3_600_000);
}

/**
 * Lit une heure tapée (« 14:30 », « 14 h 30 », « 14h », « 7 ») et renvoie sa
 * prochaine occurrence en heure locale du téléphone : aujourd'hui si elle est
 * encore à venir, demain sinon. `null` si l'heure est illisible.
 */
export function prochaineHeure(texte: string, maintenant: Date = new Date()): Date | null {
  const m = /^\s*(\d{1,2})\s*(?:[h:.]\s*(\d{1,2})?)?\s*$/i.exec(texte.replace(/ /g, ' '));
  if (!m) return null;
  const heures = Number(m[1]);
  const minutes = m[2] == null ? 0 : Number(m[2]);
  if (heures > 23 || minutes > 59) return null;
  const cible = new Date(maintenant);
  cible.setHours(heures, minutes, 0, 0);
  if (cible.getTime() <= maintenant.getTime()) cible.setDate(cible.getDate() + 1);
  return cible;
}

/** L'heure de retour prévue est passée. */
export function retourDepasse(retourPrevuA: string, maintenant: Date = new Date()): boolean {
  const t = Date.parse(retourPrevuA);
  return Number.isFinite(t) && maintenant.getTime() > t;
}

/** Code métier d'un refus de sortie qui ne changera pas en réessayant. */
export const SORTIE_CODES_DEFINITIFS: ReadonlyArray<string> = [
  'SORTIE_DEJA_EN_COURS',
  'SORTIE_INVALIDE',
  'SORTIE_DEJA_TERMINEE',
  'SORTIE_CLIENT_ID_REUTILISE',
];

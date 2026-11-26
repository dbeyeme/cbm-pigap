/**
 * Mise en forme de la fiche d'identité (lot 2, partie G) : registre et suivi.
 */
import { pluriel } from './format';

const MINUTE = 60;
const HEURE = 60 * MINUTE;
const JOUR = 24 * HEURE;
const MOIS = 30 * JOUR;
const AN = 365 * JOUR;

/** Ancienneté d'un relevé : « il y a 5 min », « il y a 3 h », « il y a 2 jours »… */
export function formatAnciennete(secondes: number): string {
  if (!Number.isFinite(secondes) || secondes < MINUTE) return 'à l’instant';
  if (secondes < HEURE) return `il y a ${Math.floor(secondes / MINUTE)} min`;
  if (secondes < JOUR) return `il y a ${Math.floor(secondes / HEURE)} h`;
  if (secondes < MOIS) return `il y a ${pluriel(Math.floor(secondes / JOUR), 'jour', 'jours')}`;
  if (secondes < AN) return `il y a ${Math.floor(secondes / MOIS)} mois`;
  return `il y a ${pluriel(Math.floor(secondes / AN), 'an', 'ans')}`;
}

const SOURCES: Record<string, string> = { mobile: 'Téléphone', balise: 'Balise' };

/** Origine d'un relevé : « Téléphone », « Balise ». */
export function libelleSource(source: string): string {
  return SOURCES[source] ?? source;
}

/** « 3 relevés (téléphone 2, balise 1) ». */
export function resumeReleves(total: number, parSource: Record<string, number>): string {
  const detail = Object.entries(parSource)
    .filter(([, n]) => n > 0)
    .map(([source, n]) => `${libelleSource(source).toLowerCase()} ${n}`);
  const base = pluriel(total, 'relevé', 'relevés');
  return detail.length > 1 ? `${base} (${detail.join(', ')})` : base;
}

/** Première lettre en capitale : « pirogue » devient « Pirogue ». */
export function capitale(texte: string | null | undefined): string {
  if (!texte) return '';
  const propre = texte.replace(/_/g, ' ');
  return propre.charAt(0).toUpperCase() + propre.slice(1);
}

export function libelleStatutPecheur(statut: string): string {
  if (statut === 'actif') return 'Actif';
  if (statut === 'suspendu') return 'Suspendu';
  return capitale(statut);
}

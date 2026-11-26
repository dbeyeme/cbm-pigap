/**
 * Page de profil du pêcheur (lot 2, partie F) : présentation, espèces tirées
 * de ses captures, tarifs facultatifs, ouverture au public.
 *
 * Les bornes (longueur de la présentation, nombre de tarifs, prix maximal,
 * unités admises) viennent du serveur (`limites` de `/profils/moi`) : rien
 * n'est fixé ici. Le contrôle des coordonnées dans la présentation reste au
 * serveur, qui en tient le paramétrage et renvoie un message clair.
 */
import { formatFcfa } from './format';

export type LimitesProfil = {
  presentation_max_caracteres: number;
  tarifs_max: number;
  prix_max_fcfa: number;
  unites_tarif: string[];
};

export type TarifSaisi = { espece: string; unite: string; prix_fcfa: number };

const UNITES: Record<string, { saisie: string; affichage: string }> = {
  kg: { saisie: 'Au kilo', affichage: 'le kilo' },
  unite: { saisie: 'À l’unité', affichage: 'l’unité' },
};

/** « Au kilo », « À l’unité » ; une unité nouvelle du paramétrage s'affiche telle quelle. */
export function libelleUniteSaisie(unite: string): string {
  return UNITES[unite]?.saisie ?? unite;
}

/** « 2 500 FCFA le kilo », « 1 500 FCFA l’unité ». */
export function formatTarif(prixFcfa: number, unite: string): string {
  const suffixe = UNITES[unite]?.affichage ?? unite;
  return `${formatFcfa(prixFcfa)} ${suffixe}`;
}

/** Longueur de la présentation : message si elle dépasse la borne du serveur. */
export function erreurPresentation(texte: string, limites: LimitesProfil): string | null {
  const longueur = texte.trim().length;
  const max = limites.presentation_max_caracteres;
  return longueur > max ? `Présentation trop longue : ${max} caractères au plus (${longueur} saisis).` : null;
}

export type LecturePrix = { prix: number } | { erreur: string } | null;

/**
 * Prix saisi en francs CFA entiers : « 2500 », « 2 500 » ou « 2.500 ».
 * `null` pour une saisie vide (pas de tarif).
 */
export function lirePrix(texte: string, prixMax: number): LecturePrix {
  const nettoye = texte.replace(/[\s  .]/g, '');
  if (!nettoye) return null;
  if (!/^\d+$/.test(nettoye)) return { erreur: 'Prix en francs CFA, sans centimes.' };
  const prix = Number(nettoye);
  if (prix <= 0) return { erreur: 'Prix supérieur à zéro.' };
  if (prix > prixMax) return { erreur: `Au plus ${formatFcfa(prixMax)}.` };
  return { prix };
}

/** Clé d'une case de saisie : une espèce dans une unité. */
export function cleTarif(espece: string, unite: string): string {
  return `${espece}|${unite}`;
}

/** Saisie préremplie à partir des tarifs enregistrés. */
export function saisieTarifs(tarifs: ReadonlyArray<TarifSaisi>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of tarifs) out[cleTarif(t.espece, t.unite)] = String(t.prix_fcfa);
  return out;
}

export type ConstructionTarifs = {
  tarifs: TarifSaisi[];
  /** Erreur par case (clé `cleTarif`). */
  erreurs: Record<string, string>;
  /** Erreur sur l'ensemble (nombre de tarifs). */
  erreurGenerale: string | null;
};

/**
 * Liste complète à envoyer : `tarifs` remplace toute la liste côté serveur.
 * Les cases des espèces affichées sur la page donnent leurs tarifs ; ceux des
 * autres espèces (masquées par le pêcheur) sont gardés tels quels, comme le
 * serveur les garde dans ses réglages. Un tarif dans une unité retirée du
 * paramétrage n'est pas renvoyé : le serveur le refuserait.
 */
export function construireTarifs(
  saisie: Record<string, string>,
  especesEditables: ReadonlyArray<string>,
  enregistres: ReadonlyArray<TarifSaisi>,
  limites: LimitesProfil,
): ConstructionTarifs {
  const editables = new Set(especesEditables);
  const unites = new Set(limites.unites_tarif);
  const tarifs: TarifSaisi[] = enregistres
    .filter((t) => !editables.has(t.espece) && unites.has(t.unite))
    .map(({ espece, unite, prix_fcfa }) => ({ espece, unite, prix_fcfa }));
  const erreurs: Record<string, string> = {};

  for (const espece of especesEditables) {
    for (const unite of limites.unites_tarif) {
      const cle = cleTarif(espece, unite);
      const lecture = lirePrix(saisie[cle] ?? '', limites.prix_max_fcfa);
      if (lecture === null) continue;
      if ('erreur' in lecture) erreurs[cle] = lecture.erreur;
      else tarifs.push({ espece, unite, prix_fcfa: lecture.prix });
    }
  }

  const erreurGenerale =
    tarifs.length > limites.tarifs_max ? `Votre page compte au plus ${limites.tarifs_max} tarifs.` : null;
  return { tarifs, erreurs, erreurGenerale };
}

/** Espèces affichées sur la page : déclarées, moins celles que le pêcheur masque. */
export function especesAffichees<T extends { espece: string }>(
  declarees: ReadonlyArray<T>,
  masquees: ReadonlyArray<string>,
): T[] {
  const cachees = new Set(masquees);
  return declarees.filter((e) => !cachees.has(e.espece));
}

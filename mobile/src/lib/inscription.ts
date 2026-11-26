/**
 * Informations d'inscription complémentaires d'une embarcation (lot 2,
 * partie E) : MMSI, numéro OMI, indicatif radio, jauge brute, année de
 * construction, propriétaire, exploitant. Toutes facultatives.
 *
 * La mise en forme et les contrôles reprennent ceux du serveur
 * (`ComplementsEmbarcation`, `backend/app/modules/pecheurs/schemas.py`) pour
 * signaler une erreur avant l'envoi. Ce sont des contrôles de format, sans
 * portée métier ; le serveur reste seul juge.
 */
import { parseNombre } from './format';

export const CHAMPS_INSCRIPTION = [
  'mmsi',
  'numero_omi',
  'indicatif_radio',
  'jauge_brute',
  'annee_construction',
  'proprietaire',
  'exploitant',
] as const;

export type ChampInscription = (typeof CHAMPS_INSCRIPTION)[number];

export type ComplementsEmbarcation = {
  mmsi: string | null;
  numero_omi: string | null;
  indicatif_radio: string | null;
  jauge_brute: number | null;
  annee_construction: number | null;
  proprietaire: string | null;
  exploitant: string | null;
};

/** Saisie brute du formulaire : un texte par information. */
export type SaisieInscription = Record<ChampInscription, string>;

export const SAISIE_INSCRIPTION_VIDE: SaisieInscription = {
  mmsi: '',
  numero_omi: '',
  indicatif_radio: '',
  jauge_brute: '',
  annee_construction: '',
  proprietaire: '',
  exploitant: '',
};

export const LIBELLES_INSCRIPTION: Record<ChampInscription, string> = {
  mmsi: 'MMSI',
  numero_omi: 'Numéro OMI',
  indicatif_radio: 'Indicatif radio',
  jauge_brute: 'Jauge brute',
  annee_construction: 'Année de construction',
  proprietaire: 'Propriétaire',
  exploitant: 'Exploitant',
};

/** Garde-fous de format repris du serveur. */
const JAUGE_MAX = 500_000;
const ANNEE_MIN = 1900;
const TEXTE_MAX = 255;

export type LectureInscription = {
  valeurs: ComplementsEmbarcation;
  erreurs: Partial<Record<ChampInscription, string>>;
};

function sansSeparateurs(texte: string): string {
  return texte.replace(/[\s.\-]/g, '');
}

/** Lit la saisie : valeurs mises en forme comme le serveur, et erreurs par champ. */
export function lireInscription(
  saisie: SaisieInscription,
  anneeCourante: number = new Date().getFullYear(),
): LectureInscription {
  const valeurs: ComplementsEmbarcation = {
    mmsi: null,
    numero_omi: null,
    indicatif_radio: null,
    jauge_brute: null,
    annee_construction: null,
    proprietaire: null,
    exploitant: null,
  };
  const erreurs: LectureInscription['erreurs'] = {};

  const mmsi = sansSeparateurs(saisie.mmsi);
  if (mmsi) {
    if (/^\d{9}$/.test(mmsi)) valeurs.mmsi = mmsi;
    else erreurs.mmsi = 'Le MMSI compte 9 chiffres.';
  }

  const omi = sansSeparateurs(saisie.numero_omi).replace(/^(imo|omi)/i, '');
  if (omi) {
    if (/^\d{7}$/.test(omi)) valeurs.numero_omi = omi;
    else erreurs.numero_omi = 'Le numéro OMI compte 7 chiffres.';
  }

  const indicatif = saisie.indicatif_radio.replace(/\s/g, '').toUpperCase();
  if (indicatif) {
    if (/^[A-Z0-9]{3,10}$/.test(indicatif)) valeurs.indicatif_radio = indicatif;
    else erreurs.indicatif_radio = 'L’indicatif radio compte 3 à 10 lettres ou chiffres.';
  }

  const jaugeTexte = saisie.jauge_brute.trim();
  if (jaugeTexte) {
    const jauge = parseNombre(jaugeTexte);
    if (jauge !== null && jauge > 0 && jauge <= JAUGE_MAX) valeurs.jauge_brute = jauge;
    else erreurs.jauge_brute = 'Jauge brute : un nombre positif, par exemple 12,5.';
  }

  const anneeTexte = saisie.annee_construction.trim();
  if (anneeTexte) {
    const annee = /^\d{4}$/.test(anneeTexte) ? Number(anneeTexte) : NaN;
    if (annee >= ANNEE_MIN && annee <= anneeCourante) valeurs.annee_construction = annee;
    else erreurs.annee_construction = `Année de construction : entre ${ANNEE_MIN} et ${anneeCourante}.`;
  }

  for (const champ of ['proprietaire', 'exploitant'] as const) {
    // Sur une ligne : les retours à la ligne deviennent des espaces
    const texte = saisie[champ].replace(/\s+/g, ' ').trim();
    if (!texte) continue;
    if (texte.length <= TEXTE_MAX) valeurs[champ] = texte;
    else erreurs[champ] = `${LIBELLES_INSCRIPTION[champ]} : ${TEXTE_MAX} caractères au plus.`;
  }

  return { valeurs, erreurs };
}

export function aDesErreurs(lecture: LectureInscription): boolean {
  return Object.keys(lecture.erreurs).length > 0;
}

/** Saisie préremplie à partir des informations déjà inscrites. */
export function saisieDepuis(complements: Partial<ComplementsEmbarcation>): SaisieInscription {
  const texte = (v: string | number | null | undefined) =>
    v === null || v === undefined ? '' : String(v).replace('.', ',');
  return {
    mmsi: texte(complements.mmsi),
    numero_omi: texte(complements.numero_omi),
    indicatif_radio: texte(complements.indicatif_radio),
    jauge_brute: texte(complements.jauge_brute),
    annee_construction: texte(complements.annee_construction),
    proprietaire: texte(complements.proprietaire),
    exploitant: texte(complements.exploitant),
  };
}

/** Création : seules les informations renseignées partent. */
export function payloadCreation(valeurs: ComplementsEmbarcation): Partial<ComplementsEmbarcation> {
  const out: Partial<ComplementsEmbarcation> = {};
  for (const champ of CHAMPS_INSCRIPTION) {
    const valeur = valeurs[champ];
    if (valeur !== null) (out as Record<string, unknown>)[champ] = valeur;
  }
  return out;
}

/**
 * Correction : seules les informations changées partent ; une information
 * vidée part à `null`, ce qui l'efface au registre.
 */
export function payloadCorrection(
  avant: Partial<ComplementsEmbarcation>,
  apres: ComplementsEmbarcation,
): Partial<ComplementsEmbarcation> {
  const out: Partial<ComplementsEmbarcation> = {};
  for (const champ of CHAMPS_INSCRIPTION) {
    const ancienne = avant[champ] ?? null;
    if (ancienne !== apres[champ]) (out as Record<string, unknown>)[champ] = apres[champ];
  }
  return out;
}

export type LigneInscription = { champ: ChampInscription; libelle: string; valeur: string | null };

/** Lignes à afficher : la valeur mise en forme, ou `null` si non renseignée. */
export function lignesInscription(complements: Partial<ComplementsEmbarcation>): LigneInscription[] {
  return CHAMPS_INSCRIPTION.map((champ) => {
    const brute = complements[champ];
    let valeur: string | null = null;
    if (brute !== null && brute !== undefined && brute !== '') {
      valeur = champ === 'jauge_brute' ? String(brute).replace('.', ',') : String(brute);
    }
    return { champ, libelle: LIBELLES_INSCRIPTION[champ], valeur };
  });
}

/** Au moins une information est inscrite. */
export function inscriptionRenseignee(complements: Partial<ComplementsEmbarcation>): boolean {
  return lignesInscription(complements).some((ligne) => ligne.valeur !== null);
}

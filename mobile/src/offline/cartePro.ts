/**
 * Carte professionnelle du pêcheur : lue sur le serveur quand le réseau le
 * permet, gardée sur le téléphone pour être présentée sans réseau. Elle est
 * effacée à la déconnexion.
 */
import {
  getMaCouverture,
  getPayeur,
  listTrackedEmbarcations,
  verifPubliqueLicence,
} from '../api';
import { deleteSetting, getSetting, setSetting } from './db';

export type CartePro = {
  pecheurId: string;
  /** Prénom et nom tels qu'ils figurent au registre. */
  nom: string;
  numeroLicence: string;
  /** `valide`, `sans_date`, `expiree`, `suspendue` ou `inconnue`. */
  statut: string;
  /** Date de fin de validité (« AAAA-MM-JJ »), si le serveur la connaît. */
  dateExpiration: string | null;
  embarcations: Array<{ nom: string; immatriculation: string }>;
  /** Dernière lecture réussie sur le serveur. */
  majA: string;
};

function key(utilisateurId: string): string {
  return `carte_pro_${utilisateurId}`;
}

export async function readCartePro(utilisateurId: string): Promise<CartePro | null> {
  try {
    const raw = await getSetting(key(utilisateurId));
    if (!raw) return null;
    const carte = JSON.parse(raw) as Partial<CartePro>;
    if (typeof carte.numeroLicence !== 'string' || typeof carte.nom !== 'string') return null;
    return {
      pecheurId: String(carte.pecheurId ?? ''),
      nom: carte.nom,
      numeroLicence: carte.numeroLicence,
      statut: String(carte.statut ?? 'inconnue'),
      dateExpiration: carte.dateExpiration ?? null,
      embarcations: Array.isArray(carte.embarcations) ? carte.embarcations : [],
      majA: String(carte.majA ?? ''),
    };
  } catch {
    return null;
  }
}

export async function clearCartePro(utilisateurId: string): Promise<void> {
  await deleteSetting(key(utilisateurId)).catch(() => undefined);
}

/** Lit la carte sur le serveur et la garde sur le téléphone. */
export async function fetchCartePro(token: string, utilisateurId: string): Promise<CartePro> {
  const [couverture, payeur, bateaux] = await Promise.all([
    getMaCouverture(token),
    getPayeur(token),
    listTrackedEmbarcations(token),
  ]);
  const verification = await verifPubliqueLicence(couverture.numero_licence);
  const carte: CartePro = {
    pecheurId: couverture.pecheur_id,
    nom: payeur.nom,
    numeroLicence: couverture.numero_licence,
    statut: verification.statut,
    dateExpiration: verification.date_expiration,
    embarcations: bateaux.map((b) => ({ nom: b.nom, immatriculation: b.immatriculation })),
    majA: new Date().toISOString(),
  };
  await setSetting(key(utilisateurId), JSON.stringify(carte)).catch(() => undefined);
  return carte;
}

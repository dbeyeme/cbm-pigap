/**
 * Garde locale de la règle « un appareil, un seul compte pêcheur » (ADR-012).
 * Le serveur fait foi ; cette garde évite simplement qu'un second compte
 * pêcheur s'ouvre sur un téléphone déjà rattaché, y compris tant que le serveur
 * n'applique pas encore la règle.
 *
 * Seul l'identifiant du compte est gardé, dans le stockage sécurisé : rien ne
 * permet d'afficher à qui le téléphone est rattaché. Les comptes d'agents ne
 * sont pas concernés.
 */
import * as SecureStore from 'expo-secure-store';

import { deleteSetting, getSetting, setSetting } from '../offline/db';

const BOUND_KEY = 'pigap.appareil.pecheur';

const STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

export type AttachmentVerdict =
  /** Le téléphone est déjà rattaché à ce compte. */
  | 'deja_rattache'
  /** Premier compte pêcheur sur ce téléphone : rattachement créé. */
  | 'premier'
  /** Le téléphone est rattaché à un autre compte pêcheur. */
  | 'refuse';

async function readBound(): Promise<string | null> {
  return SecureStore.getItemAsync(BOUND_KEY, STORE_OPTIONS);
}

function infoKey(utilisateurId: string): string {
  return `appareil_info_a_lire_${utilisateurId}`;
}

/**
 * Vérifie qu'un compte pêcheur peut s'ouvrir sur ce téléphone et, si c'est le
 * premier, le rattache. `serverConfirmed` : le serveur a lui-même confirmé le
 * rattachement à la connexion (il fait foi, par exemple après une libération
 * faite par un agent) ; le rattachement local est alors aligné sur sa décision.
 */
export async function attachFisher(
  utilisateurId: string,
  serverConfirmed: boolean,
): Promise<AttachmentVerdict> {
  let bound: string | null;
  try {
    bound = await readBound();
  } catch {
    // Stockage sécurisé indisponible : la garde locale ne peut pas jouer, le serveur tranche
    return 'deja_rattache';
  }
  if (bound === utilisateurId) return 'deja_rattache';
  if (bound && !serverConfirmed) return 'refuse';
  try {
    await SecureStore.setItemAsync(BOUND_KEY, utilisateurId, STORE_OPTIONS);
  } catch {
    return 'deja_rattache';
  }
  // Le pêcheur est informé du rattachement à sa première connexion
  await setSetting(infoKey(utilisateurId), new Date().toISOString()).catch(() => undefined);
  return 'premier';
}

/** L'information sur le rattachement reste à lire par ce pêcheur. */
export async function attachmentInfoPending(utilisateurId: string): Promise<boolean> {
  try {
    return Boolean(await getSetting(infoKey(utilisateurId)));
  } catch {
    return false;
  }
}

export async function acknowledgeAttachmentInfo(utilisateurId: string): Promise<void> {
  await deleteSetting(infoKey(utilisateurId)).catch(() => undefined);
}

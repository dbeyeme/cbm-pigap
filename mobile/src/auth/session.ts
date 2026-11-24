/**
 * Session de l'utilisateur, conservée dans le stockage sécurisé du téléphone
 * (trousseau iOS, Keystore Android) : l'application se rouvre sans redemander
 * le mot de passe, y compris sans réseau.
 *
 * Le mot de passe n'est jamais conservé. Le jeton est effacé à la déconnexion
 * et dès que le serveur le refuse (401). Tant que le serveur ne propose pas de
 * renouvellement, une session dure ce que dure le jeton.
 */
import * as SecureStore from 'expo-secure-store';

import { setUnauthorizedHandler, type UtilisateurMe } from '../api';
import { deleteSetting, getSetting, setSetting } from '../offline/db';

export type Session = { token: string; user: UtilisateurMe };

/** Pourquoi la session s'est terminée : choix de l'utilisateur ou refus du serveur. */
export type SessionEnd = 'deconnexion' | 'expiree';

type Listener = (session: Session | null, reason?: SessionEnd) => void;

const TOKEN_KEY = 'pigap.session.jeton';
const USER_KEY = 'pigap.session.utilisateur';
/** Marque posée quand la session expire, pour l'expliquer à la prochaine ouverture. */
const EXPIRED_SETTING = 'session_expiree_a';

/**
 * Lisible après le premier déverrouillage du téléphone : la tâche de suivi GPS
 * doit pouvoir envoyer ses relevés écran éteint.
 */
const STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

let current: Session | null = null;
const listeners = new Set<Listener>();

function notify(session: Session | null, reason?: SessionEnd): void {
  for (const listener of [...listeners]) {
    try {
      listener(session, reason);
    } catch {
      // un écran en défaut ne doit pas bloquer les autres
    }
  }
}

function parseUser(raw: string | null): UtilisateurMe | null {
  if (!raw) return null;
  try {
    const user = JSON.parse(raw) as Partial<UtilisateurMe>;
    if (typeof user.id === 'string' && typeof user.role === 'string') {
      return user as UtilisateurMe;
    }
  } catch {
    // contenu illisible : traité comme une absence de session
  }
  return null;
}

export function subscribeSession(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function currentSession(): Session | null {
  return current;
}

/** Relit la session conservée sur le téléphone ; `null` si aucune. */
export async function restoreSession(): Promise<Session | null> {
  try {
    const [token, rawUser] = await Promise.all([
      SecureStore.getItemAsync(TOKEN_KEY, STORE_OPTIONS),
      SecureStore.getItemAsync(USER_KEY, STORE_OPTIONS),
    ]);
    const user = parseUser(rawUser);
    current = token && user ? { token, user } : null;
  } catch {
    // Stockage sécurisé indisponible : pas de session conservée
    current = null;
  }
  return current;
}

/** Jeton conservé, lu sans passer par l'interface (tâche de suivi GPS). */
export async function readStoredSession(): Promise<Session | null> {
  return current ?? (await restoreSession());
}

/** Ouvre la session après une connexion réussie et la conserve. */
export async function openSession(session: Session): Promise<void> {
  current = session;
  try {
    await Promise.all([
      SecureStore.setItemAsync(TOKEN_KEY, session.token, STORE_OPTIONS),
      SecureStore.setItemAsync(USER_KEY, JSON.stringify(session.user), STORE_OPTIONS),
    ]);
  } catch {
    // Stockage sécurisé indisponible : la session vit le temps de l'ouverture
  }
  await deleteSetting(EXPIRED_SETTING).catch(() => undefined);
  notify(session);
}

/** Met à jour le profil conservé (nom, rôle, téléphone) après une lecture réussie. */
export async function updateSessionUser(user: UtilisateurMe): Promise<void> {
  if (!current) return;
  current = { ...current, user };
  try {
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user), STORE_OPTIONS);
  } catch {
    // sans conséquence : le profil sera relu à la prochaine connexion
  }
}

/** Ferme la session et efface le jeton du téléphone. */
export async function closeSession(reason: SessionEnd): Promise<void> {
  const hadSession = current !== null;
  current = null;
  try {
    await Promise.all([
      SecureStore.deleteItemAsync(TOKEN_KEY, STORE_OPTIONS),
      SecureStore.deleteItemAsync(USER_KEY, STORE_OPTIONS),
    ]);
  } catch {
    // rien à effacer ou stockage indisponible
  }
  if (reason === 'expiree') {
    await setSetting(EXPIRED_SETTING, new Date().toISOString()).catch(() => undefined);
  } else {
    await deleteSetting(EXPIRED_SETTING).catch(() => undefined);
  }
  if (hadSession || reason === 'deconnexion') notify(null, reason);
}

/**
 * Vrai une seule fois après une expiration survenue pendant que l'application
 * était fermée (envoi en arrière-plan refusé par le serveur).
 */
export async function consumeExpiredNotice(): Promise<boolean> {
  try {
    const value = await getSetting(EXPIRED_SETTING);
    if (!value) return false;
    await deleteSetting(EXPIRED_SETTING);
    return true;
  } catch {
    return false;
  }
}

// Refus du serveur (401) : n'efface que si le jeton refusé est encore le jeton
// courant, pour qu'une réponse tardive ne ferme pas une session toute neuve.
setUnauthorizedHandler(async (rejectedToken) => {
  const session = await readStoredSession();
  if (session && session.token === rejectedToken) {
    await closeSession('expiree');
  }
});

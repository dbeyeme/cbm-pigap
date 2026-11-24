/**
 * Identifiant de l'appareil transmis au serveur (ADR-012 : un appareil, un seul
 * compte pêcheur). Valeur : l'identifiant Android, préfixé `android:` ; à
 * défaut, un identifiant d'installation généré une seule fois et gardé dans le
 * stockage sécurisé, préfixé `install:`.
 *
 * L'identifiant n'est jamais écrit dans la console ni affiché.
 */
import * as Application from 'expo-application';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const INSTALL_KEY = 'pigap.appareil.installation';

/** Lisible écran verrouillé : la tâche de suivi GPS envoie aussi l'identifiant. */
const STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

let cached: Promise<string | null> | null = null;

function newInstallId(): string {
  const hex = () =>
    Math.floor(Math.random() * 0x100000000)
      .toString(16)
      .padStart(8, '0');
  const stamp = (Date.now() % 0x100000000).toString(16).padStart(8, '0');
  return `${hex()}${hex()}${hex()}${stamp}`;
}

async function resolve(): Promise<string | null> {
  if (Platform.OS === 'android') {
    try {
      const androidId = Application.getAndroidId();
      if (typeof androidId === 'string' && /^[0-9a-f]{8,64}$/i.test(androidId.trim())) {
        return `android:${androidId.trim().toLowerCase()}`;
      }
    } catch {
      // identifiant Android indisponible : identifiant d'installation
    }
  }
  try {
    let installId = await SecureStore.getItemAsync(INSTALL_KEY, STORE_OPTIONS);
    if (!installId) {
      installId = newInstallId();
      await SecureStore.setItemAsync(INSTALL_KEY, installId, STORE_OPTIONS);
    }
    return `install:${installId}`;
  } catch {
    // Sans stockage durable, mieux vaut ne rien envoyer qu'un identifiant qui change
    return null;
  }
}

/** Identifiant de l'appareil, ou `null` s'il ne peut pas être établi durablement. */
export function deviceId(): Promise<string | null> {
  if (!cached) {
    cached = resolve().then((value) => {
      // Un échec n'est pas mémorisé : nouvel essai à la prochaine requête
      if (value === null) cached = null;
      return value;
    });
  }
  return cached;
}

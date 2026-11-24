/**
 * Lecture ponctuelle de la position du téléphone, pour l'envoi d'une position
 * isolée et pour le lieu de pêche d'une déclaration. Précision GPS : au large,
 * les antennes et le Wi-Fi ne donnent rien.
 */
import * as Location from 'expo-location';

/** Temps laissé au téléphone pour obtenir un point GPS. */
const DELAI_MS = 25_000;
/** Âge maximal d'une position déjà connue du téléphone, utilisée en repli. */
const AGE_MAX_MS = 2 * 60_000;

export async function readCurrentPosition(): Promise<Location.LocationObject> {
  let enabled = true;
  try {
    enabled = await Location.hasServicesEnabledAsync();
  } catch {
    // état inconnu : la lecture tranchera
  }
  if (!enabled) {
    throw new Error('La localisation du téléphone est éteinte. Activez-la, puis réessayez.');
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), DELAI_MS);
  });
  // Sans le dialogue « Précision de la localisation » d'Android : le GPS seul
  // suffit en mer, et un refus de ce dialogue ferait échouer la lecture
  const fix = Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
    mayShowUserSettingsDialog: false,
  }).catch(() => null);
  const location = await Promise.race([fix, timeout]);
  if (timer) clearTimeout(timer);
  if (location) return location;

  const last = await Location.getLastKnownPositionAsync({ maxAge: AGE_MAX_MS }).catch(() => null);
  if (last) return last;
  throw new Error('Position introuvable. Placez-vous à découvert, puis réessayez.');
}

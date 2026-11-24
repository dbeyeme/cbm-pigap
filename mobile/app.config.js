/**
 * Configuration Expo dynamique : complète app.json.
 *
 * 1. Carte Android : Google Maps exige une clé d'API dans le manifeste. Si la
 *    variable EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY est définie au moment du build
 *    (fichier .env ou environnement), elle est injectée ici et l'application
 *    affiche le fond de carte. Sinon, l'écran GPS assemble un fond par tuiles
 *    (voir src/components/TrajectoryNativeMap.tsx) et ne plante pas.
 *
 * 2. Adresse du serveur : une construction de diffusion est refusée si
 *    EXPO_PUBLIC_API_URL n'est pas en https, car le jeton de session y
 *    circulerait en clair.
 *
 * 3. Construction d'essai : avec PIGAP_ESSAI_LOCAL=1, l'adresse du serveur peut
 *    être en http (serveur du poste de développement) et Android accepte ce
 *    trafic en clair. À ne jamais diffuser.
 */
const { withAndroidManifest } = require('expo/config-plugins');

const ESSAI_LOCAL = process.env.PIGAP_ESSAI_LOCAL === '1';

function assertApiUrlHttps() {
  if (process.env.NODE_ENV !== 'production' || ESSAI_LOCAL) return;
  const url = (process.env.EXPO_PUBLIC_API_URL ?? '').trim();
  if (!/^https:\/\//i.test(url)) {
    throw new Error(
      'Construction de diffusion refusée : EXPO_PUBLIC_API_URL doit être une adresse en https ' +
        '(fichier mobile/.env ou environnement). Pour un essai sur le poste de développement, ' +
        'ajoutez PIGAP_ESSAI_LOCAL=1.',
    );
  }
}

/** Essai local seulement : autorise le trafic en clair vers le serveur du poste. */
function withCleartextTraffic(config) {
  return withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    if (application) application.$['android:usesCleartextTraffic'] = 'true';
    return mod;
  });
}

module.exports = ({ config }) => {
  assertApiUrlHttps();

  let next = config;
  const key = (process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY ?? '').trim();
  if (key) {
    next = {
      ...next,
      android: {
        ...next.android,
        config: { ...(next.android?.config ?? {}), googleMaps: { apiKey: key } },
      },
    };
  }
  if (ESSAI_LOCAL) {
    next = withCleartextTraffic(next);
  }
  return next;
};

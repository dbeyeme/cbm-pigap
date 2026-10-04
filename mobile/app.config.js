/**
 * Configuration Expo dynamique : complète app.json.
 *
 * Carte Android : Google Maps exige une clé d'API dans le manifeste. Si la
 * variable EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY est définie au moment du build
 * (fichier .env ou environnement), elle est injectée ici et l'application
 * affiche le fond de carte. Sinon, l'écran GPS affiche un tracé schématique
 * (voir src/components/TrajectoryNativeMap.tsx) et ne plante pas.
 */
module.exports = ({ config }) => {
  const key = (process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY ?? '').trim();
  if (!key) return config;
  return {
    ...config,
    android: {
      ...config.android,
      config: { ...(config.android?.config ?? {}), googleMaps: { apiKey: key } },
    },
  };
};

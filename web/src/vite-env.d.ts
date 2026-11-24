/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_APK_URL?: string;
  /** Adresse du service de tuiles vectorielles et de polices (ADR-010). */
  readonly VITE_MAP_TILES_URL?: string;
  /** "true" : affiche les comptes de démonstration dans la fenêtre de connexion. */
  readonly VITE_DEMO_ACCOUNTS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Paramètres de construction de l'application. Les variables EXPO_PUBLIC_*
 * sont figées dans le paquet au moment de la compilation : aucune clé ni
 * secret ne doit y figurer. Leurs noms sont documentés dans `.env.example`.
 */

function sansBarreFinale(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Adresse du serveur CBM-PIGAP. */
export const API_URL = sansBarreFinale(process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:8000');

/**
 * Origine publique du portail : le QR de la carte professionnelle y renvoie
 * (`/verif/licence/<numéro>`), comme celui de la licence imprimée. La valeur
 * par défaut reprend celle du serveur (`public_web_url`).
 */
export const PORTAIL_URL = sansBarreFinale(
  process.env.EXPO_PUBLIC_PORTAIL_URL ?? 'https://cbm-pigap-web.vercel.app',
);

/**
 * Aides de démonstration : comptes d'essai proposés à la connexion, parcours
 * d'exemple et envoi rapide sur l'écran GPS. Présentes par défaut, comme dans
 * les versions précédentes ; `EXPO_PUBLIC_MODE_DEMO=false` les retire d'une
 * construction destinée au terrain.
 */
export const MODE_DEMO = process.env.EXPO_PUBLIC_MODE_DEMO !== 'false';

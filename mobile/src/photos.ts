/**
 * Photographies fournies par le porteur (versions allégées de 800 px, reprises
 * de `web/public/photos/`). Elles servent d'arrière-plan à l'accueil et à la
 * connexion et de bannière aux écrans principaux, toujours sous un voile bleu
 * nuit qui garde le texte lisible en plein soleil.
 */
import type { ImageSourcePropType } from 'react-native';

export const PHOTOS = {
  /** Navire de pêche au crépuscule : accueil, connexion, suivi en mer. */
  mer: require('../assets/photos/peche-crepuscule-800.webp') as ImageSourcePropType,
  /** Débarquement sur le quai : captures. */
  quai: require('../assets/photos/debarquement-quai-800.webp') as ImageSourcePropType,
  /** Port et filière : espace des agents, licences, contrôles. */
  port: require('../assets/photos/port-filiere-800.webp') as ImageSourcePropType,
} as const;

export type PhotoName = keyof typeof PHOTOS;

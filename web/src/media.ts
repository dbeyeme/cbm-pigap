import type { CSSProperties } from 'react';

/** Chemins illustrations portail (web/public/illustrations). */
export const ILLUSTRATIONS = {
  hero: '/illustrations/landing-hero-gabon.png',
  devices: '/illustrations/landing-devices.png',
  /** Côte gabonaise photoréaliste — widget FO « Vue en temps réel » */
  liveCoast: '/illustrations/fo-live-gabon-coast.png',
  licences: '/illustrations/icon-licences.png',
  trajectories: '/illustrations/icon-trajectories.png',
  zones: '/illustrations/icon-zones.png',
  captures: '/illustrations/icon-captures.png',
  quotas: '/illustrations/icon-quotas.png',
  dashboard: '/illustrations/icon-dashboard.png',
  alertes: '/illustrations/icon-alertes.png',
  users: '/illustrations/icon-licences.png',
} as const;

/**
 * Photographies d'ambiance fournies par le porteur le 2026-11-24 (web/public/photos).
 * `focus` : cadrage vertical retenu quand l'image est rognée en bannière.
 */
export const PHOTOS = {
  /** Chalutier au crépuscule. */
  peche: {
    src: '/photos/peche-crepuscule.webp',
    small: '/photos/peche-crepuscule-800.webp',
    focus: '60%',
  },
  /** Caisses de poisson sur le quai de débarquement. */
  quai: {
    src: '/photos/debarquement-quai.webp',
    small: '/photos/debarquement-quai-800.webp',
    focus: '44%',
  },
  /** Port de pêche à la tombée du jour, de la pêche à la vente. */
  filiere: {
    src: '/photos/port-filiere.webp',
    small: '/photos/port-filiere-800.webp',
    focus: '74%',
  },
  /** Terminal portuaire de nuit. */
  logistique: {
    src: '/photos/terminal-logistique.webp',
    small: '/photos/terminal-logistique-800.webp',
    focus: '70%',
  },
} as const;

export type PhotoId = keyof typeof PHOTOS;

/** Variables CSS d'une photographie d'arrière-plan, lues par la classe `photo-bg`. */
export function photoVars(id: PhotoId): CSSProperties {
  const p = PHOTOS[id];
  return { '--photo': `url(${p.src})`, '--photo-sm': `url(${p.small})` } as CSSProperties;
}

export type ModuleVisualId =
  | 'licences'
  | 'trajectories'
  | 'zones'
  | 'captures'
  | 'quotas'
  | 'dashboard'
  | 'alertes'
  | 'users';

export const MODULE_VISUALS: Record<
  ModuleVisualId,
  { src: string; label: string; short: string }
> = {
  licences: {
    src: ILLUSTRATIONS.licences,
    label: 'Licences',
    short: 'Pêcheurs & embarcations',
  },
  trajectories: {
    src: ILLUSTRATIONS.trajectories,
    label: 'Trajectoires',
    short: 'GPS mer, estuaire, fleuves',
  },
  zones: {
    src: ILLUSTRATIONS.zones,
    label: 'Zones',
    short: 'Polygones réglementés',
  },
  captures: {
    src: ILLUSTRATIONS.captures,
    label: 'Captures',
    short: 'Déclarations de pêche',
  },
  quotas: {
    src: ILLUSTRATIONS.quotas,
    label: 'Quotas',
    short: 'Seuils & alertes 90 %',
  },
  dashboard: {
    src: ILLUSTRATIONS.dashboard,
    label: 'Pilotage',
    short: 'Indicateurs autorités',
  },
  alertes: {
    src: ILLUSTRATIONS.alertes,
    label: 'Alertes',
    short: 'Règles zone · quota · tendance',
  },
  users: {
    src: ILLUSTRATIONS.users,
    label: 'Staff',
    short: 'Agents & administrateurs',
  },
};

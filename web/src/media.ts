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

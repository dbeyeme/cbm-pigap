/** Navigation BO — IA maquette CBM-PIGAP. */

export type Page =
  | 'dashboard'
  | 'acteurs'
  | 'navires'
  | 'peches'
  | 'surveillance'
  | 'alertes'
  | 'rapports'
  | 'cartographie'
  | 'admin'
  /** Sous-vues / legacy ids still used by NotificationBell */
  | 'demandes'
  | 'search'
  | 'organisations'
  | 'captures'
  | 'quotas'
  | 'map'
  | 'zones'
  | 'users';

export type NavId =
  | 'dashboard'
  | 'acteurs'
  | 'navires'
  | 'peches'
  | 'surveillance'
  | 'alertes'
  | 'rapports'
  | 'cartographie'
  | 'admin';

export type NavItem = {
  id: NavId;
  label: string;
  glyph: string;
};

export const BO_NAV: NavItem[] = [
  { id: 'dashboard', label: 'Tableau de bord', glyph: '▣' },
  { id: 'acteurs', label: 'Acteurs', glyph: '◉' },
  { id: 'navires', label: 'Navires', glyph: '⬡' },
  { id: 'peches', label: 'Pêches & Ressources', glyph: '◈' },
  { id: 'surveillance', label: 'Surveillance', glyph: '◎' },
  { id: 'alertes', label: 'Alertes', glyph: '!' },
  { id: 'rapports', label: 'Rapports', glyph: '▤' },
  { id: 'cartographie', label: 'Cartographie', glyph: '+' },
  { id: 'admin', label: 'Administration', glyph: '*' },
];

export function isNavActive(page: Page, id: NavId): boolean {
  if (page === id) return true;
  if (id === 'acteurs') return page === 'demandes' || page === 'search' || page === 'organisations';
  if (id === 'navires') return page === 'map' || page === 'navires';
  if (id === 'peches') return page === 'captures' || page === 'quotas' || page === 'peches';
  if (id === 'surveillance') return page === 'surveillance';
  if (id === 'cartographie') return page === 'zones' || page === 'cartographie';
  if (id === 'admin') return page === 'users' || page === 'admin';
  return false;
}

export const PAGE_TITLES: Partial<Record<Page, string>> = {
  dashboard: 'Tableau de bord',
  acteurs: 'Acteurs',
  demandes: 'Acteurs · Demandes',
  search: 'Acteurs · Licences',
  organisations: 'Acteurs · Organisations',
  navires: 'Navires',
  map: 'Navires · Trajectoires',
  peches: 'Pêches & Ressources',
  captures: 'Pêches · Captures',
  quotas: 'Pêches · Quotas',
  surveillance: 'Surveillance',
  alertes: 'Alertes',
  rapports: 'Rapports & documents',
  cartographie: 'Cartographie',
  zones: 'Cartographie · Zones',
  admin: 'Administration',
  users: 'Administration · Équipe',
};

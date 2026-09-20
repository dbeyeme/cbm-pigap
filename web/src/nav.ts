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
  | 'abonnements'
  | 'org'
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

export type NavSection = 'pilotage' | 'registre' | 'operations' | 'systeme';

export type NavItem = {
  id: NavId;
  label: string;
  /** Sous-titre court affiché dans la barre latérale */
  hint: string;
  section: NavSection;
  glyph: string;
};

export const NAV_SECTIONS: { id: NavSection; label: string }[] = [
  { id: 'pilotage', label: 'Pilotage' },
  { id: 'registre', label: 'Registre' },
  { id: 'operations', label: 'Opérations' },
  { id: 'systeme', label: 'Système' },
];

export const BO_NAV: NavItem[] = [
  { id: 'dashboard', label: 'Tableau de bord', hint: 'Indicateurs et activité', section: 'pilotage', glyph: '▣' },
  { id: 'rapports', label: 'Rapports', hint: 'Documents et exports', section: 'pilotage', glyph: '▤' },
  { id: 'acteurs', label: 'Acteurs', hint: 'Pêcheurs, licences, organisations', section: 'registre', glyph: '◉' },
  { id: 'navires', label: 'Navires', hint: 'Flotte et trajectoires', section: 'registre', glyph: '⬡' },
  { id: 'peches', label: 'Pêches et ressources', hint: 'Captures et quotas', section: 'registre', glyph: '◈' },
  { id: 'surveillance', label: 'Surveillance', hint: 'Temps réel, AIS et zones', section: 'operations', glyph: '◎' },
  { id: 'alertes', label: 'Alertes', hint: 'Événements à traiter', section: 'operations', glyph: '!' },
  { id: 'cartographie', label: 'Cartographie', hint: 'Zones réglementées', section: 'operations', glyph: '+' },
  { id: 'admin', label: 'Administration', hint: 'Équipe et paramètres', section: 'systeme', glyph: '*' },
];

/** Menus autorisés par rôle (portail web). */
const NAV_BY_ROLE: Record<string, NavId[]> = {
  admin: [
    'dashboard',
    'acteurs',
    'navires',
    'peches',
    'surveillance',
    'alertes',
    'rapports',
    'cartographie',
    'admin',
  ],
  agent_controle: [
    'dashboard',
    'acteurs',
    'navires',
    'peches',
    'surveillance',
    'alertes',
    'cartographie',
  ],
  autorite: [
    'dashboard',
    'navires',
    'surveillance',
    'alertes',
    'rapports',
    'cartographie',
  ],
  chercheur: ['dashboard', 'rapports', 'cartographie'],
};

export function navItemsForRole(role: string | null | undefined): NavItem[] {
  const ids = NAV_BY_ROLE[role ?? ''] ?? ['dashboard'];
  const allow = new Set(ids);
  return BO_NAV.filter((item) => allow.has(item.id));
}

export function canAccessPage(role: string | null | undefined, page: Page): boolean {
  if (role === 'organisation') return page === 'org';
  if (role === 'pecheur') return false;
  const items = navItemsForRole(role);
  const allowed = new Set(items.map((i) => i.id));
  if (
    page === 'acteurs' ||
    page === 'demandes' ||
    page === 'search' ||
    page === 'organisations' ||
    page === 'abonnements'
  ) {
    return allowed.has('acteurs');
  }
  if (page === 'map' || page === 'navires') return allowed.has('navires');
  if (page === 'captures' || page === 'quotas' || page === 'peches') return allowed.has('peches');
  if (page === 'zones' || page === 'cartographie') return allowed.has('cartographie');
  if (page === 'users' || page === 'admin') return allowed.has('admin');
  if (page === 'surveillance') return allowed.has('surveillance');
  if (page === 'alertes') return allowed.has('alertes');
  if (page === 'rapports') return allowed.has('rapports');
  if (page === 'dashboard') return allowed.has('dashboard');
  if (page === 'org') return role === 'organisation';
  return false;
}

export function roleLabelFr(role: string | null | undefined): string {
  switch (role) {
    case 'admin':
      return 'Administrateur';
    case 'agent_controle':
      return 'Agent de contrôle';
    case 'autorite':
      return 'Autorité';
    case 'chercheur':
      return 'Chercheur';
    case 'organisation':
      return 'Organisation';
    case 'pecheur':
      return 'Pêcheur';
    default:
      return 'Utilisateur';
  }
}

export function isNavActive(page: Page, id: NavId): boolean {
  if (page === id) return true;
  if (id === 'acteurs') {
    return (
      page === 'demandes' ||
      page === 'search' ||
      page === 'organisations' ||
      page === 'abonnements'
    );
  }
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
  peches: 'Pêches et ressources',
  captures: 'Pêches · Captures',
  quotas: 'Pêches · Quotas',
  surveillance: 'Surveillance',
  alertes: 'Alertes',
  rapports: 'Rapports & documents',
  cartographie: 'Cartographie',
  zones: 'Cartographie · Zones',
  admin: 'Administration',
  users: 'Administration · Équipe',
  abonnements: 'Acteurs · Abonnements',
  org: 'Espace organisation',
};

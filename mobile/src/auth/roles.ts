import type { UtilisateurMe } from '../api';

/** Rôles autorisés sur l'app mobile (cahier : pêcheurs + agents). */
export type MobileRole = 'pecheur' | 'agent_controle';

export type MobileMode = 'pecheur' | 'agent';

export const DEMO_ACCOUNTS = {
  agent: { email: 'agent@example.com', password: 'AgentPass123!', label: 'Agent' },
  pecheur: { email: 'pecheur1@example.com', password: 'PecheurPass1!', label: 'Pecheur' },
} as const;

export function isMobileAllowedRole(role: string): role is MobileRole {
  return role === 'pecheur' || role === 'agent_controle';
}

export function mobileModeForRole(role: string): MobileMode | null {
  if (role === 'pecheur') return 'pecheur';
  if (role === 'agent_controle') return 'agent';
  return null;
}

export function homeKickerForUser(user: UtilisateurMe): string {
  if (user.role === 'pecheur') return 'Espace pecheur';
  if (user.role === 'agent_controle') return 'Espace agent';
  return 'CBM-PIGAP';
}

export function unsupportedRoleMessage(role: string): string {
  return `Le role « ${role} » utilise le portail web CBM-PIGAP, pas l'application mobile.`;
}

/** Onglets bas selon le role. */
export type RoleTab = 'home' | 'captures' | 'tracking' | 'search' | 'abonnement';

export function tabsForMode(mode: MobileMode): Array<{ id: RoleTab; label: string }> {
  if (mode === 'pecheur') {
    return [
      { id: 'home', label: 'Accueil' },
      { id: 'captures', label: 'Captures' },
      { id: 'tracking', label: 'GPS' },
      { id: 'abonnement', label: 'Abo' },
    ];
  }
  return [
    { id: 'home', label: 'Accueil' },
    { id: 'captures', label: 'Captures' },
    { id: 'tracking', label: 'GPS' },
    { id: 'search', label: 'Licences' },
  ];
}

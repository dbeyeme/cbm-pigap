import type { UtilisateurMe } from '../api';

/** Rôles admis sur l'application mobile (cahier : pêcheurs et agents de contrôle). */
export type MobileRole = 'pecheur' | 'agent_controle';

export type MobileMode = 'pecheur' | 'agent';

export type DemoRole = 'agent' | 'pecheur';

type DemoAccount = { email: string; password: string; label: string };

/**
 * Comptes de démonstration proposés à la connexion quand les aides de
 * démonstration sont actives. La condition est celle de `MODE_DEMO`
 * (`src/config.ts`), écrite ici en toutes lettres : la compilation retire
 * alors ces identifiants du paquet d'une construction destinée au terrain
 * (`EXPO_PUBLIC_MODE_DEMO=false`).
 */
export const DEMO_ACCOUNTS: Record<DemoRole, DemoAccount> | null =
  process.env.EXPO_PUBLIC_MODE_DEMO !== 'false'
    ? {
        agent: { email: 'agent@example.com', password: 'AgentPass123!', label: 'Agent' },
        pecheur: { email: 'pecheur1@example.com', password: 'PecheurPass1!', label: 'Pêcheur' },
      }
    : null;

export function isMobileAllowedRole(role: string): role is MobileRole {
  return role === 'pecheur' || role === 'agent_controle';
}

export function mobileModeForRole(role: string): MobileMode | null {
  if (role === 'pecheur') return 'pecheur';
  if (role === 'agent_controle') return 'agent';
  return null;
}

export function homeKickerForUser(user: UtilisateurMe): string {
  if (user.role === 'pecheur') return 'Espace pêcheur';
  if (user.role === 'agent_controle') return 'Espace agent';
  return 'CBM-PIGAP';
}

/** Le code du rôle n'est pas montré : il ne dit rien à l'utilisateur. */
export function unsupportedRoleMessage(_role: string): string {
  return 'Ce compte s’utilise sur le portail web CBM-PIGAP, pas dans l’application mobile.';
}

/** Onglets du bas selon le rôle. */
export type RoleTab = 'home' | 'captures' | 'tracking' | 'search' | 'abonnement';

export function tabsForMode(mode: MobileMode): Array<{ id: RoleTab; label: string }> {
  if (mode === 'pecheur') {
    return [
      { id: 'home', label: 'Accueil' },
      { id: 'captures', label: 'Captures' },
      { id: 'tracking', label: 'GPS' },
      { id: 'abonnement', label: 'Abonnement' },
    ];
  }
  return [
    { id: 'home', label: 'Accueil' },
    { id: 'captures', label: 'Captures' },
    { id: 'tracking', label: 'GPS' },
    { id: 'search', label: 'Licences' },
  ];
}

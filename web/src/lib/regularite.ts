/**
 * Régularité affichée sur la carte (lot 4).
 * Libellés alignés sur `carte_suivi.json` (statut Proposé).
 * Jamais « pirate » ni « infraction » : la qualification revient à l'agent.
 */

export type RegulariteCarte = 'conforme' | 'a_verifier' | 'alerte';

export const LIBELLES_REGULARITE: Record<string, string> = {
  conforme: 'Conforme',
  a_verifier: 'À vérifier',
  alerte: 'Navire à contrôler',
};

export function libelleRegularite(
  code?: string | null,
  fourni?: string | null,
): string {
  if (fourni) return fourni;
  if (!code) return LIBELLES_REGULARITE.conforme;
  return LIBELLES_REGULARITE[code] ?? code;
}

export function estAControler(code?: string | null): boolean {
  return code === 'alerte';
}

/** Classe de pastille : losange = à contrôler, carré = à vérifier, rond = conforme. */
export function classePastilleRegularite(code?: string | null): string {
  if (code === 'alerte') return 'etat-pastille etat-pastille--ctrl';
  if (code === 'a_verifier') return 'etat-pastille etat-pastille--verif';
  return 'etat-pastille etat-pastille--ok';
}

/**
 * Référentiel métier embarqué (hors-ligne), aligné sur
 * `data/open-data/gabon/referentiels_peche.json` : espèces des tableurs 2024
 * de l'administration avec leur groupe, engins observés dans les dossiers
 * d'autorisation. Le serveur reste la référence (`GET /captures/catalog`).
 */
export type GroupeEspece = 'pelagique' | 'demersal' | 'crustace' | 'autre';

export const GROUPES_LABEL: Record<GroupeEspece, string> = {
  pelagique: 'Pélagiques',
  demersal: 'Démersaux',
  crustace: 'Crustacés',
  autre: 'Autres',
};

export const ESPECES_REF: ReadonlyArray<{ code: string; nom: string; groupe: GroupeEspece; protegee?: boolean }> = [
  { code: 'sardine', nom: 'Sardine', groupe: 'pelagique' },
  { code: 'mulet', nom: 'Mulet', groupe: 'pelagique' },
  { code: 'becune', nom: 'Bécune (barracuda)', groupe: 'pelagique' },
  { code: 'thon', nom: 'Thon', groupe: 'pelagique' },
  { code: 'maquereau', nom: 'Maquereau', groupe: 'pelagique' },
  { code: 'carangue', nom: 'Carangue', groupe: 'pelagique' },
  { code: 'ethmalose', nom: 'Ethmalose', groupe: 'pelagique' },
  { code: 'turbo', nom: 'Turbo', groupe: 'pelagique' },
  { code: 'barbillon', nom: 'Barbillon', groupe: 'pelagique' },
  { code: 'ceinture', nom: 'Ceinture', groupe: 'pelagique' },
  { code: 'carpe', nom: 'Carpe', groupe: 'pelagique' },
  { code: 'banane_de_mer', nom: 'Banane de mer', groupe: 'pelagique' },
  { code: 'raie', nom: 'Raie', groupe: 'pelagique' },
  { code: 'requin', nom: 'Requin', groupe: 'pelagique' },
  { code: 'bars', nom: 'Bars', groupe: 'demersal' },
  { code: 'bossu', nom: 'Bossu', groupe: 'demersal' },
  { code: 'capitaine', nom: 'Capitaine', groupe: 'demersal' },
  { code: 'rouge', nom: 'Rouge', groupe: 'demersal' },
  { code: 'machoiron_de_mer', nom: 'Machoiron de mer', groupe: 'demersal' },
  { code: 'dorade_rose', nom: 'Dorade rose', groupe: 'demersal' },
  { code: 'merou', nom: 'Mérou', groupe: 'demersal' },
  { code: 'dorade_grise', nom: 'Dorade grise', groupe: 'demersal' },
  { code: 'disque', nom: 'Disque', groupe: 'demersal' },
  { code: 'sole', nom: 'Sole', groupe: 'demersal' },
  { code: 'divers', nom: 'Divers', groupe: 'demersal' },
  { code: 'crevette', nom: 'Crevette', groupe: 'crustace' },
  { code: 'crabe', nom: 'Crabe', groupe: 'crustace' },
  { code: 'langouste', nom: 'Langouste', groupe: 'crustace' },
  { code: 'merou_geant', nom: 'Mérou géant (protégé)', groupe: 'demersal', protegee: true },
  { code: 'requin_marteau', nom: 'Requin marteau (protégé)', groupe: 'pelagique', protegee: true },
  { code: 'raie_manta', nom: 'Raie manta (protégée)', groupe: 'pelagique', protegee: true },
  { code: 'tortue_marine', nom: 'Tortue marine (protégée)', groupe: 'autre', protegee: true },
  { code: 'autre', nom: 'Autre espèce', groupe: 'autre' },
];

export const ENGINS_REF: ReadonlyArray<{ code: string; nom: string }> = [
  { code: 'filet_sardine', nom: 'Filet à sardine' },
  { code: 'filet_maillant_fond', nom: 'Filet maillant de fond' },
  { code: 'filet_multifilament', nom: 'Filet multifilament' },
  { code: 'filet_mulet', nom: 'Filet à mulet' },
  { code: 'senne_tournante', nom: 'Senne tournante' },
  { code: 'filet_maillant_derivant', nom: 'Filet maillant dérivant' },
  { code: 'ligne_fond', nom: 'Ligne de fond' },
  { code: 'ligne_main', nom: 'Ligne à main' },
  { code: 'palangre', nom: 'Palangre' },
  { code: 'nasse', nom: 'Nasse' },
  { code: 'autre', nom: 'Autre engin' },
];

export const ESPECES_MVP = ESPECES_REF.map((e) => e.code);
export const METHODES_MVP = ENGINS_REF.map((e) => e.code);

export type EspeceMVP = string;
export type MethodeMVP = string;

export type SyncStatus = 'pending' | 'synced';

/** Icônes d'interface (repères visuels, sans valeur métier). */
export const GROUPES_ICON: Record<GroupeEspece, string> = {
  pelagique: 'fa6:fish-fins',
  demersal: 'mci:anchor',
  crustace: 'fa6:shrimp',
  autre: 'mci:turtle',
};

export function engineIcon(code: string): string {
  if (code.startsWith('filet') || code.startsWith('senne')) return 'mci:waves';
  if (code.startsWith('ligne') || code === 'palangre') return 'mci:hook';
  if (code === 'nasse') return 'mci:basket-outline';
  return 'ellipsis-horizontal-circle-outline';
}

export function especeNom(code: string): string {
  return ESPECES_REF.find((e) => e.code === code)?.nom ?? code;
}

export function enginNom(code: string): string {
  return ENGINS_REF.find((e) => e.code === code)?.nom ?? code;
}

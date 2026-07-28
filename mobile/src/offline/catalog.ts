/** Listes fermées MVP — alignées sur backend `captures/schemas.py`. */
export const ESPECES_MVP = [
  'capitaine',
  'merou',
  'crevette',
  'thon',
  'barracuda',
  'sardine',
  'autre',
] as const;

export const METHODES_MVP = [
  'filet',
  'ligne',
  'nasse',
  'senne',
  'palangre',
  'autre',
] as const;

export type EspeceMVP = (typeof ESPECES_MVP)[number];
export type MethodeMVP = (typeof METHODES_MVP)[number];

export type SyncStatus = 'pending' | 'synced';

/**
 * Secteurs de mer proposés comme « secteur visé » d'une sortie. Repris de
 * `backend/app/data/gabon/secteurs_mer.json` (identifiant et nom seulement),
 * pour pouvoir déclarer une sortie sans réseau. Le serveur reste juge : un
 * identifiant qu'il ne connaît plus refuse la sortie avec un motif clair.
 */
export type SecteurMer = { id: string; nom: string };

export const SECTEURS_MER: ReadonlyArray<SecteurMer> = [
  { id: 'cocobeach', nom: 'Cocobeach et baie de la Mondah' },
  { id: 'estuaire', nom: 'Estuaire du Komo (Libreville, Owendo)' },
  { id: 'large-libreville', nom: 'Large de Libreville et Pointe Denis' },
  { id: 'cap-lopez', nom: 'Port-Gentil et Cap Lopez' },
  { id: 'delta-ogooue', nom: 'Delta de l’Ogooué' },
  { id: 'iguela', nom: 'Iguéla et lagune Nkomi (Omboué)' },
  { id: 'gamba', nom: 'Sette Cama et Gamba' },
  { id: 'mayumba', nom: 'Mayumba et frontière sud' },
];

export function secteurNom(id: string | null | undefined): string | null {
  if (!id) return null;
  return SECTEURS_MER.find((s) => s.id === id)?.nom ?? null;
}

/** Bornes de période pour l'activité par zone (lot 5). */

export type PresetPeriode = 'jour' | 'semaine' | 'mois' | 'plage';

function jourIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function aujourdHui(): string {
  return jourIso(new Date());
}

export function moinsJours(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return jourIso(d);
}

/** Début et fin ISO 8601 transmis à l'API (UTC). */
export function bornesPeriode(
  preset: PresetPeriode,
  debutJour: string,
  finJour: string,
): { debut: string; fin: string } {
  if (preset === 'jour') {
    const j = aujourdHui();
    return { debut: `${j}T00:00:00.000Z`, fin: `${j}T23:59:59.999Z` };
  }
  if (preset === 'semaine') {
    return { debut: `${moinsJours(7)}T00:00:00.000Z`, fin: `${aujourdHui()}T23:59:59.999Z` };
  }
  if (preset === 'mois') {
    return { debut: `${moinsJours(30)}T00:00:00.000Z`, fin: `${aujourdHui()}T23:59:59.999Z` };
  }
  return { debut: `${debutJour}T00:00:00.000Z`, fin: `${finJour}T23:59:59.999Z` };
}

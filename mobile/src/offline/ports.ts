/**
 * Ports proposés comme port de départ ou de retour d'une sortie. Repris de
 * `backend/app/data/gabon/ports.json` (identifiant, nom, longitude, latitude
 * seulement), pour pouvoir déclarer une sortie sans réseau. À resynchroniser
 * si ce fichier change : le serveur reste juge, et un identifiant qu'il ne
 * connaît plus refuse la sortie avec un motif clair. Les coordonnées ne servent
 * ici qu'à présélectionner le port le plus proche ; le serveur prend les siennes.
 */
export type PortGabon = { id: string; nom: string; lon: number; lat: number };

export const PORTS: ReadonlyArray<PortGabon> = [
  { id: 'owendo', nom: 'Port d’Owendo', lon: 9.508, lat: 0.283 },
  { id: 'libreville', nom: 'Port môle de Libreville', lon: 9.418, lat: 0.387 },
  { id: 'port-gentil', nom: 'Port de Port-Gentil', lon: 8.782, lat: -0.717 },
  { id: 'cap-lopez', nom: 'Terminal de Cap Lopez', lon: 8.705, lat: -0.635 },
  { id: 'mayumba', nom: 'Port de Mayumba', lon: 10.652, lat: -3.432 },
  { id: 'cocobeach', nom: 'Cocobeach', lon: 9.583, lat: 1.0 },
];

export function portNom(id: string | null | undefined): string | null {
  if (!id) return null;
  return PORTS.find((p) => p.id === id)?.nom ?? null;
}

/** Distance en kilomètres sur la sphère terrestre. */
export function distanceKm(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Port le plus proche d'une position [longitude, latitude]. */
export function portLePlusProche(position: [number, number]): PortGabon | null {
  let best: PortGabon | null = null;
  let bestKm = Infinity;
  for (const port of PORTS) {
    const km = distanceKm(position, [port.lon, port.lat]);
    if (km < bestKm) {
      best = port;
      bestKm = km;
    }
  }
  return best;
}

/** Ports embarqués : présélection du port le plus proche d'une position récente. */
import { PORTS, distanceKm, portLePlusProche, portNom } from '../offline/ports';

describe('ports embarqués', () => {
  it('reprend les six ports du référentiel serveur', () => {
    expect(PORTS.map((p) => p.id)).toEqual([
      'owendo',
      'libreville',
      'port-gentil',
      'cap-lopez',
      'mayumba',
      'cocobeach',
    ]);
    expect(portNom('mayumba')).toBe('Port de Mayumba');
    expect(portNom('inconnu')).toBeNull();
  });

  it('présélectionne le port le plus proche', () => {
    expect(portLePlusProche([9.50, 0.29])?.id).toBe('owendo');
    expect(portLePlusProche([9.42, 0.40])?.id).toBe('libreville');
    expect(portLePlusProche([8.79, -0.70])?.id).toBe('port-gentil');
    expect(portLePlusProche([10.6, -3.4])?.id).toBe('mayumba');
  });

  it('mesure les distances en kilomètres', () => {
    // Owendo et le port môle de Libreville : une quinzaine de kilomètres
    const km = distanceKm([9.508, 0.283], [9.418, 0.387]);
    expect(km).toBeGreaterThan(14);
    expect(km).toBeLessThan(16);
  });
});

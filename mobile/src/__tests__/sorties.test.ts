/** Heure de retour prévue : choix rapides, heure tapée, dépassement. */
import { prochaineHeure, retourDans, retourDepasse } from '../lib/sorties';

describe('heure de retour prévue', () => {
  const maintenant = new Date(2026, 10, 27, 6, 0, 0);

  it('ajoute des heures au départ', () => {
    expect(retourDans(8, maintenant).getTime() - maintenant.getTime()).toBe(8 * 3_600_000);
  });

  it('lit une heure tapée et la place aujourd’hui si elle est à venir', () => {
    const d = prochaineHeure('14:30', maintenant)!;
    expect([d.getDate(), d.getHours(), d.getMinutes()]).toEqual([27, 14, 30]);
    expect(prochaineHeure('14 h 30', maintenant)!.getMinutes()).toBe(30);
    expect(prochaineHeure('14h', maintenant)!.getHours()).toBe(14);
  });

  it('place au lendemain une heure déjà passée', () => {
    const d = prochaineHeure('5:00', maintenant)!;
    expect([d.getDate(), d.getHours()]).toEqual([28, 5]);
  });

  it('refuse une heure illisible', () => {
    expect(prochaineHeure('25:00', maintenant)).toBeNull();
    expect(prochaineHeure('midi', maintenant)).toBeNull();
    expect(prochaineHeure('', maintenant)).toBeNull();
  });

  it('signale un retour prévu dépassé', () => {
    expect(retourDepasse(new Date(2026, 10, 27, 5, 0).toISOString(), maintenant)).toBe(true);
    expect(retourDepasse(new Date(2026, 10, 27, 7, 0).toISOString(), maintenant)).toBe(false);
  });
});

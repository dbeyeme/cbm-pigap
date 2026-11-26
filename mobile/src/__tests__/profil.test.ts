/**
 * Page de profil : tarifs facultatifs en francs CFA entiers, bornes reçues du
 * serveur, tarifs des espèces masquées conservés.
 */
import {
  cleTarif,
  construireTarifs,
  erreurPresentation,
  especesAffichees,
  formatTarif,
  lirePrix,
  saisieTarifs,
  type LimitesProfil,
} from '../lib/profil';

const NBSP = ' ';

const LIMITES: LimitesProfil = {
  presentation_max_caracteres: 600,
  tarifs_max: 30,
  prix_max_fcfa: 10_000_000,
  unites_tarif: ['kg', 'unite'],
};

describe('lirePrix', () => {
  it('lit un prix entier, avec ou sans séparateur de milliers', () => {
    expect(lirePrix('2500', LIMITES.prix_max_fcfa)).toEqual({ prix: 2500 });
    expect(lirePrix('2 500', LIMITES.prix_max_fcfa)).toEqual({ prix: 2500 });
    expect(lirePrix(`2${NBSP}500`, LIMITES.prix_max_fcfa)).toEqual({ prix: 2500 });
  });

  it('une case vide ne donne aucun tarif', () => {
    expect(lirePrix('  ', LIMITES.prix_max_fcfa)).toBeNull();
  });

  it('refuse centimes, zéro et prix au-delà de la borne du serveur', () => {
    expect(lirePrix('2500,50', LIMITES.prix_max_fcfa)).toHaveProperty('erreur');
    expect(lirePrix('0', LIMITES.prix_max_fcfa)).toHaveProperty('erreur');
    expect(lirePrix('10000001', LIMITES.prix_max_fcfa)).toHaveProperty('erreur');
    expect(lirePrix('5000', 4000)).toHaveProperty('erreur');
  });
});

describe('construireTarifs', () => {
  const enregistres = [
    { espece: 'sardine', unite: 'kg', prix_fcfa: 2500 },
    { espece: 'mulet', unite: 'unite', prix_fcfa: 1500 },
    { espece: 'thon', unite: 'caisse', prix_fcfa: 90000 },
  ];

  it('garde le tarif d’une espèce masquée et remplace ceux des espèces affichées', () => {
    const saisie = { ...saisieTarifs(enregistres), [cleTarif('sardine', 'kg')]: '2 800' };
    const { tarifs, erreurs, erreurGenerale } = construireTarifs(saisie, ['sardine'], enregistres, LIMITES);
    expect(erreurs).toEqual({});
    expect(erreurGenerale).toBeNull();
    expect(tarifs).toEqual([
      { espece: 'mulet', unite: 'unite', prix_fcfa: 1500 },
      { espece: 'sardine', unite: 'kg', prix_fcfa: 2800 },
    ]);
  });

  it('ne renvoie pas un tarif dans une unité retirée du paramétrage', () => {
    const { tarifs } = construireTarifs({}, [], enregistres, LIMITES);
    expect(tarifs.some((t) => t.unite === 'caisse')).toBe(false);
  });

  it('vider une case retire le tarif', () => {
    const saisie = { [cleTarif('sardine', 'kg')]: '' };
    const { tarifs } = construireTarifs(saisie, ['sardine'], enregistres, LIMITES);
    expect(tarifs.some((t) => t.espece === 'sardine')).toBe(false);
  });

  it('signale la case fautive et le dépassement du nombre de tarifs', () => {
    const saisie = { [cleTarif('sardine', 'kg')]: 'deux mille', [cleTarif('sardine', 'unite')]: '300' };
    const { erreurs, erreurGenerale } = construireTarifs(saisie, ['sardine'], [], { ...LIMITES, tarifs_max: 0 });
    expect(Object.keys(erreurs)).toEqual([cleTarif('sardine', 'kg')]);
    expect(erreurGenerale).toMatch(/au plus 0 tarifs/);
  });
});

describe('présentation et affichage', () => {
  it('ne contrôle que la longueur reçue du serveur', () => {
    expect(erreurPresentation('Pêche à la ligne', LIMITES)).toBeNull();
    expect(erreurPresentation('x'.repeat(601), LIMITES)).toMatch(/600 caractères au plus/);
  });

  it('écrit le tarif en clair', () => {
    expect(formatTarif(2500, 'kg')).toBe(`2${NBSP}500${NBSP}FCFA le kilo`);
    expect(formatTarif(1500, 'unite')).toBe(`1${NBSP}500${NBSP}FCFA l’unité`);
  });

  it('retire de la page les espèces masquées', () => {
    const declarees = [
      { espece: 'mulet', nom: 'Mulet' },
      { espece: 'sardine', nom: 'Sardine' },
    ];
    expect(especesAffichees(declarees, ['mulet'])).toEqual([{ espece: 'sardine', nom: 'Sardine' }]);
  });
});

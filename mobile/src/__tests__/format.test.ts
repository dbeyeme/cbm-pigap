import {
  formatCoordonnees,
  formatDate,
  formatFcfa,
  formatHeure,
  formatJour,
  formatMoment,
  parseNombre,
  parsePosition,
  pluriel,
} from '../lib/format';

const NBSP = ' ';

describe('mise en forme', () => {
  it('écrit l’heure à la française', () => {
    expect(formatHeure(new Date(2026, 10, 24, 18, 5))).toBe(`18${NBSP}h${NBSP}05`);
    expect(formatHeure('pas une date')).toBe('');
  });

  it('écrit les dates sans décalage de fuseau', () => {
    expect(formatDate(new Date(2026, 10, 4, 9, 0))).toBe('04/11/2026');
    expect(formatJour('2027-01-15')).toBe('15/01/2027');
    expect(formatJour(null)).toBe('');
  });

  it('dit « à » le jour même et donne la date sinon', () => {
    const now = new Date(2026, 10, 24, 20, 0);
    expect(formatMoment(new Date(2026, 10, 24, 14, 5), now)).toBe(`à 14${NBSP}h${NBSP}05`);
    expect(formatMoment(new Date(2026, 10, 23, 14, 5), now)).toBe(`le 23/11/2026 à 14${NBSP}h${NBSP}05`);
  });

  it('accorde les pluriels et garde le nombre collé à son nom', () => {
    expect(pluriel(0, 'relevé', 'relevés')).toBe(`0${NBSP}relevé`);
    expect(pluriel(1, 'relevé', 'relevés')).toBe(`1${NBSP}relevé`);
    expect(pluriel(3, 'relevé', 'relevés')).toBe(`3${NBSP}relevés`);
  });

  it('écrit les montants avec leur unité', () => {
    expect(formatFcfa(12500)).toBe(`12${NBSP}500${NBSP}FCFA`);
    expect(formatFcfa(0)).toBe(`0${NBSP}FCFA`);
  });
});

describe('coordonnées du lieu de pêche', () => {
  it('affiche latitude puis longitude avec leur hémisphère', () => {
    expect(formatCoordonnees(9.241, 0.3845)).toBe(`0,3845°${NBSP}N · 9,2410°${NBSP}E`);
    expect(formatCoordonnees(8.9, -1.25)).toBe(`1,2500°${NBSP}S · 8,9000°${NBSP}E`);
  });

  it('lit un nombre saisi avec une virgule ou un point', () => {
    expect(parseNombre('0,3845')).toBeCloseTo(0.3845);
    expect(parseNombre(' 9.241 ')).toBeCloseTo(9.241);
    expect(parseNombre('-1,2')).toBeNull();
    expect(parseNombre('abc')).toBeNull();
    expect(parseNombre('')).toBeNull();
  });

  it('convertit la saisie en position longitude, latitude', () => {
    expect(parsePosition('0,3845', 'N', '9,2410')).toEqual([9.241, 0.3845]);
    expect(parsePosition('1,25', 'S', '8,9')).toEqual([8.9, -1.25]);
    expect(parsePosition('95', 'N', '9')).toBeNull();
    expect(parsePosition('', 'N', '9')).toBeNull();
  });
});

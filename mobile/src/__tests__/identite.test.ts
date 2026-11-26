/**
 * Fiche d'identité : ancienneté du dernier relevé et origine des relevés,
 * écrites en clair.
 */
import { capitale, formatAnciennete, libelleSource, resumeReleves } from '../lib/identite';

const NBSP = ' ';

describe('formatAnciennete', () => {
  it('écrit l’âge du dernier relevé en mots simples', () => {
    expect(formatAnciennete(20)).toBe('à l’instant');
    expect(formatAnciennete(5 * 60)).toBe('il y a 5 min');
    expect(formatAnciennete(3 * 3600 + 120)).toBe('il y a 3 h');
    expect(formatAnciennete(2 * 86400)).toBe(`il y a 2${NBSP}jours`);
    expect(formatAnciennete(86400)).toBe(`il y a 1${NBSP}jour`);
    expect(formatAnciennete(150 * 86400)).toBe('il y a 5 mois');
    expect(formatAnciennete(890749325)).toBe(`il y a 28${NBSP}ans`);
  });
});

describe('origine des relevés', () => {
  it('nomme la source et détaille seulement quand il y en a plusieurs', () => {
    expect(libelleSource('mobile')).toBe('Téléphone');
    expect(libelleSource('balise')).toBe('Balise');
    expect(resumeReleves(4, { balise: 1, mobile: 3 })).toBe(`4${NBSP}relevés (balise 1, téléphone 3)`);
    expect(resumeReleves(3, { mobile: 3 })).toBe(`3${NBSP}relevés`);
  });

  it('met une capitale sans garder les tirets bas', () => {
    expect(capitale('pirogue')).toBe('Pirogue');
    expect(capitale('filet_maillant')).toBe('Filet maillant');
    expect(capitale(null)).toBe('');
  });
});

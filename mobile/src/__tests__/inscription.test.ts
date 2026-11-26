/**
 * Informations d'inscription d'une embarcation : même mise en forme que le
 * serveur, erreurs signalées avant l'envoi, seules les informations utiles
 * envoyées.
 */
import {
  SAISIE_INSCRIPTION_VIDE,
  aDesErreurs,
  inscriptionRenseignee,
  lignesInscription,
  lireInscription,
  payloadCorrection,
  payloadCreation,
  saisieDepuis,
  type SaisieInscription,
} from '../lib/inscription';

function saisie(patch: Partial<SaisieInscription>): SaisieInscription {
  return { ...SAISIE_INSCRIPTION_VIDE, ...patch };
}

describe('lireInscription', () => {
  it('ne demande rien : une saisie vide ne donne ni valeur ni erreur', () => {
    const lecture = lireInscription(SAISIE_INSCRIPTION_VIDE, 2026);
    expect(aDesErreurs(lecture)).toBe(false);
    expect(Object.values(lecture.valeurs).every((v) => v === null)).toBe(true);
  });

  it('met en forme comme le serveur', () => {
    const { valeurs, erreurs } = lireInscription(
      saisie({
        mmsi: '626 799-010',
        numero_omi: 'IMO 9074729',
        indicatif_radio: 'trab 7',
        jauge_brute: '12,5',
        annee_construction: '2014',
        proprietaire: '  Propriétaire\nfictif ',
        exploitant: 'Exploitant fictif',
      }),
      2026,
    );
    expect(erreurs).toEqual({});
    expect(valeurs).toEqual({
      mmsi: '626799010',
      numero_omi: '9074729',
      indicatif_radio: 'TRAB7',
      jauge_brute: 12.5,
      annee_construction: 2014,
      proprietaire: 'Propriétaire fictif',
      exploitant: 'Exploitant fictif',
    });
  });

  it('signale chaque format refusé, avec le champ en clair', () => {
    const { valeurs, erreurs } = lireInscription(
      saisie({
        mmsi: '62679901',
        numero_omi: '90747',
        indicatif_radio: 'T-',
        jauge_brute: '-3',
        annee_construction: '2031',
        proprietaire: 'x'.repeat(256),
      }),
      2026,
    );
    expect(Object.keys(erreurs).sort()).toEqual(
      ['annee_construction', 'indicatif_radio', 'jauge_brute', 'mmsi', 'numero_omi', 'proprietaire'].sort(),
    );
    expect(erreurs.mmsi).toMatch(/9 chiffres/);
    expect(erreurs.annee_construction).toMatch(/1900 et 2026/);
    expect(valeurs.mmsi).toBeNull();
  });
});

describe('envoi des informations', () => {
  it('à la création, seules les informations renseignées partent', () => {
    const { valeurs } = lireInscription(saisie({ mmsi: '626123456', annee_construction: '2012' }), 2026);
    expect(payloadCreation(valeurs)).toEqual({ mmsi: '626123456', annee_construction: 2012 });
  });

  it('à la correction, une information vidée part à null et une information inchangée ne part pas', () => {
    const avant = { mmsi: '626799010', numero_omi: '9074729', jauge_brute: 12.5 };
    const { valeurs } = lireInscription(
      { ...saisieDepuis(avant), numero_omi: '', indicatif_radio: 'TRAB7' },
      2026,
    );
    expect(payloadCorrection(avant, valeurs)).toEqual({ numero_omi: null, indicatif_radio: 'TRAB7' });
  });

  it('reprend les valeurs inscrites, nombres à virgule compris', () => {
    expect(saisieDepuis({ jauge_brute: 12.5, annee_construction: 2014, mmsi: null })).toMatchObject({
      jauge_brute: '12,5',
      annee_construction: '2014',
      mmsi: '',
    });
  });
});

describe('affichage', () => {
  it('donne les sept lignes, non renseignées comprises', () => {
    const lignes = lignesInscription({ mmsi: '626799010', jauge_brute: 12.5 });
    expect(lignes).toHaveLength(7);
    expect(lignes.find((l) => l.champ === 'jauge_brute')?.valeur).toBe('12,5');
    expect(lignes.find((l) => l.champ === 'exploitant')?.valeur).toBeNull();
    expect(inscriptionRenseignee({ mmsi: null, exploitant: '' })).toBe(false);
    expect(inscriptionRenseignee({ exploitant: 'Exploitant fictif' })).toBe(true);
  });
});

import {
  libelleStatutLicence,
  licenceVerificationUrl,
  readLicenceQr,
  statutLicenceAuJour,
  tonStatutLicence,
} from '../lib/licence';

describe('readLicenceQr', () => {
  it('lit le numéro dans l’adresse de vérification d’une licence', () => {
    expect(readLicenceQr('https://portail.exemple.ga/verif/licence/GA-PA-2026-00012')).toEqual({
      kind: 'licence',
      numero: 'GA-PA-2026-00012',
    });
  });

  it('décode un numéro encodé et ignore ce qui suit', () => {
    expect(readLicenceQr('https://x.ga/verif/licence/LIC%2001?source=qr#haut')).toEqual({
      kind: 'licence',
      numero: 'LIC 01',
    });
  });

  it('accepte un numéro seul', () => {
    expect(readLicenceQr('  GA-PA-2026-00012 ')).toEqual({ kind: 'licence', numero: 'GA-PA-2026-00012' });
  });

  it('distingue une quittance d’une licence', () => {
    expect(readLicenceQr('https://x.ga/verif/quittance/Q-2026-0007')).toEqual({
      kind: 'quittance',
      numero: 'Q-2026-0007',
    });
  });

  it('refuse tout autre contenu', () => {
    expect(readLicenceQr('')).toEqual({ kind: 'inconnu' });
    expect(readLicenceQr('https://exemple.ga/autre/page')).toEqual({ kind: 'inconnu' });
    expect(readLicenceQr('WIFI:S:reseau;T:WPA;P:secret;;')).toEqual({ kind: 'inconnu' });
    expect(readLicenceQr('bonjour à tous')).toEqual({ kind: 'inconnu' });
  });

  it('relit ce que la carte du pêcheur affiche', () => {
    const url = licenceVerificationUrl('GA-PA-2026-00012');
    expect(url).toMatch(/^https:\/\/.+\/verif\/licence\/GA-PA-2026-00012$/);
    expect(readLicenceQr(url)).toEqual({ kind: 'licence', numero: 'GA-PA-2026-00012' });
  });
});

describe('statut de licence', () => {
  it('reprend les libellés de la page publique de vérification', () => {
    expect(libelleStatutLicence('valide')).toBe('Licence valide');
    expect(libelleStatutLicence('sans_date')).toBe('Licence valide');
    expect(libelleStatutLicence('expiree')).toBe('Autorisation annuelle expirée');
    expect(libelleStatutLicence('suspendue')).toBe('Titulaire suspendu');
    expect(libelleStatutLicence('inconnue')).toBe('Numéro inconnu au registre');
    expect(tonStatutLicence('valide')).toBe('ok');
    expect(tonStatutLicence('expiree')).toBe('warn');
    expect(tonStatutLicence('inconnue')).toBe('error');
  });

  it('affiche expirée, hors ligne, une licence dont la date de fin est passée', () => {
    const today = new Date(2026, 10, 24); // 24 novembre 2026
    expect(statutLicenceAuJour('valide', '2026-11-23', today)).toBe('expiree');
    expect(statutLicenceAuJour('valide', '2026-11-24', today)).toBe('valide');
    expect(statutLicenceAuJour('valide', '2027-01-15', today)).toBe('valide');
    expect(statutLicenceAuJour('valide', null, today)).toBe('valide');
    expect(statutLicenceAuJour('suspendue', '2020-01-01', today)).toBe('suspendue');
  });
});

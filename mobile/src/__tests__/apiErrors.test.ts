import {
  ApiError,
  friendlyApiError,
  isApiError,
  isNetworkError,
  isSessionExpired,
  messageForCode,
  messageForStatus,
  parseApiError,
} from '../lib/apiErrors';

describe('erreurs du serveur', () => {
  it('reconnaît une erreur d’appel et son statut', () => {
    const err = new ApiError('message', 409, 'CODE');
    expect(err instanceof ApiError).toBe(true);
    expect(err instanceof Error).toBe(true);
    expect(isApiError(err)).toBe(true);
    expect(isApiError(new Error('x'))).toBe(false);
    expect(err.status).toBe(409);
    expect(err.code).toBe('CODE');
  });

  it('distingue l’absence de réseau d’une session expirée', () => {
    expect(isNetworkError(new ApiError('réseau', 0))).toBe(true);
    expect(isNetworkError(new ApiError('expirée', 401))).toBe(false);
    expect(isSessionExpired(new ApiError('expirée', 401))).toBe(true);
    expect(isSessionExpired(new ApiError('refus', 400))).toBe(false);
  });

  it('ne montre jamais de JSON brut', () => {
    expect(parseApiError('{"detail":"Identifiants invalides","code":"INVALID_CREDENTIALS"}')).toBe(
      'Identifiants invalides',
    );
    expect(parseApiError('{"x":1}')).toBe('Opération impossible. Vérifiez votre saisie.');
    expect(parseApiError('<html>502</html>')).toBe('Opération impossible. Vérifiez votre saisie.');
    expect(friendlyApiError(new ApiError('Message clair', 400))).toBe('Message clair');
  });

  it('remplace les messages techniques du serveur par des messages de terrain', () => {
    expect(messageForCode('POSITION_HORS_EAU')).toMatch(/ni en mer, ni sur un fleuve/);
    expect(messageForCode('INCONNU')).toBeNull();
    expect(messageForStatus(503)).toMatch(/momentanément indisponible/);
  });

  it('dit quoi faire sans révéler à qui l’appareil est rattaché (ADR-012)', () => {
    for (const code of [
      'APPAREIL_DEJA_RATTACHE',
      'COMPTE_RATTACHE_AUTRE_APPAREIL',
      'APPAREIL_NON_RATTACHE',
      'SUIVI_DEJA_ASSURE',
    ]) {
      const message = messageForCode(code);
      expect(message).toBeTruthy();
      expect(message).toMatch(/agent de contrôle/);
    }
  });
});

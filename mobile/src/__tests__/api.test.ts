/**
 * Appels au serveur : identifiant de l'appareil (ADR-012), session refusée
 * (401), absence de réseau, messages lisibles.
 */
import {
  fetchMe,
  login,
  postPositionsBatch,
  setUnauthorizedHandler,
  verifPubliqueLicence,
} from '../api';
import { ApiError } from '../lib/apiErrors';

jest.mock('../device', () => ({
  deviceId: jest.fn(async () => 'android:0123456789abcdef'),
}));

type FetchCall = { url: string; init: RequestInit & { headers: Record<string, string> } };

const calls: FetchCall[] = [];

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  (globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string, init: FetchCall['init']) => {
    calls.push({ url, init });
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name: string) => headers[name] ?? null },
      text: async () => text,
      json: async () => JSON.parse(text),
    };
  });
}

function failNetwork() {
  (globalThis as { fetch: unknown }).fetch = jest.fn(async () => {
    throw new TypeError('Network request failed');
  });
}

async function caught(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (err) {
    return err as ApiError;
  }
  throw new Error('une erreur était attendue');
}

beforeEach(() => {
  calls.length = 0;
  setUnauthorizedHandler(null);
});

describe('identifiant de l’appareil', () => {
  it('part à la connexion, sans jeton', async () => {
    respond(200, { access_token: 'jeton', token_type: 'bearer' });
    await login('pecheur@exemple.ga', 'secret');
    expect(calls[0].init.headers['X-Appareil-Id']).toBe('android:0123456789abcdef');
    expect(calls[0].init.headers.Authorization).toBeUndefined();
  });

  it('part avec chaque requête authentifiée', async () => {
    respond(200, { id: 'u1', nom: 'Jean', role: 'pecheur' });
    await fetchMe('jeton');
    expect(calls[0].init.headers['X-Appareil-Id']).toBe('android:0123456789abcdef');
    expect(calls[0].init.headers.Authorization).toBe('Bearer jeton');
  });

  it('ne part pas avec une requête publique', async () => {
    respond(200, { numero: 'X', type: 'licence', valide: true, statut: 'valide' });
    await verifPubliqueLicence('GA-PA-2026-00012');
    expect(calls[0].init.headers['X-Appareil-Id']).toBeUndefined();
    expect(calls[0].url).toMatch(/\/api\/v1\/public\/verif\/licence\/GA-PA-2026-00012$/);
  });
});

describe('session refusée par le serveur', () => {
  it('prévient le gestionnaire de session avec le jeton refusé et lève une erreur claire', async () => {
    const handler = jest.fn();
    setUnauthorizedHandler(handler);
    respond(401, { detail: 'Jeton invalide ou expiré' });
    const err = await caught(fetchMe('jeton-perime'));
    expect(handler).toHaveBeenCalledWith('jeton-perime');
    expect(err.status).toBe(401);
    expect(err.code).toBe('SESSION_EXPIREE');
    expect(err.message).toBe('Votre session a expiré. Reconnectez-vous.');
  });

  it('ne ferme aucune session pour un refus sans jeton', async () => {
    const handler = jest.fn();
    setUnauthorizedHandler(handler);
    respond(401, { detail: 'Authentification requise' });
    const err = await caught(verifPubliqueLicence('X'));
    expect(handler).not.toHaveBeenCalled();
    expect(err.status).toBe(401);
  });
});

describe('messages', () => {
  it('signale l’absence de réseau sans statut', async () => {
    failNetwork();
    const err = await caught(fetchMe('jeton'));
    expect(err.status).toBe(0);
    expect(err.message).toBe('Impossible de joindre le serveur. Vérifiez le réseau.');
  });

  it('traduit le refus d’une position à terre', async () => {
    respond(400, {
      detail: 'Position refusée : ... Utilisez un corridor de démo ou un GPS réel en zone d’eau gabonaise.',
      code: 'POSITION_HORS_EAU',
    });
    const err = await caught(postPositionsBatch('jeton', []));
    expect(err.code).toBe('POSITION_HORS_EAU');
    expect(err.message).toBe('Position refusée : elle n’est ni en mer, ni sur un fleuve.');
  });

  it('dit à qui s’adresser quand le téléphone est rattaché à un autre compte', async () => {
    respond(409, { detail: 'Appareil déjà rattaché', code: 'APPAREIL_DEJA_RATTACHE' });
    const err = await caught(login('autre@exemple.ga', 'secret'));
    expect(err.status).toBe(409);
    expect(err.message).toMatch(/agent de contrôle/);
  });

  it('reprend le code porté par l’en-tête quand le corps n’en a pas', async () => {
    respond(402, { detail: 'Abonnement requis pour envoyer des positions' }, { 'X-Error-Code': 'ABONNEMENT_REQUIS' });
    const err = await caught(postPositionsBatch('jeton', []));
    expect(err.code).toBe('ABONNEMENT_REQUIS');
    expect(err.message).toBe('Abonnement requis pour envoyer des positions');
  });

  it('ne montre pas de code technique quand le serveur est en panne', async () => {
    respond(502, '');
    const err = await caught(fetchMe('jeton'));
    expect(err.message).toBe('Le serveur est momentanément indisponible. Réessayez dans un instant.');
  });
});

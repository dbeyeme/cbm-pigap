/**
 * Session conservée : restaurée à l'ouverture, effacée à la déconnexion et dès
 * que le serveur refuse le jeton.
 */
import { fetchMe, type UtilisateurMe } from '../api';
import {
  closeSession,
  consumeExpiredNotice,
  currentSession,
  openSession,
  restoreSession,
  subscribeSession,
} from '../auth/session';

const mockStore = new Map<string, string>();
const mockSettings = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 1,
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockStore.delete(key);
  }),
}));

jest.mock('../offline/db', () => ({
  getSetting: jest.fn(async (key: string) => mockSettings.get(key) ?? null),
  setSetting: jest.fn(async (key: string, value: string) => {
    mockSettings.set(key, value);
  }),
  deleteSetting: jest.fn(async (key: string) => {
    mockSettings.delete(key);
  }),
}));

jest.mock('../device', () => ({ deviceId: jest.fn(async () => null) }));

const user: UtilisateurMe = {
  id: 'u1',
  nom: 'Jean Obiang',
  role: 'pecheur',
  telephone: null,
  email: 'jean@exemple.ga',
  organisation_id: null,
  date_creation: '2026-01-01T00:00:00Z',
};

function serverRefuses() {
  (globalThis as { fetch: unknown }).fetch = jest.fn(async () => ({
    ok: false,
    status: 401,
    headers: { get: () => null },
    text: async () => '{"detail":"Jeton invalide ou expiré"}',
    json: async () => ({}),
  }));
}

beforeEach(async () => {
  await closeSession('deconnexion');
  mockStore.clear();
  mockSettings.clear();
});

describe('session conservée', () => {
  it('se retrouve à la réouverture de l’application', async () => {
    await openSession({ token: 'jeton-1', user });
    // Simule une fermeture : seule la copie du téléphone subsiste
    const restored = await restoreSession();
    expect(restored).toEqual({ token: 'jeton-1', user });
    expect(currentSession()?.token).toBe('jeton-1');
  });

  it('ne garde jamais le mot de passe', async () => {
    await openSession({ token: 'jeton-1', user });
    expect([...mockStore.keys()].sort()).toEqual(['pigap.session.jeton', 'pigap.session.utilisateur']);
    expect(JSON.stringify([...mockStore.values()])).not.toMatch(/mot_de_passe|password/i);
  });

  it('s’efface à la déconnexion', async () => {
    await openSession({ token: 'jeton-1', user });
    await closeSession('deconnexion');
    expect(mockStore.size).toBe(0);
    expect(await restoreSession()).toBeNull();
    expect(await consumeExpiredNotice()).toBe(false);
  });
});

describe('refus du serveur (401)', () => {
  it('efface le jeton, prévient l’écran et laisse un message pour la prochaine ouverture', async () => {
    await openSession({ token: 'jeton-1', user });
    const seen: Array<string | undefined> = [];
    const off = subscribeSession((next, reason) => {
      if (!next) seen.push(reason);
    });
    serverRefuses();
    await expect(fetchMe('jeton-1')).rejects.toMatchObject({ status: 401 });
    off();
    expect(seen).toEqual(['expiree']);
    expect(mockStore.size).toBe(0);
    expect(currentSession()).toBeNull();
    expect(await consumeExpiredNotice()).toBe(true);
    expect(await consumeExpiredNotice()).toBe(false);
  });

  it('ne ferme pas une session neuve à cause de la réponse tardive d’un ancien jeton', async () => {
    await openSession({ token: 'jeton-neuf', user });
    serverRefuses();
    await expect(fetchMe('jeton-ancien')).rejects.toMatchObject({ status: 401 });
    expect(currentSession()?.token).toBe('jeton-neuf');
    expect(mockStore.get('pigap.session.jeton')).toBe('jeton-neuf');
  });
});

/** Garde locale de la règle « un appareil, un seul compte pêcheur » (ADR-012). */
import { acknowledgeAttachmentInfo, attachFisher, attachmentInfoPending } from '../auth/attachment';

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

beforeEach(() => {
  mockStore.clear();
  mockSettings.clear();
});

describe('un téléphone, un seul compte pêcheur', () => {
  it('rattache le premier compte pêcheur et prévoit de l’en informer', async () => {
    expect(await attachFisher('pecheur-a', false)).toBe('premier');
    expect(await attachmentInfoPending('pecheur-a')).toBe(true);
    await acknowledgeAttachmentInfo('pecheur-a');
    expect(await attachmentInfoPending('pecheur-a')).toBe(false);
  });

  it('laisse revenir le même compte sans le réinformer', async () => {
    await attachFisher('pecheur-a', false);
    await acknowledgeAttachmentInfo('pecheur-a');
    expect(await attachFisher('pecheur-a', false)).toBe('deja_rattache');
    expect(await attachmentInfoPending('pecheur-a')).toBe(false);
  });

  it('refuse un second compte pêcheur', async () => {
    await attachFisher('pecheur-a', false);
    expect(await attachFisher('pecheur-b', false)).toBe('refuse');
    expect(await attachFisher('pecheur-a', false)).toBe('deja_rattache');
  });

  it('suit la décision du serveur quand il confirme le rattachement d’un autre compte', async () => {
    await attachFisher('pecheur-a', false);
    expect(await attachFisher('pecheur-b', true)).toBe('premier');
    expect(await attachFisher('pecheur-a', false)).toBe('refuse');
  });

  it('ne garde que l’identifiant du compte, jamais un nom', async () => {
    await attachFisher('pecheur-a', false);
    expect([...mockStore.values()]).toEqual(['pecheur-a']);
  });
});

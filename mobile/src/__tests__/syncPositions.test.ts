/**
 * Envoi des positions : le défaut d'origine marquait toute la file « refusée »
 * à la première erreur, y compris pour une simple session expirée.
 */
import { postPositionsBatch } from '../api';
import { ApiError } from '../lib/apiErrors';
import type { LocalPosition } from '../offline/db';
import { syncPendingPositions } from '../offline/syncPositions';

let mockPending: LocalPosition[] = [];
const mockSynced: string[] = [];
const mockRejected: string[] = [];

jest.mock('../offline/db', () => ({
  listPendingPositions: jest.fn(async () => mockPending),
  markPositionsSynced: jest.fn(async (ids: string[]) => {
    mockSynced.push(...ids);
  }),
  markPositionsRejected: jest.fn(async (ids: string[]) => {
    mockRejected.push(...ids);
  }),
}));

jest.mock('../api', () => ({ postPositionsBatch: jest.fn() }));

const send = postPositionsBatch as jest.MockedFunction<typeof postPositionsBatch>;

function position(id: string, lon: number, minute: number, boat = 'bateau-1'): LocalPosition {
  return {
    id,
    embarcation_id: boat,
    lon,
    lat: 0.3,
    horodatage: new Date(Date.UTC(2026, 10, 24, 10, minute)).toISOString(),
    sync_status: 'pending',
    created_at: '2026-11-24T10:00:00.000Z',
    last_error: null,
  };
}

beforeEach(() => {
  mockPending = [];
  mockSynced.length = 0;
  mockRejected.length = 0;
  send.mockReset();
});

describe('syncPendingPositions', () => {
  it('garde toute la file quand la session a expiré', async () => {
    mockPending = [position('1', 9.2, 1), position('2', 9.21, 2), position('3', 9.22, 3)];
    send.mockRejectedValue(new ApiError('Votre session a expiré. Reconnectez-vous.', 401, 'SESSION_EXPIREE'));
    const report = await syncPendingPositions('jeton', 'u1');
    expect(mockRejected).toEqual([]);
    expect(mockSynced).toEqual([]);
    expect(report.stopped).toBe('session');
    expect(report.remaining).toBe(3);
  });

  it('garde toute la file sans réseau', async () => {
    mockPending = [position('1', 9.2, 1), position('2', 9.21, 2)];
    send.mockRejectedValue(new ApiError('réseau', 0, 'RESEAU'));
    const report = await syncPendingPositions('jeton', 'u1');
    expect(mockRejected).toEqual([]);
    expect(report.stopped).toBe('reseau');
    expect(report.remaining).toBe(2);
  });

  it('garde toute la file sur une réponse inattendue du serveur', async () => {
    // Une route introuvable ou un refus sans code métier ne dit rien des relevés
    mockPending = [position('1', 9.2, 1), position('2', 9.21, 2)];
    send.mockRejectedValue(new ApiError('Information introuvable sur le serveur.', 404));
    const report = await syncPendingPositions('jeton', 'u1');
    expect(mockRejected).toEqual([]);
    expect(report.stopped).toBe('serveur');
    expect(report.remaining).toBe(2);
  });

  it('n’écarte que la position à terre et envoie les autres', async () => {
    mockPending = [position('1', 9.2, 1), position('2', 9.21, 2), position('3', 9.6, 3), position('4', 9.23, 4)];
    send.mockImplementation(async (_token, batch) => {
      if (batch.some((p) => p.position.coordinates[0] > 9.45)) {
        throw new ApiError('Position refusée : elle n’est ni en mer, ni sur un fleuve.', 400, 'POSITION_HORS_EAU');
      }
      return [];
    });
    const report = await syncPendingPositions('jeton', 'u1');
    expect(mockRejected).toEqual(['3']);
    expect([...mockSynced].sort()).toEqual(['1', '2', '4']);
    expect(report).toMatchObject({ accepted: 3, rejected: 1, remaining: 0, stopped: null });
    expect(report.rejectMessage).toMatch(/ni en mer/);
    expect(report.exclusiveBoats).toEqual([]);
  });

  it('envoie les positions dans l’ordre, avec la source « mobile »', async () => {
    mockPending = [position('1', 9.2, 1), position('2', 9.21, 2)];
    send.mockResolvedValue([]);
    await syncPendingPositions('jeton', 'u1');
    expect(send).toHaveBeenCalledTimes(1);
    const batch = send.mock.calls[0][1];
    expect(batch.map((p) => p.position.coordinates[0])).toEqual([9.2, 9.21]);
    expect(batch.every((p) => p.source === 'mobile')).toBe(true);
  });

  describe('bateau déjà suivi par un autre appareil (ADR-012)', () => {
    /** Le serveur refuse le lot dès qu'un relevé tombe dans la fenêtre d'un autre appareil. */
    function refuseBetween(from: number, to: number) {
      send.mockImplementation(async (_token, batch) => {
        const conflict = batch.some((p) => {
          const minute = new Date(p.horodatage).getUTCMinutes();
          return minute >= from && minute <= to;
        });
        if (conflict) {
          throw new ApiError('Un autre téléphone assure déjà le suivi de ce bateau.', 409, 'SUIVI_DEJA_ASSURE');
        }
        return [];
      });
    }

    it('n’écarte que les relevés en conflit, pas le reste de la sortie', async () => {
      mockPending = Array.from({ length: 8 }, (_, i) => position(String(i), 9.2, i));
      refuseBetween(0, 2);
      const report = await syncPendingPositions('jeton', 'u1');
      expect([...mockRejected].sort()).toEqual(['0', '1', '2']);
      expect([...mockSynced].sort()).toEqual(['3', '4', '5', '6', '7']);
      // Le relevé le plus récent est passé : le suivi peut continuer
      expect(report.exclusiveBoats).toEqual([]);
    });

    it('signale le bateau quand le relevé le plus récent est lui-même refusé', async () => {
      mockPending = Array.from({ length: 6 }, (_, i) => position(String(i), 9.2, i));
      refuseBetween(4, 5);
      const report = await syncPendingPositions('jeton', 'u1');
      expect([...mockRejected].sort()).toEqual(['4', '5']);
      expect([...mockSynced].sort()).toEqual(['0', '1', '2', '3']);
      expect(report.exclusiveBoats).toEqual(['bateau-1']);
    });
  });
});

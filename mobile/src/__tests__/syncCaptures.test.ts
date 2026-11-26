/**
 * Envoi des déclarations : une saisie refusée ne bloque pas les autres et ne
 * repart pas indéfiniment ; un refus passager la laisse à envoyer.
 */
import { syncCapturesBatch } from '../api';
import { ApiError } from '../lib/apiErrors';
import type { LocalCapture } from '../offline/db';
import { syncPendingCaptures } from '../offline/syncCaptures';

let mockPending: LocalCapture[] = [];
const mockSynced: string[] = [];
const mockRejected: string[] = [];
const mockErrors: string[] = [];

jest.mock('../offline/db', () => ({
  listPendingCaptures: jest.fn(async () => mockPending),
  markSynced: jest.fn(async (ids: string[]) => {
    mockSynced.push(...ids);
  }),
  markCaptureRejected: jest.fn(async (id: string) => {
    mockRejected.push(id);
  }),
  markSyncError: jest.fn(async (id: string) => {
    mockErrors.push(id);
  }),
}));

jest.mock('../api', () => ({ syncCapturesBatch: jest.fn() }));

const send = syncCapturesBatch as jest.MockedFunction<typeof syncCapturesBatch>;

function capture(id: string, espece = 'thon', position: [number, number] | null = null): LocalCapture {
  return {
    id,
    pecheur_id: 'p1',
    embarcation_id: 'b1',
    espece,
    quantite_kg: 5,
    methode: 'ligne_main',
    point_debarquement: 'Owendo',
    date_capture: '2026-11-24T08:33:00.000Z',
    prix_fcfa_kg: null,
    position,
    sync_status: 'pending',
    created_at: '2026-11-24T08:33:00.000Z',
    last_error: null,
  };
}

beforeEach(() => {
  mockPending = [];
  mockSynced.length = 0;
  mockRejected.length = 0;
  mockErrors.length = 0;
  send.mockReset();
});

describe('syncPendingCaptures', () => {
  it('joint le lieu de pêche quand il existe, et rien sinon', async () => {
    mockPending = [capture('a', 'thon', [9.05, 0.42]), capture('b')];
    send.mockResolvedValue({ accepts: ['a', 'b'], duplicates: [], rejects: [] });
    const report = await syncPendingCaptures('jeton', 'u1');
    const sent = send.mock.calls[0][1];
    expect(sent[0].position_capture).toEqual({ type: 'Point', coordinates: [9.05, 0.42] });
    expect('position_capture' in sent[1]).toBe(false);
    expect('prix_fcfa_kg' in sent[0]).toBe(false);
    expect('prix_fcfa_kg' in sent[1]).toBe(false);
    expect(mockSynced).toEqual(['a', 'b']);
    expect(report).toMatchObject({ accepted: 2, rejected: 0, deferred: 0, stopped: null });
  });

  it('envoie le prix au kilo seulement s’il a été saisi', async () => {
    mockPending = [capture('sans'), { ...capture('avec'), prix_fcfa_kg: 600 }];
    send.mockResolvedValue({ accepts: ['sans', 'avec'], duplicates: [], rejects: [] });
    await syncPendingCaptures('jeton', 'u1');
    const sent = send.mock.calls[0][1];
    expect('prix_fcfa_kg' in sent[0]).toBe(false);
    expect(sent[1].prix_fcfa_kg).toBe(600);
  });

  it('écarte pour de bon une déclaration dont le prix est refusé', async () => {
    mockPending = [{ ...capture('a'), prix_fcfa_kg: 10_000_001 }];
    send.mockResolvedValue({
      accepts: [],
      duplicates: [],
      rejects: [{ id: 'a', detail: 'Prix trop élevé', code: 'PRIX_TROP_ELEVE' }],
    });
    const report = await syncPendingCaptures('jeton', 'u1');
    expect(mockRejected).toEqual(['a']);
    expect(mockErrors).toEqual([]);
    expect(report.rejected).toBe(1);
  });

  it('isole la déclaration mal formée et envoie les autres', async () => {
    mockPending = [capture('a'), capture('b', 'espece_inconnue'), capture('c')];
    send.mockImplementation(async (_token, batch) => {
      if (batch.some((c) => c.espece === 'espece_inconnue')) {
        throw new ApiError('Espèce : hors référentiel.', 422, 'VALIDATION_ERROR');
      }
      return { accepts: batch.map((c) => c.id as string), duplicates: [], rejects: [] };
    });
    const report = await syncPendingCaptures('jeton', 'u1');
    expect(mockRejected).toEqual(['b']);
    expect([...mockSynced].sort()).toEqual(['a', 'c']);
    expect(report.rejected).toBe(1);
    expect(report.stopped).toBeNull();
  });

  it('laisse à envoyer une déclaration refusée pour une raison passagère', async () => {
    mockPending = [capture('a'), capture('b')];
    send.mockResolvedValue({
      accepts: ['a'],
      duplicates: [],
      rejects: [{ id: 'b', detail: 'Abonnement requis', code: 'SYNC_REJECTED' }],
    });
    const report = await syncPendingCaptures('jeton', 'u1');
    expect(mockRejected).toEqual([]);
    expect(mockErrors).toEqual(['b']);
    expect(report).toMatchObject({ accepted: 1, rejected: 0, deferred: 1 });
  });

  it('écarte pour de bon une déclaration que le serveur ne prendra jamais', async () => {
    mockPending = [capture('a')];
    send.mockResolvedValue({
      accepts: [],
      duplicates: [],
      rejects: [{ id: 'a', detail: 'Identifiant déjà utilisé', code: 'CAPTURE_ID_CONFLICT' }],
    });
    const report = await syncPendingCaptures('jeton', 'u1');
    expect(mockRejected).toEqual(['a']);
    expect(mockErrors).toEqual([]);
    expect(report.rejected).toBe(1);
  });

  it('garde toute la file quand la session a expiré ou que le réseau manque', async () => {
    mockPending = [capture('a'), capture('b')];
    send.mockRejectedValue(new ApiError('Votre session a expiré. Reconnectez-vous.', 401, 'SESSION_EXPIREE'));
    expect((await syncPendingCaptures('jeton', 'u1')).stopped).toBe('session');
    send.mockRejectedValue(new ApiError('réseau', 0, 'RESEAU'));
    expect((await syncPendingCaptures('jeton', 'u1')).stopped).toBe('reseau');
    expect(mockRejected).toEqual([]);
    expect(mockSynced).toEqual([]);
  });

  it('marque envoyée une déclaration déjà reçue par le serveur', async () => {
    mockPending = [capture('a')];
    send.mockResolvedValue({ accepts: [], duplicates: ['a'], rejects: [] });
    const report = await syncPendingCaptures('jeton', 'u1');
    expect(mockSynced).toEqual(['a']);
    expect(report.duplicates).toBe(1);
  });
});

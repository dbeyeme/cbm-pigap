/**
 * Envoi des sorties en mer : renvoi sans danger, départ et retour ensemble,
 * refus métier écartés pour de bon, file intacte sur toute autre erreur.
 */
import { postSortie, type SortieRead } from '../api';
import { ApiError } from '../lib/apiErrors';
import type { LocalSortie } from '../offline/db';
import { syncPendingSorties } from '../offline/syncSorties';

let mockPending: LocalSortie[] = [];
const mockSynced: Array<{ id: string; revision: number; serveur: { id: string | null; retour_a: string | null } }> = [];
const mockRejected: Array<{ id: string; message: string }> = [];
const mockErrors: string[] = [];

jest.mock('../offline/db', () => ({
  listPendingSorties: jest.fn(async () => mockPending),
  markSortieSynced: jest.fn(
    async (id: string, revision: number, serveur: { id: string | null; retour_a: string | null }) => {
      mockSynced.push({ id, revision, serveur });
    },
  ),
  markSortieRejected: jest.fn(async (id: string, message: string) => {
    mockRejected.push({ id, message });
  }),
  markSortieError: jest.fn(async (id: string) => {
    mockErrors.push(id);
  }),
}));

jest.mock('../api', () => ({ postSortie: jest.fn() }));

const send = postSortie as jest.MockedFunction<typeof postSortie>;

function sortie(client_id: string, extra: Partial<LocalSortie> = {}): LocalSortie {
  return {
    client_id,
    embarcation_id: 'b1',
    embarcation_nom: 'Espoir',
    port_depart_id: null,
    position_depart: [9.5, 0.28],
    depart_a: '2026-11-27T04:30:00.000Z',
    retour_prevu_a: '2026-11-27T13:00:00.000Z',
    secteur_vise: null,
    retour_a: null,
    port_retour_id: null,
    position_retour: null,
    revision: 1,
    sync_status: 'pending',
    server_id: null,
    created_at: '2026-11-27T04:30:00.000Z',
    last_error: null,
    ...extra,
  };
}

function read(client_id: string, extra: Partial<SortieRead> = {}): SortieRead {
  return {
    id: `srv-${client_id}`,
    client_id,
    retour_a: null,
    ...extra,
  } as SortieRead;
}

beforeEach(() => {
  mockPending = [];
  mockSynced.length = 0;
  mockRejected.length = 0;
  mockErrors.length = 0;
  send.mockReset();
});

describe('syncPendingSorties', () => {
  it('envoie la sortie complète, départ et retour ensemble', async () => {
    mockPending = [
      sortie('a', {
        secteur_vise: 'large-libreville',
        retour_a: '2026-11-27T12:10:00.000Z',
        position_retour: [9.51, 0.29],
        revision: 2,
      }),
    ];
    send.mockResolvedValue(read('a', { retour_a: '2026-11-27T12:10:00.000Z' }));
    const report = await syncPendingSorties('jeton', 'u1');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1]).toEqual({
      client_id: 'a',
      embarcation_id: 'b1',
      port_depart_id: null,
      position_depart: { type: 'Point', coordinates: [9.5, 0.28] },
      depart_a: '2026-11-27T04:30:00.000Z',
      retour_prevu_a: '2026-11-27T13:00:00.000Z',
      secteur_vise: 'large-libreville',
      retour_a: '2026-11-27T12:10:00.000Z',
      port_retour_id: null,
      position_retour: { type: 'Point', coordinates: [9.51, 0.29] },
    });
    expect(mockSynced).toEqual([
      { id: 'a', revision: 2, serveur: { id: 'srv-a', retour_a: '2026-11-27T12:10:00.000Z' } },
    ]);
    expect(report).toMatchObject({ pushed: 1, accepted: 1, rejected: 0, stopped: null, error: null });
  });

  it('envoie le port sans position quand le pêcheur a choisi un port', async () => {
    mockPending = [
      sortie('a', {
        port_depart_id: 'owendo',
        position_depart: null,
        retour_a: '2026-11-27T12:10:00.000Z',
        port_retour_id: 'libreville',
        revision: 2,
      }),
    ];
    send.mockResolvedValue(read('a', { retour_a: '2026-11-27T12:10:00.000Z' }));
    await syncPendingSorties('jeton', 'u1');
    expect(send.mock.calls[0][1]).toMatchObject({
      port_depart_id: 'owendo',
      position_depart: null,
      port_retour_id: 'libreville',
      position_retour: null,
    });
  });

  it('renvoie la même sortie sans danger : le même identifiant part à chaque fois', async () => {
    mockPending = [sortie('a')];
    send.mockRejectedValueOnce(new ApiError('réseau', 0, 'RESEAU'));
    const first = await syncPendingSorties('jeton', 'u1');
    expect(first.stopped).toBe('reseau');
    expect(mockSynced).toEqual([]);

    // Le serveur connaît déjà la sortie (réponse 200) : elle est simplement marquée reçue
    send.mockResolvedValueOnce(read('a'));
    const second = await syncPendingSorties('jeton', 'u1');
    expect(send.mock.calls[0][1].client_id).toBe('a');
    expect(send.mock.calls[1][1]).toEqual(send.mock.calls[0][1]);
    expect(second).toMatchObject({ accepted: 1, stopped: null });
    expect(mockSynced.map((s) => s.id)).toEqual(['a']);
  });

  it('écarte pour de bon une sortie refusée sur un code métier connu, et envoie la suivante', async () => {
    mockPending = [sortie('a'), sortie('b', { embarcation_id: 'b2' }), sortie('c', { embarcation_id: 'b3' })];
    send
      .mockRejectedValueOnce(
        new ApiError('Une autre sortie est déjà en cours pour ce bateau.', 409, 'SORTIE_DEJA_EN_COURS'),
      )
      .mockRejectedValueOnce(
        new ApiError('Retour prévu avant le départ.', 422, 'SORTIE_INVALIDE'),
      )
      .mockResolvedValueOnce(read('c'));
    const report = await syncPendingSorties('jeton', 'u1');
    expect(mockRejected.map((r) => r.id)).toEqual(['a', 'b']);
    expect(mockRejected[1].message).toBe('Retour prévu avant le départ.');
    expect(mockSynced.map((s) => s.id)).toEqual(['c']);
    expect(report).toMatchObject({ accepted: 1, rejected: 2, stopped: null });
    expect(report.rejectMessage).toBe('Retour prévu avant le départ.');
  });

  it('tient pour reçu un retour que la plateforme avait déjà enregistré', async () => {
    mockPending = [sortie('a', { retour_a: '2026-11-27T12:10:00.000Z', revision: 2 })];
    send.mockRejectedValueOnce(new ApiError('Sortie déjà close.', 409, 'SORTIE_DEJA_TERMINEE'));
    const report = await syncPendingSorties('jeton', 'u1');
    expect(mockRejected).toEqual([]);
    expect(mockSynced.map((s) => s.id)).toEqual(['a']);
    expect(report.accepted).toBe(1);
  });

  it('écarte un départ seul que la plateforme dit déjà clos', async () => {
    mockPending = [sortie('a')];
    send.mockRejectedValueOnce(new ApiError('Sortie déjà close.', 409, 'SORTIE_DEJA_TERMINEE'));
    const report = await syncPendingSorties('jeton', 'u1');
    expect(mockRejected.map((r) => r.id)).toEqual(['a']);
    expect(report.rejected).toBe(1);
  });

  it.each([
    ['réseau coupé', new ApiError('réseau', 0, 'RESEAU'), 'reseau'],
    ['session expirée', new ApiError('Votre session a expiré.', 401, 'SESSION_EXPIREE'), 'session'],
    ['panne du serveur', new ApiError('Indisponible', 503, null), 'serveur'],
    ['404 sans code métier', new ApiError('Introuvable', 404, null), 'serveur'],
    ['422 de forme, sans code de sortie', new ApiError('Champ manquant', 422, 'VALIDATION_ERROR'), 'serveur'],
    ['abonnement requis', new ApiError('Abonnement requis', 402, null), 'bloque'],
  ])('garde toute la file sur %s, sans doubler l’ordre des départs', async (_cas, err, reason) => {
    mockPending = [sortie('a'), sortie('b')];
    send.mockRejectedValueOnce(err);
    const report = await syncPendingSorties('jeton', 'u1');
    expect(send).toHaveBeenCalledTimes(1);
    expect(mockRejected).toEqual([]);
    expect(mockSynced).toEqual([]);
    expect(report.stopped).toBe(reason);
    expect(report.error).toBeTruthy();
  });

  it('reprend après une erreur réseau et envoie toute la file', async () => {
    mockPending = [sortie('a'), sortie('b', { depart_a: '2026-11-27T15:00:00.000Z' })];
    send.mockRejectedValueOnce(new ApiError('réseau', 0, 'RESEAU'));
    await syncPendingSorties('jeton', 'u1');
    send.mockImplementation(async (_t, payload) => read(payload.client_id));
    const report = await syncPendingSorties('jeton', 'u1');
    expect(report).toMatchObject({ accepted: 2, stopped: null });
    expect(mockSynced.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('marque reçue seulement la version envoyée', async () => {
    mockPending = [sortie('a', { revision: 3 })];
    send.mockResolvedValue(read('a'));
    await syncPendingSorties('jeton', 'u1');
    expect(mockSynced[0].revision).toBe(3);
  });

  it('ne fait aucun appel quand rien n’attend', async () => {
    const report = await syncPendingSorties('jeton', 'u1');
    expect(send).not.toHaveBeenCalled();
    expect(report).toMatchObject({ pushed: 0, accepted: 0, stopped: null });
  });
});

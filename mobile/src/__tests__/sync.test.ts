/** Orchestrateur d'envoi : un seul envoi à la fois, sans faux « envoyé ». */
import type { Session } from '../auth/session';
import { syncAll } from '../offline/sync';
import { syncPendingCaptures } from '../offline/syncCaptures';
import { syncPendingPositions } from '../offline/syncPositions';

jest.mock('../offline/db', () => ({
  getSetting: jest.fn(async () => null),
  setSetting: jest.fn(async () => undefined),
}));
jest.mock('../offline/syncCaptures', () => ({ syncPendingCaptures: jest.fn() }));
jest.mock('../offline/syncPositions', () => ({ syncPendingPositions: jest.fn() }));

const captures = syncPendingCaptures as jest.MockedFunction<typeof syncPendingCaptures>;
const positions = syncPendingPositions as jest.MockedFunction<typeof syncPendingPositions>;

const session = { token: 'jeton', user: { id: 'u1', role: 'pecheur' } } as unknown as Session;

const noCaptures = { pushed: 0, accepted: 0, duplicates: 0, rejected: 0, deferred: 0, error: null, stopped: null };
function positionReport(accepted: number) {
  return {
    pushed: accepted,
    accepted,
    rejected: 0,
    remaining: 0,
    error: null,
    stopped: null,
    rejectMessage: null,
    exclusiveBoats: [],
  };
}

beforeEach(() => {
  captures.mockReset();
  positions.mockReset();
  captures.mockResolvedValue(noCaptures);
});

describe('syncAll', () => {
  it('enchaîne un second envoi quand une saisie arrive pendant un envoi', async () => {
    let release: (() => void) | undefined;
    positions
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = () => resolve(positionReport(0));
          }),
      )
      .mockResolvedValueOnce(positionReport(1));

    const first = syncAll(session);
    // Laisse l'envoi en cours atteindre la lecture des positions
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Une saisie est mise en file maintenant : l'envoi en cours ne l'a pas lue
    const second = syncAll(session);
    const third = syncAll(session);
    expect(second).not.toBe(first);
    expect(third).toBe(second);

    release?.();
    expect((await first).positions.accepted).toBe(0);
    expect((await second).positions.accepted).toBe(1);
    expect(positions).toHaveBeenCalledTimes(2);
  });

  it('n’envoie pas les positions quand la session vient d’être refusée', async () => {
    captures.mockResolvedValue({ ...noCaptures, stopped: 'session', error: 'Votre session a expiré.' });
    const summary = await syncAll(session);
    expect(positions).not.toHaveBeenCalled();
    expect(summary.sessionExpired).toBe(true);
  });
});

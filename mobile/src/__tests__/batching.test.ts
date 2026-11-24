/**
 * File hors ligne : une saisie refusée ne bloque pas les autres, et une
 * coupure (réseau, session, serveur) ne fait rien perdre.
 */
import { ApiError } from '../lib/apiErrors';
import { sendInBatches, verdictFromError, type RefusalCodes, type SendVerdict } from '../offline/batching';

function run(
  items: number[],
  decide: (batch: number[]) => SendVerdict,
  options: { size?: number; budget?: number } = {},
) {
  const accepted: number[] = [];
  const rejected: number[] = [];
  const codes: Array<string | null> = [];
  const calls: number[][] = [];
  const promise = sendInBatches(items, {
    size: options.size ?? 100,
    budget: options.budget ?? 40,
    send: async (batch) => {
      calls.push(batch);
      return decide(batch);
    },
    onAccepted: async (batch) => {
      accepted.push(...batch);
    },
    onRejected: async (batch, _message, code) => {
      rejected.push(...batch);
      codes.push(code);
    },
  });
  return { promise, accepted, rejected, codes, calls };
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('sendInBatches', () => {
  it('envoie la file par lots de la taille demandée', async () => {
    const t = run(range(250), () => ({ kind: 'ok' }));
    const outcome = await t.promise;
    expect(t.calls.map((c) => c.length)).toEqual([100, 100, 50]);
    expect(outcome).toEqual({ accepted: 250, rejected: 0, calls: 3, stop: null });
    expect(t.accepted).toEqual(range(250));
  });

  it('isole la seule saisie refusée au lieu de rejeter tout le lot', async () => {
    const t = run(range(8), (batch) =>
      batch.includes(5) ? { kind: 'refus', message: 'à terre', code: 'POSITION_HORS_EAU' } : { kind: 'ok' },
    );
    const outcome = await t.promise;
    expect(t.rejected).toEqual([5]);
    expect(t.codes).toEqual(['POSITION_HORS_EAU']);
    expect([...t.accepted].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 6, 7]);
    expect(outcome.accepted).toBe(7);
    expect(outcome.rejected).toBe(1);
    expect(outcome.stop).toBeNull();
  });

  it('ne perd rien quand le réseau manque', async () => {
    const t = run(range(30), () => ({ kind: 'arret', reason: 'reseau', message: 'Pas de réseau' }));
    const outcome = await t.promise;
    expect(t.accepted).toEqual([]);
    expect(t.rejected).toEqual([]);
    expect(outcome.calls).toBe(1);
    expect(outcome.stop).toEqual({ reason: 'reseau', message: 'Pas de réseau' });
  });

  it('garde le reste de la file quand la session expire en cours d’envoi', async () => {
    let call = 0;
    const t = run(
      range(25),
      () => (call++ === 0 ? { kind: 'ok' } : { kind: 'arret', reason: 'session', message: 'expirée' }),
      { size: 10 },
    );
    const outcome = await t.promise;
    expect(t.accepted).toEqual(range(10));
    expect(t.rejected).toEqual([]);
    expect(outcome.stop?.reason).toBe('session');
  });

  it('s’arrête au nombre d’appels prévu et laisse la suite pour plus tard', async () => {
    const t = run(range(50), () => ({ kind: 'ok' }), { size: 10, budget: 2 });
    const outcome = await t.promise;
    expect(outcome.calls).toBe(2);
    expect(t.accepted).toEqual(range(20));
    expect(outcome.stop?.reason).toBe('budget');
  });

  it('rejette un lot entier sans le découper quand le refus vaut pour tout le lot', async () => {
    const t = run(range(6), () => ({
      kind: 'refus',
      message: 'bateau inconnu',
      code: 'EMBARCATION_NOT_FOUND',
      whole: true,
    }));
    const outcome = await t.promise;
    expect(outcome.calls).toBe(1);
    expect(t.rejected).toEqual(range(6));
  });
});

describe('verdictFromError', () => {
  const codes: RefusalCodes = { row: ['POSITION_HORS_EAU', 'VALIDATION_ERROR'], whole: ['EMBARCATION_NOT_FOUND'] };

  it('conserve la file sans réseau', () => {
    expect(verdictFromError(new ApiError('réseau', 0, 'RESEAU'), codes)).toMatchObject({ kind: 'arret', reason: 'reseau' });
    expect(verdictFromError(new TypeError('Network request failed'), codes)).toMatchObject({ kind: 'arret', reason: 'reseau' });
  });

  it('conserve la file quand la session a expiré : un 401 n’est pas un refus métier', () => {
    expect(verdictFromError(new ApiError('expirée', 401, 'SESSION_EXPIREE'), codes)).toMatchObject({
      kind: 'arret',
      reason: 'session',
    });
  });

  it('conserve la file quand l’abonnement manque ou que l’appareil n’est pas rattaché', () => {
    expect(verdictFromError(new ApiError('abonnement', 402, 'ABONNEMENT_REQUIS'), codes)).toMatchObject({ kind: 'arret', reason: 'bloque' });
    expect(verdictFromError(new ApiError('appareil', 403, 'APPAREIL_NON_RATTACHE'), codes)).toMatchObject({ kind: 'arret', reason: 'bloque' });
    expect(verdictFromError(new ApiError('version', 403, 'APPAREIL_REQUIS'), codes)).toMatchObject({ kind: 'arret', reason: 'bloque' });
  });

  it('conserve la file quand le serveur est en panne', () => {
    expect(verdictFromError(new ApiError('panne', 503), codes)).toMatchObject({ kind: 'arret', reason: 'serveur' });
    expect(verdictFromError(new Error('inattendu'), codes)).toMatchObject({ kind: 'arret', reason: 'serveur' });
  });

  it('conserve la file sur un refus sans code métier connu', () => {
    // Une passerelle qui répond 404, un 400 d'origine inconnue : rien n'est écarté
    expect(verdictFromError(new ApiError('introuvable', 404), codes)).toMatchObject({ kind: 'arret', reason: 'serveur' });
    expect(verdictFromError(new ApiError('refus', 400, 'APPAREIL_ID_INVALIDE'), codes)).toMatchObject({ kind: 'arret' });
    expect(verdictFromError(new ApiError('conflit', 409, 'AUTRE_CHOSE'), codes)).toMatchObject({ kind: 'arret' });
    expect(verdictFromError(new ApiError('invalide', 422), codes)).toMatchObject({ kind: 'arret' });
  });

  it('n’écarte une saisie que sur un code métier connu', () => {
    expect(verdictFromError(new ApiError('à terre', 400, 'POSITION_HORS_EAU'), codes)).toEqual({
      kind: 'refus',
      message: 'à terre',
      code: 'POSITION_HORS_EAU',
    });
    expect(verdictFromError(new ApiError('invalide', 422, 'VALIDATION_ERROR'), codes)).toMatchObject({ kind: 'refus' });
    expect(verdictFromError(new ApiError('inconnu', 404, 'EMBARCATION_NOT_FOUND'), codes)).toEqual({
      kind: 'refus',
      message: 'inconnu',
      code: 'EMBARCATION_NOT_FOUND',
      whole: true,
    });
  });
});

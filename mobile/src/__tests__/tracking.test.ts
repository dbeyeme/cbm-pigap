/**
 * Suivi GPS : il ne démarre que sur un geste du pêcheur et ne reprend pas en
 * silence après un arrêt de l'application par le téléphone.
 */
import * as Location from 'expo-location';

import { readTrackingRequest, writeTrackingProgress, writeTrackingRequest } from '../tracking/state';

const mockSettings = new Map<string, string>();
const mockEnqueue = jest.fn(async (..._args: unknown[]) => undefined);
const mockCurrentPosition = jest.fn();

jest.mock('../offline/db', () => ({
  getSetting: jest.fn(async (key: string) => mockSettings.get(key) ?? null),
  setSetting: jest.fn(async (key: string, value: string) => {
    mockSettings.set(key, value);
  }),
  enqueuePosition: (...args: unknown[]) => mockEnqueue(...args),
}));

jest.mock('../tracking/task', () => ({
  TRACKING_TASK: 'pigap-suivi-gps',
  notifyTrackingListeners: jest.fn(),
}));

jest.mock('../tracking/position', () => ({
  readCurrentPosition: (...args: unknown[]) => mockCurrentPosition(...args),
}));

jest.mock('expo-location', () => ({
  Accuracy: { High: 4 },
  ActivityType: { OtherNavigation: 4 },
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(async () => true),
  hasStartedLocationUpdatesAsync: jest.fn(),
  startLocationUpdatesAsync: jest.fn(async () => undefined),
  stopLocationUpdatesAsync: jest.fn(async () => undefined),
}));

const location = Location as jest.Mocked<typeof Location>;

const MINUTE = 60_000;
const INTERVAL = 5 * MINUTE;

/** Charge le module dans un état neuf, comme une application qui vient de s'ouvrir. */
function freshTracking(): typeof import('../tracking/tracking') {
  let loaded: typeof import('../tracking/tracking') | undefined;
  jest.isolateModules(() => {
    loaded = require('../tracking/tracking');
  });
  return loaded as typeof import('../tracking/tracking');
}

function granted(accuracy: 'fine' | 'coarse' = 'fine') {
  location.getForegroundPermissionsAsync.mockResolvedValue({
    granted: true,
    canAskAgain: true,
    status: 'granted',
    expires: 'never',
    android: { accuracy },
  } as Location.LocationPermissionResponse);
}

async function activeRequest(lastRelevéAgoMs: number) {
  await writeTrackingRequest({
    actif: true,
    utilisateurId: 'u1',
    embarcationId: 'b1',
    embarcationNom: 'Pirogue',
    debutA: new Date(Date.now() - 6 * 60 * MINUTE).toISOString(),
    intervalleMs: INTERVAL,
    interrompuA: null,
    interruptionMotif: null,
  });
  await writeTrackingProgress({ dernierReleveA: new Date(Date.now() - lastRelevéAgoMs).toISOString() });
}

beforeEach(() => {
  mockSettings.clear();
  jest.clearAllMocks();
  granted();
});

describe('reconcileTracking, application rouverte après un arrêt par le téléphone', () => {
  it('déclare interrompu un suivi dont le service a disparu', async () => {
    await activeRequest(MINUTE);
    location.hasStartedLocationUpdatesAsync.mockResolvedValue(false);
    const state = await freshTracking().reconcileTracking();
    expect(state.actif).toBe(false);
    expect(state.interruptionMotif).toBe('systeme');
    expect(location.startLocationUpdatesAsync).not.toHaveBeenCalled();
  });

  it('ne reprend pas en silence un suivi resté muet trop longtemps', async () => {
    // Le système a réinscrit les relevés, mais le dernier date de deux heures
    await activeRequest(120 * MINUTE);
    location.hasStartedLocationUpdatesAsync.mockResolvedValue(true);
    const state = await freshTracking().reconcileTracking();
    expect(state.actif).toBe(false);
    expect(state.interruptionMotif).toBe('systeme');
    expect(location.stopLocationUpdatesAsync).toHaveBeenCalledWith('pigap-suivi-gps');
    expect(location.startLocationUpdatesAsync).not.toHaveBeenCalled();
  });

  it('remet en état, avec sa notification et son intervalle, un suivi coupé un court instant', async () => {
    await activeRequest(4 * MINUTE);
    location.hasStartedLocationUpdatesAsync.mockResolvedValue(true);
    const state = await freshTracking().reconcileTracking();
    expect(state.actif).toBe(true);
    expect(location.startLocationUpdatesAsync).toHaveBeenCalledTimes(1);
    const options = location.startLocationUpdatesAsync.mock.calls[0][1];
    expect(options?.timeInterval).toBe(INTERVAL);
    expect(options?.foregroundService?.notificationTitle).toBe('Suivi GPS en cours');
  });

  it('arrête un service qui tourne sans demande du pêcheur', async () => {
    location.hasStartedLocationUpdatesAsync.mockResolvedValue(true);
    const state = await freshTracking().reconcileTracking();
    expect(state.actif).toBe(false);
    expect(location.stopLocationUpdatesAsync).toHaveBeenCalledWith('pigap-suivi-gps');
  });
});

describe('startTracking', () => {
  const input = { utilisateurId: 'u1', embarcationId: 'b1', embarcationNom: 'Pirogue', intervalleMs: INTERVAL };

  it('démarre avec un service de premier plan, sans autorisation « toujours »', async () => {
    location.hasStartedLocationUpdatesAsync.mockResolvedValue(false);
    const tracking = freshTracking();
    expect(await tracking.startTracking(input)).toEqual({ ok: true });
    expect((await readTrackingRequest()).actif).toBe(true);
    const options = location.startLocationUpdatesAsync.mock.calls[0][1];
    expect(options?.foregroundService?.notificationBody).toMatch(/Ouvrez CBM-PIGAP pour arrêter/);
    expect(options?.distanceInterval).toBe(0);

    // Le suivi lancé dans cette exécution n'est pas remis en cause, même muet
    location.hasStartedLocationUpdatesAsync.mockResolvedValue(true);
    await writeTrackingProgress({ dernierReleveA: new Date(Date.now() - 120 * MINUTE).toISOString() });
    expect((await tracking.reconcileTracking()).actif).toBe(true);
    expect(location.startLocationUpdatesAsync).toHaveBeenCalledTimes(1);
  });

  it('refuse une position approximative', async () => {
    granted('coarse');
    const result = await freshTracking().startTracking(input);
    expect(result).toMatchObject({ ok: false, reason: 'approximative' });
    expect(location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    expect((await readTrackingRequest()).actif).toBe(false);
  });

  it('ne laisse aucune demande de suivi si le démarrage échoue', async () => {
    location.hasStartedLocationUpdatesAsync.mockResolvedValue(false);
    location.startLocationUpdatesAsync.mockRejectedValueOnce(new Error('service indisponible'));
    const result = await freshTracking().startTracking(input);
    expect(result).toMatchObject({ ok: false, reason: 'indisponible' });
    expect((await readTrackingRequest()).actif).toBe(false);
  });

  it('efface la demande à l’arrêt', async () => {
    location.hasStartedLocationUpdatesAsync.mockResolvedValue(false);
    const tracking = freshTracking();
    await tracking.startTracking(input);
    location.hasStartedLocationUpdatesAsync.mockResolvedValue(true);
    await tracking.stopTracking();
    expect((await readTrackingRequest()).actif).toBe(false);
    expect(location.stopLocationUpdatesAsync).toHaveBeenCalledWith('pigap-suivi-gps');
  });
});

describe('recordStartPosition', () => {
  it('n’enregistre qu’une fois un relevé de départ arrivé deux fois au même instant', async () => {
    const now = Date.now();
    await writeTrackingRequest({
      actif: true,
      utilisateurId: 'u1',
      embarcationId: 'b1',
      embarcationNom: 'Pirogue',
      debutA: new Date(now).toISOString(),
      intervalleMs: INTERVAL,
      interrompuA: null,
      interruptionMotif: null,
    });
    mockCurrentPosition.mockResolvedValue({ coords: { longitude: 9.2, latitude: 0.3 }, timestamp: now });
    const tracking = freshTracking();
    const request = { utilisateurId: 'u1', embarcationId: 'b1' };
    const results = await Promise.all([
      tracking.recordStartPosition(request),
      tracking.recordStartPosition(request),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
  });
});

import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  Embarcation,
  clearTrajectory,
  getGeolocConfig,
  getTrajectory,
  listTrackedEmbarcations,
  PositionPoint,
  postPositionsBatch,
  type UtilisateurMe,
} from '../api';
import type { MobileMode } from '../auth/roles';
import { GlassPanel } from '../components/GlassPanel';
import { GlowButton } from '../components/GlowButton';
import { SortieSheet, type DepartSortie } from '../components/SortieSheet';
import { TrajectoryNativeMap } from '../components/TrajectoryNativeMap';
import {
  Chip,
  HelpTip,
  IconBadge,
  InfoSheet,
  ListRow,
  Notice,
  PhotoBanner,
  SectionTitle,
  StatRow,
  StatTile,
  type InfoPoint,
} from '../components/ui';
import { MODE_DEMO } from '../config';
import { GABON_MARITIME_ROUTES, MaritimeRouteId, isInGabonZone } from '../geo/gabonMaritimeRoutes';
import { friendlyApiError, isNetworkError, isSessionExpired } from '../lib/apiErrors';
import { newClientId } from '../lib/clientId';
import { formatDate, formatHeure, formatMoment, pluriel } from '../lib/format';
import { retourDepasse } from '../lib/sorties';
import {
  cacheEmbarcations,
  countPendingPositions,
  countPositionsSince,
  currentSortie,
  declareRetourLocal,
  deleteRejectedSortie,
  enqueuePosition,
  enqueueSortie,
  getSetting,
  listCachedEmbarcations,
  listPendingPositionsForBoat,
  listRejectedSorties,
  setSetting,
  type LocalPosition,
  type LocalSortie,
} from '../offline/db';
import { secteurNom } from '../offline/secteurs';
import { readSyncState, subscribeSync, syncAll, syncQuietly, type SyncState } from '../offline/sync';
import { PHOTOS } from '../photos';
import { readCurrentPosition, readRecentPosition } from '../tracking/position';
import {
  TRACKING_IDLE,
  hasSeenTrackingNotice,
  lastTrackingActivity,
  markTrackingNoticeSeen,
  readTrackingState,
  type TrackingState,
} from '../tracking/state';
import { subscribeTracking } from '../tracking/task';
import {
  MESSAGE_POSITION_APPROXIMATIVE,
  acknowledgeInterruption,
  intervalLabel,
  locationAccess,
  locationServicesOn,
  notificationVisible,
  reconcileTracking,
  recordStartPosition,
  requestLocationAccess,
  startTracking,
  stopTracking,
  type LocationAccess,
} from '../tracking/tracking';
import { colors, fonts, radii, space } from '../theme';

type Props = {
  token: string;
  user: UtilisateurMe;
  mode?: MobileMode;
  onBack: () => void;
};

/** Démonstration seulement : un relevé toutes les 30 secondes. */
const DEMO_INTERVAL_SEC = 30;
/** Sans relevé depuis ce nombre d'intervalles, l'écran invite à vérifier la localisation. */
const SILENCE_INTERVALS = 3;
/** Dernier intervalle communiqué par le serveur, gardé pour les démarrages sans réseau. */
const INTERVAL_SETTING = 'geoloc_intervalle_min';

type PendingAction = 'suivi' | 'position';

/** Le temps de fermer une feuille avant d'en ouvrir une autre. */
const SHEET_DELAY_MS = 400;

const HELP_POINTS: ReadonlyArray<InfoPoint> = [
  { icon: 'boat-outline', text: 'Déclarez votre sortie avant de partir, et votre retour en arrivant. Sans retour déclaré après l’heure prévue, une alerte est signalée sur la plateforme.' },
  { icon: 'navigate-outline', text: 'Démarrez le suivi en quittant le quai : la position du bateau est relevée toute seule, même écran éteint.' },
  { icon: 'notifications-outline', text: 'Une notification reste affichée tant que le suivi tourne. Vous l’arrêtez ici, au retour.' },
  { icon: 'cloud-offline-outline', text: 'Sans réseau, les relevés restent sur le téléphone et partent dès que le réseau revient.' },
  { icon: 'eye-outline', text: 'Vos positions vont à la plateforme CBM-PIGAP : agents de contrôle, autorités des pêches et chercheurs habilités y ont accès.' },
  { icon: 'battery-half-outline', text: 'Si le suivi s’arrête seul, le téléphone économise sa batterie : autorisez CBM-PIGAP à fonctionner en arrière-plan dans les réglages.' },
];

function asBoats(
  cached: Array<{ id: string; pecheur_id: string; nom: string; immatriculation: string; type?: string | null }>,
): Embarcation[] {
  return cached.map((b) => ({
    id: b.id,
    pecheur_id: b.pecheur_id,
    nom: b.nom,
    immatriculation: b.immatriculation,
    type: b.type ?? null,
  }));
}

function toPoint(p: LocalPosition): PositionPoint {
  return {
    id: p.id,
    embarcation_id: p.embarcation_id,
    horodatage: p.horodatage,
    position: { type: 'Point', coordinates: [p.lon, p.lat] },
    source: 'mobile',
    synchronise_a: null,
  };
}

export function TrackingScreen({ token, user, mode = 'agent', onBack }: Props) {
  const userId = user.id;
  const session = useMemo(() => ({ token, user }), [token, user]);
  // Le profil peut être rafraîchi en cours de route : le chargement initial ne doit pas repartir
  const sessionRef = useRef(session);
  sessionRef.current = session;
  /** Le suivi continu est l'affaire du pêcheur sur son bateau (ADR-009). */
  const canTrack = mode === 'pecheur';

  const [boats, setBoats] = useState<Embarcation[]>([]);
  const [boatId, setBoatId] = useState<string | null>(null);
  const [points, setPoints] = useState<PositionPoint[]>([]);
  const [localPending, setLocalPending] = useState<LocalPosition[]>([]);
  const [tracking, setTracking] = useState<TrackingState>(TRACKING_IDLE);
  const [stats, setStats] = useState({ total: 0, pending: 0, synced: 0, rejected: 0 });
  const [pendingCount, setPendingCount] = useState(0);
  const [syncState, setSyncState] = useState<SyncState>({
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastMessage: null,
  });
  const [notifVisible, setNotifVisible] = useState(true);
  const [servicesOn, setServicesOn] = useState(true);
  const [intervalMin, setIntervalMin] = useState(5);
  const [fastDemo, setFastDemo] = useState(false);
  const [routeId, setRouteId] = useState<MaritimeRouteId>('sortie_cote_mer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [needsSettings, setNeedsSettings] = useState(false);
  const [access, setAccess] = useState<LocationAccess>('a_demander');
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [showDemo, setShowDemo] = useState(false);
  const [showAllPoints, setShowAllPoints] = useState(false);
  const [sortie, setSortie] = useState<LocalSortie | null>(null);
  const [sortieRefusee, setSortieRefusee] = useState<LocalSortie | null>(null);
  const [showSortie, setShowSortie] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const boatIdRef = useRef<string | null>(null);

  const intervalMs =
    MODE_DEMO && fastDemo ? DEMO_INTERVAL_SEC * 1000 : Math.max(intervalMin, 1) * 60_000;

  /** Relit ce que le téléphone sait : état du suivi, file d'attente, dernier envoi. */
  const refreshLocal = useCallback(async () => {
    try {
      const state = await readTrackingState();
      const id = boatIdRef.current;
      const [count, local, sync, visible, services] = await Promise.all([
        countPendingPositions(userId),
        id ? listPendingPositionsForBoat(userId, id) : Promise.resolve([]),
        readSyncState(),
        notificationVisible(),
        locationServicesOn(),
      ]);
      setTracking(state);
      setPendingCount(count);
      setLocalPending(local);
      const [enCours, refusees] = await Promise.all([
        id ? currentSortie(userId, id) : Promise.resolve(null),
        listRejectedSorties(userId),
      ]);
      setSortie(enCours);
      setSortieRefusee(refusees[0] ?? null);
      setSyncState(sync);
      setNotifVisible(visible);
      setServicesOn(services);
      if (state.actif && state.embarcationId && state.debutA) {
        setStats(await countPositionsSince(userId, state.embarcationId, state.debutA));
      }
    } catch {
      // stockage local indisponible : l'écran garde ses dernières valeurs
    }
  }, [userId]);

  const loadTrajectory = useCallback(
    async (id: string) => {
      try {
        setPoints(await getTrajectory(token, id));
      } catch (err) {
        // Sans réseau, le parcours déjà affiché et les relevés du téléphone suffisent
        if (!isNetworkError(err) && !isSessionExpired(err)) setError(friendlyApiError(err));
      }
    },
    [token],
  );

  const selectBoat = useCallback(
    async (id: string) => {
      setBoatId(id);
      boatIdRef.current = id;
      setPoints([]);
      setError(null);
      await refreshLocal();
      await loadTrajectory(id);
    },
    [loadTrajectory, refreshLocal],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setAccess(await locationAccess());
      const state = await reconcileTracking().catch(() => TRACKING_IDLE);
      if (cancelled) return;
      setTracking(state);

      try {
        const saved = Number(await getSetting(INTERVAL_SETTING));
        if (!cancelled && Number.isFinite(saved) && saved > 0) setIntervalMin(saved);
      } catch {
        // intervalle par défaut
      }

      // Bateaux connus du téléphone d'abord : l'écran sert sans réseau
      let known: Embarcation[] = [];
      try {
        known = asBoats(await listCachedEmbarcations(userId));
      } catch {
        // liste vide
      }
      const preferred = (list: Embarcation[]) =>
        list.find((b) => b.id === state.embarcationId && state.actif) ?? list[0] ?? null;
      if (!cancelled && known.length > 0) {
        setBoats(known);
        const first = preferred(known);
        if (first) {
          setBoatId(first.id);
          boatIdRef.current = first.id;
        }
      }

      try {
        const [config, fleet] = await Promise.all([
          getGeolocConfig(token),
          listTrackedEmbarcations(token),
        ]);
        if (cancelled) return;
        setIntervalMin(config.gps_interval_minutes);
        void setSetting(INTERVAL_SETTING, String(config.gps_interval_minutes)).catch(() => undefined);
        setBoats(fleet);
        void cacheEmbarcations(
          userId,
          fleet.map((b) => ({
            id: b.id,
            pecheur_id: b.pecheur_id,
            nom: b.nom,
            immatriculation: b.immatriculation,
            type: b.type,
          })),
        ).catch(() => undefined);
        const current = fleet.find((b) => b.id === boatIdRef.current) ?? preferred(fleet);
        if (current) {
          setBoatId(current.id);
          boatIdRef.current = current.id;
        }
      } catch (err) {
        if (cancelled) return;
        if (isNetworkError(err)) {
          if (known.length === 0) {
            setError('Pas de réseau. Connectez-vous une fois avec internet pour charger vos bateaux.');
          }
        } else if (!isSessionExpired(err)) {
          setError(friendlyApiError(err));
        }
      }

      // Relevés restés en attente lors d'une ouverture précédente
      await syncQuietly(sessionRef.current);
      if (cancelled) return;
      await refreshLocal();
      if (boatIdRef.current) await loadTrajectory(boatIdRef.current);
    })();
    return () => {
      cancelled = true;
    };
  }, [token, userId, refreshLocal, loadTrajectory]);

  // Un relevé pris ou un envoi terminé : l'écran se met à jour seul
  useEffect(() => {
    const offTracking = subscribeTracking(() => void refreshLocal());
    const offSync = subscribeSync((summary) => {
      void refreshLocal();
      // Écran éteint, inutile de retélécharger le parcours à chaque relevé
      if (summary.positions.accepted > 0 && boatIdRef.current && AppState.currentState === 'active') {
        void loadTrajectory(boatIdRef.current);
      }
    });
    const appState = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      void (async () => {
        setAccess(await locationAccess());
        setTracking(await reconcileTracking().catch(() => TRACKING_IDLE));
        await refreshLocal();
        if (boatIdRef.current) await loadTrajectory(boatIdRef.current);
      })();
    });
    return () => {
      offTracking();
      offSync();
      appState.remove();
    };
  }, [refreshLocal, loadTrajectory]);

  // Pendant une sortie, l'heure affichée avance seule : le dépassement apparaît sans geste
  useEffect(() => {
    if (!sortie) return;
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, [sortie]);

  function resetMessages() {
    setError(null);
    setInfo(null);
    setNeedsSettings(false);
  }

  async function beginTracking() {
    const boat = boats.find((b) => b.id === boatId);
    if (!boat) return;
    setBusy(true);
    try {
      const result = await startTracking({
        utilisateurId: userId,
        embarcationId: boat.id,
        embarcationNom: boat.nom,
        intervalleMs: intervalMs,
      });
      if (!result.ok) {
        setError(result.message);
        setNeedsSettings(result.reason === 'permission' || result.reason === 'approximative');
        return;
      }
      setInfo(`Suivi démarré : position relevée ${intervalLabel(intervalMs)}, même écran éteint.`);
      setStats({ total: 0, pending: 0, synced: 0, rejected: 0 });
      await refreshLocal();
      // Point de départ pris tout de suite, sans attendre le premier intervalle
      void recordStartPosition({ utilisateurId: userId, embarcationId: boat.id })
        .then((stored) => (stored ? syncQuietly(sessionRef.current) : null))
        .then(() => refreshLocal())
        .catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  async function endTracking() {
    resetMessages();
    setBusy(true);
    try {
      await stopTracking();
      await syncQuietly(session);
      await refreshLocal();
      if (boatIdRef.current) await loadTrajectory(boatIdRef.current);
      setInfo('Suivi arrêté.');
    } finally {
      setBusy(false);
    }
  }

  async function sendOnce() {
    if (!boatId) return;
    setBusy(true);
    try {
      const location = await readCurrentPosition();
      const { longitude, latitude } = location.coords;
      if (!isInGabonZone(longitude, latitude)) {
        throw new Error('Position hors des eaux gabonaises : elle n’est pas envoyée.');
      }
      // Écriture sur le téléphone d'abord (§10 : faible couverture), envoi ensuite
      await enqueuePosition({
        utilisateur_id: userId,
        embarcation_id: boatId,
        lon: longitude,
        lat: latitude,
        horodatage: new Date(location.timestamp).toISOString(),
      });
      const summary = await syncAll(session);
      await refreshLocal();
      if (summary.positions.rejected > 0) {
        setError(summary.positions.rejectMessage ?? 'Position refusée par le serveur.');
      } else if (summary.positions.stopped) {
        setInfo('Position gardée sur le téléphone. Elle partira dès que le réseau revient.');
      } else {
        setInfo('Position envoyée.');
        await loadTrajectory(boatId);
      }
    } catch (err) {
      setError(friendlyApiError(err));
    } finally {
      setBusy(false);
    }
  }

  /** Point de départ d'une sortie : la feuille de déclaration explique l'usage avant la demande. */
  async function releverDepart(): Promise<{ position: [number, number] } | { erreur: string }> {
    let current = await locationAccess();
    if (current === 'a_demander') current = await requestLocationAccess();
    setAccess(current);
    if (current === 'approximative') return { erreur: MESSAGE_POSITION_APPROXIMATIVE };
    if (current !== 'accordee') {
      return {
        erreur:
          'Localisation non autorisée : autorisez-la dans les réglages du téléphone pour relever votre point de départ.',
      };
    }
    try {
      const location = await readCurrentPosition();
      const { longitude, latitude } = location.coords;
      if (!isInGabonZone(longitude, latitude)) {
        return { erreur: 'Votre position est hors des eaux gabonaises : la sortie ne peut pas partir d’ici.' };
      }
      return { position: [longitude, latitude] };
    } catch (err) {
      return { erreur: friendlyApiError(err) };
    }
  }

  /** Départ enregistré sur le téléphone d'abord, envoi ensuite. */
  async function confirmerDepart(depart: DepartSortie) {
    const boat = boats.find((b) => b.id === boatId);
    if (!boat) return;
    resetMessages();
    try {
      await enqueueSortie({
        client_id: newClientId(),
        utilisateur_id: userId,
        embarcation_id: boat.id,
        embarcation_nom: boat.nom,
        position_depart: depart.position_depart,
        depart_a: new Date().toISOString(),
        retour_prevu_a: depart.retour_prevu_a.toISOString(),
        secteur_vise: depart.secteur_vise,
      });
    } catch (err) {
      setError(friendlyApiError(err));
      return;
    }
    setShowSortie(false);
    await refreshLocal();
    setInfo(`Sortie déclarée. Retour prévu ${formatMoment(depart.retour_prevu_a)}.`);
    void syncQuietly(sessionRef.current).then(() => refreshLocal());
    if (depart.demarrerSuivi && !tracking.actif) {
      // La feuille de départ se ferme avant que celle du suivi ne s'ouvre
      setTimeout(() => void request('suivi'), SHEET_DELAY_MS);
    }
  }

  /** Clôt la sortie maintenant ; arrête aussi le suivi de ce bateau s'il tourne. */
  function declarerRetour() {
    const current = sortie;
    if (!current || busy) return;
    const arreterSuivi = tracking.actif && tracking.embarcationId === current.embarcation_id;
    Alert.alert(
      'Déclarer votre retour ?',
      arreterSuivi
        ? `Retour enregistré à ${formatHeure(new Date())}. Le suivi GPS sera aussi arrêté.`
        : `Retour enregistré à ${formatHeure(new Date())}.`,
      [
        { text: 'Pas encore', style: 'cancel' },
        {
          text: 'Je suis rentré',
          onPress: () => {
            void (async () => {
              resetMessages();
              setBusy(true);
              try {
                const lieu = access === 'accordee' ? await readRecentPosition().catch(() => null) : null;
                await declareRetourLocal(userId, current.client_id, {
                  retour_a: new Date().toISOString(),
                  position_retour: lieu && isInGabonZone(lieu[0], lieu[1]) ? lieu : null,
                });
                if (arreterSuivi) await stopTracking();
                await syncQuietly(sessionRef.current);
                await refreshLocal();
                setInfo(arreterSuivi ? 'Retour enregistré, suivi arrêté.' : 'Retour enregistré.');
              } catch (err) {
                setError(friendlyApiError(err));
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ],
    );
  }

  /** Toute demande d'accès à la position est précédée de son explication. */
  async function request(action: PendingAction) {
    if (!boatId || busy) return;
    resetMessages();
    const [seen, current] = await Promise.all([hasSeenTrackingNotice(userId), locationAccess()]);
    setAccess(current);
    if (current === 'approximative') {
      setError(MESSAGE_POSITION_APPROXIMATIVE);
      setNeedsSettings(true);
      return;
    }
    if (current !== 'accordee' || (action === 'suivi' && !seen)) {
      setPendingAction(action);
      return;
    }
    if (action === 'suivi') await beginTracking();
    else await sendOnce();
  }

  async function confirmSheet() {
    const action = pendingAction;
    setPendingAction(null);
    if (!action) return;
    if (action === 'suivi') await markTrackingNoticeSeen(userId);
    let current = await locationAccess();
    if (current === 'a_demander') current = await requestLocationAccess();
    setAccess(current);
    if (current !== 'accordee') {
      setError(
        current === 'approximative'
          ? MESSAGE_POSITION_APPROXIMATIVE
          : 'Localisation non autorisée : la position du bateau ne peut pas être relevée.',
      );
      setNeedsSettings(current !== 'a_demander');
      return;
    }
    if (action === 'suivi') await beginTracking();
    else await sendOnce();
  }

  async function sendPending() {
    resetMessages();
    setBusy(true);
    try {
      const summary = await syncAll(session);
      await refreshLocal();
      if (summary.message) setError(summary.message);
      else if (summary.positions.rejected > 0) {
        setError(summary.positions.rejectMessage ?? 'Certains relevés ont été refusés par le serveur.');
      } else setInfo('Relevés envoyés.');
    } finally {
      setBusy(false);
    }
  }

  async function onSimulateTrip() {
    if (!boatId) return;
    resetMessages();
    setBusy(true);
    try {
      const route = GABON_MARITIME_ROUTES.find((r) => r.id === routeId)!;
      // L'effacement de l'historique revient aux agents et aux autorités ;
      // un pêcheur ajoute le parcours d'exemple sans rien supprimer.
      if (mode === 'agent') {
        await clearTrajectory(token, boatId).catch(() => undefined);
      }
      const now = Date.now();
      const batch = route.path.map((coordinates, i) => ({
        embarcation_id: boatId,
        position: { type: 'Point' as const, coordinates },
        horodatage: new Date(now - (route.path.length - 1 - i) * 12 * 60_000).toISOString(),
        source: 'mobile' as const,
      }));
      await postPositionsBatch(token, batch);
      await loadTrajectory(boatId);
      setInfo('Parcours d’exemple affiché.');
    } catch (err) {
      setError(friendlyApiError(err));
    } finally {
      setBusy(false);
    }
  }

  const selected = boats.find((b) => b.id === boatId);
  const enRetard = sortie ? retourDepasse(sortie.retour_prevu_a, now) : false;
  const secteurSortie = sortie ? secteurNom(sortie.secteur_vise) : null;
  const trackedHere = tracking.actif && tracking.embarcationId === boatId;
  const shown = useMemo(
    () =>
      [...points, ...localPending.map(toPoint)].sort(
        (a, b) => Date.parse(a.horodatage) - Date.parse(b.horodatage),
      ),
    [points, localPending],
  );
  const recent = [...shown].reverse();
  const visible = showAllPoints ? recent : recent.slice(0, 5);
  const lastPoint = shown[shown.length - 1];
  const releves = trackedHere ? stats.total : shown.length;
  // Suivi actif mais plus aucun relevé depuis plusieurs intervalles
  const silent =
    tracking.actif &&
    lastTrackingActivity(tracking) > 0 &&
    Date.now() - lastTrackingActivity(tracking) > tracking.intervalleMs * SILENCE_INTERVALS;

  const sheetPoints: InfoPoint[] =
    pendingAction === 'suivi'
      ? [
          { icon: 'navigate-outline', text: `La position de votre bateau est relevée ${intervalLabel(intervalMs)}, même écran éteint.` },
          { icon: 'notifications-outline', text: 'Une notification reste affichée tant que le suivi est actif.' },
          { icon: 'eye-outline', text: 'Vos positions vont à la plateforme CBM-PIGAP : agents de contrôle, autorités des pêches et chercheurs habilités y ont accès.' },
          { icon: 'cloud-offline-outline', text: 'Sans réseau, les relevés restent sur le téléphone et partent au retour du réseau.' },
          { icon: 'stop-circle-outline', text: 'Vous arrêtez le suivi quand vous voulez, depuis cet écran.' },
          ...(access !== 'accordee'
            ? [{ icon: 'location-outline' as const, text: 'Le téléphone va vous demander l’accès à la position : acceptez pour que le suivi fonctionne.' }]
            : []),
        ]
      : [
          { icon: 'locate-outline', text: 'La position du téléphone est relevée une seule fois, puis envoyée pour ce bateau.' },
          { icon: 'eye-outline', text: 'Elle va à la plateforme CBM-PIGAP : agents de contrôle, autorités des pêches et chercheurs habilités y ont accès.' },
          { icon: 'location-outline', text: 'Le téléphone va vous demander l’accès à la position : acceptez pour continuer.' },
        ];

  return (
    <View style={styles.root}>
      <PhotoBanner
        photo={PHOTOS.mer}
        kicker={canTrack ? 'Mon bateau en mer' : 'Flotte en mer'}
        title="Suivi GPS"
        onBack={onBack}
        right={<HelpTip title="Le suivi GPS" points={HELP_POINTS} icon="navigate-outline" onDark />}
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        {boats.length === 0 ? (
          <Notice
            tone="warn"
            icon="boat-outline"
            text={
              canTrack
                ? 'Aucun bateau lié à votre compte. Demandez à un agent de l’enregistrer.'
                : 'Aucun bateau enregistré. Créez d’abord un dossier pêcheur.'
            }
            style={styles.topNotice}
          />
        ) : boats.length > 1 && !tracking.actif ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.boatRow}
            style={styles.boatScroll}
          >
            {boats.map((b) => (
              <Chip
                key={b.id}
                label={b.nom}
                icon="boat-outline"
                on={boatId === b.id}
                onPress={() => void selectBoat(b.id)}
              />
            ))}
          </ScrollView>
        ) : null}

        {tracking.interrompuA ? (
          <Pressable
            onPress={() => {
              void acknowledgeInterruption().then(refreshLocal);
            }}
            accessibilityRole="button"
            accessibilityLabel="Masquer ce message"
          >
            <Notice
              tone="warn"
              icon="alert-circle-outline"
              text={
                tracking.interruptionMotif === 'autre_appareil'
                  ? 'Suivi arrêté : un autre téléphone assure déjà le suivi de ce bateau. Adressez-vous à un agent de contrôle si ce n’est pas le vôtre.'
                  : `Le téléphone a interrompu le suivi (constaté ${formatMoment(tracking.interrompuA)}). Redémarrez-le si vous êtes encore en mer.`
              }
              style={styles.topNotice}
            />
          </Pressable>
        ) : null}

        <GlassPanel style={styles.panel} contentStyle={styles.panelInner}>
          {selected ? (
            <View style={styles.boatHead}>
              <IconBadge icon="boat-outline" size={40} />
              <View style={styles.boatText}>
                <Text style={styles.boatName} numberOfLines={1}>
                  {selected.nom}
                </Text>
                <Text style={styles.boatMeta} numberOfLines={1}>
                  {[selected.immatriculation, selected.type].filter(Boolean).join(' · ')}
                </Text>
              </View>
              {trackedHere ? (
                <View style={styles.livePill}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>Suivi actif</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {canTrack && sortie ? (
            <>
              {enRetard ? (
                <Notice
                  tone="warn"
                  icon="alarm-outline"
                  text={`Heure de retour dépassée (${formatHeure(sortie.retour_prevu_a)}). Déclarez votre retour dès que vous êtes à terre.`}
                />
              ) : (
                <ListRow
                  icon="fa6:sailboat"
                  tone="ok"
                  title={`Retour prévu ${formatMoment(sortie.retour_prevu_a, now)}`}
                  meta={[
                    `En mer depuis ${formatMoment(sortie.depart_a, now).replace(/^à /, '')}`,
                    secteurSortie,
                    sortie.sync_status === 'pending' ? 'envoi dès que le réseau revient' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                />
              )}
              <GlowButton
                label={busy ? 'Un instant…' : 'Je suis rentré'}
                icon="home-outline"
                variant={enRetard ? 'primary' : 'ghost'}
                onPress={declarerRetour}
                disabled={busy}
              />
            </>
          ) : null}
          {canTrack && sortieRefusee ? (
            <Pressable
              onPress={() => {
                void deleteRejectedSortie(userId, sortieRefusee.client_id).then(refreshLocal);
              }}
              accessibilityRole="button"
              accessibilityLabel="Masquer ce message"
            >
              <Notice
                tone="error"
                icon="close-circle-outline"
                text={`Sortie du ${formatDate(sortieRefusee.depart_a)} refusée : ${(sortieRefusee.last_error ?? 'déclaration non acceptée').replace(/[.\s]+$/, '')}. Touchez pour masquer.`}
              />
            </Pressable>
          ) : null}

          <TrajectoryNativeMap points={shown} />

          <StatRow>
            <StatTile
              icon="mci:map-marker-path"
              value={releves}
              label={`${releves > 1 ? 'relevés' : 'relevé'}${trackedHere ? ' pris' : ''}`}
            />
            <StatTile
              icon="time-outline"
              value={lastPoint ? formatHeure(lastPoint.horodatage) : 'Aucun'}
              label="dernier relevé"
              tone={trackedHere ? 'ok' : 'muted'}
            />
            <StatTile
              icon={pendingCount > 0 ? 'cloud-offline-outline' : 'cloud-done-outline'}
              value={pendingCount}
              label="à envoyer"
              tone={pendingCount > 0 ? 'warn' : 'muted'}
            />
          </StatRow>

          {canTrack ? (
            <View style={styles.actions}>
              {!sortie && boatId ? (
                <GlowButton
                  label="Partir en mer"
                  icon="boat-outline"
                  variant="accent"
                  onPress={() => {
                    resetMessages();
                    setShowSortie(true);
                  }}
                  disabled={busy}
                />
              ) : null}
              {tracking.actif ? (
                <GlowButton
                  label={busy ? 'Arrêt en cours…' : 'Arrêter le suivi'}
                  icon="stop-circle-outline"
                  onPress={() => void endTracking()}
                  disabled={busy}
                />
              ) : (
                <>
                  <GlowButton
                    label={busy ? 'Un instant…' : 'Démarrer le suivi'}
                    icon="navigate-outline"
                    onPress={() => void request('suivi')}
                    disabled={!boatId || busy}
                  />
                  <GlowButton
                    label="Envoyer ma position une fois"
                    icon="locate-outline"
                    onPress={() => void request('position')}
                    variant="ghost"
                    disabled={!boatId || busy}
                  />
                </>
              )}
            </View>
          ) : (
            <GlowButton
              label={busy ? 'Un instant…' : 'Envoyer la position du téléphone'}
              icon="locate-outline"
              onPress={() => void request('position')}
              disabled={!boatId || busy}
            />
          )}

          {info ? <Notice tone="ok" text={info} /> : null}
          {error ? <Notice tone="error" text={error} /> : null}
          {needsSettings ? (
            <GlowButton
              label="Ouvrir les réglages du téléphone"
              icon="settings-outline"
              variant="ghost"
              onPress={() => void Linking.openSettings()}
            />
          ) : null}

          {pendingCount > 0 ? (
            <>
              <Notice
                tone="warn"
                icon="cloud-offline-outline"
                text={`${pluriel(pendingCount, 'relevé gardé', 'relevés gardés')} sur le téléphone. Envoi automatique dès que le réseau revient.`}
              />
              <GlowButton
                label="Envoyer maintenant"
                icon="cloud-upload-outline"
                variant="ghost"
                onPress={() => void sendPending()}
                disabled={busy}
              />
            </>
          ) : syncState.lastSuccessAt ? (
            <Notice
              tone="muted"
              icon="cloud-done-outline"
              text={`Tout est envoyé. Dernier envoi ${formatMoment(syncState.lastSuccessAt)}.`}
            />
          ) : null}

          {trackedHere && stats.rejected > 0 ? (
            <Notice
              tone="muted"
              icon="remove-circle-outline"
              text={`${pluriel(stats.rejected, 'relevé non retenu', 'relevés non retenus')} par le serveur : position à terre ou parcours impossible.`}
            />
          ) : null}
          {tracking.actif && tracking.horsZone > 0 ? (
            <Notice
              tone="muted"
              icon="remove-circle-outline"
              text={`${pluriel(tracking.horsZone, 'relevé écarté', 'relevés écartés')} : position hors des eaux gabonaises.`}
            />
          ) : null}
          {tracking.actif && !servicesOn ? (
            <Notice
              tone="warn"
              icon="locate-outline"
              text="La localisation du téléphone est éteinte : aucun relevé n’est pris. Rallumez-la."
            />
          ) : tracking.actif && (tracking.enErreur || silent) ? (
            <Notice
              tone="warn"
              icon="locate-outline"
              text={`Aucun relevé depuis ${formatHeure(lastTrackingActivity(tracking))}. Placez le téléphone à découvert ; si rien ne vient, arrêtez puis redémarrez le suivi.`}
            />
          ) : null}
          {tracking.actif && !notifVisible ? (
            <Notice
              tone="muted"
              icon="notifications-off-outline"
              text="Notifications désactivées : le suivi fonctionne, mais sans rappel visible. Autorisez-les dans les réglages."
            />
          ) : null}
        </GlassPanel>

        {MODE_DEMO ? (
          <>
            <Pressable
              onPress={() => setShowDemo((v) => !v)}
              style={styles.toggleRow}
              accessibilityRole="button"
              accessibilityState={{ expanded: showDemo }}
            >
              <IconBadge icon="flask-outline" size={32} tone="muted" />
              <Text style={styles.toggleText}>Parcours d’exemple (démonstration)</Text>
              <Ionicons name={showDemo ? 'chevron-up' : 'chevron-down'} size={20} color={colors.inkSoft} />
            </Pressable>

            {showDemo ? (
              <GlassPanel style={styles.panel} contentStyle={styles.panelInner}>
                {GABON_MARITIME_ROUTES.map((r) => {
                  const on = routeId === r.id;
                  return (
                    <Pressable
                      key={r.id}
                      onPress={() => setRouteId(r.id)}
                      style={[styles.route, on && styles.routeOn]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                    >
                      <IconBadge icon="fa6:sailboat" size={32} tone={on ? 'info' : 'muted'} solid={on} />
                      <View style={styles.boatText}>
                        <Text style={[styles.routeTitle, on && styles.routeTitleOn]} numberOfLines={1}>
                          {r.label}
                        </Text>
                        <Text style={styles.routeSub} numberOfLines={1}>
                          {r.subtitle}
                        </Text>
                      </View>
                      {on ? <Ionicons name="checkmark-circle" size={20} color={colors.tide} /> : null}
                    </Pressable>
                  );
                })}
                <GlowButton
                  label="Afficher ce parcours"
                  icon="boat-outline"
                  onPress={() => void onSimulateTrip()}
                  variant="accent"
                  disabled={!boatId || busy}
                />
                {canTrack ? (
                  <Pressable
                    onPress={() => setFastDemo((v) => !v)}
                    style={styles.toggleInline}
                    disabled={tracking.actif}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: fastDemo, disabled: tracking.actif }}
                  >
                    <Ionicons
                      name={fastDemo ? 'flask-outline' : 'timer-outline'}
                      size={20}
                      color={colors.tide}
                    />
                    <Text style={styles.toggleInlineText}>
                      {fastDemo
                        ? `Relevé rapide de démonstration : ${DEMO_INTERVAL_SEC} s`
                        : `Relevé de terrain : ${intervalLabel(Math.max(intervalMin, 1) * 60_000)}`}
                    </Text>
                    <Ionicons name="swap-horizontal" size={20} color={colors.inkSoft} />
                  </Pressable>
                ) : null}
              </GlassPanel>
            ) : null}
          </>
        ) : null}

        {shown.length > 0 ? (
          <>
            <SectionTitle icon="time-outline" text="Derniers relevés" />
            <GlassPanel contentStyle={styles.historyInner}>
              {visible.map((item, index) => {
                const n = shown.length - index;
                const waiting = item.synchronise_a === null;
                return (
                  <View
                    key={item.id}
                    style={[styles.pointRow, index === visible.length - 1 && styles.pointRowLast]}
                  >
                    <View style={[styles.pointDot, index === 0 && styles.pointDotLast]} />
                    <Text style={styles.pointIndex}>N° {n}</Text>
                    <Text style={styles.pointDate}>{formatDate(item.horodatage)}</Text>
                    {waiting ? (
                      <Ionicons
                        name="phone-portrait-outline"
                        size={16}
                        color={colors.warn}
                        accessibilityLabel="Sur le téléphone, pas encore envoyé"
                      />
                    ) : null}
                    <Text style={styles.pointTime}>{formatHeure(item.horodatage)}</Text>
                  </View>
                );
              })}
              {recent.length > 5 ? (
                <Pressable
                  onPress={() => setShowAllPoints((v) => !v)}
                  style={styles.moreBtn}
                  accessibilityRole="button"
                >
                  <Text style={styles.moreText}>
                    {showAllPoints ? 'Réduire la liste' : `Voir les ${recent.length} relevés`}
                  </Text>
                  <Ionicons name={showAllPoints ? 'chevron-up' : 'chevron-down'} size={18} color={colors.tide} />
                </Pressable>
              ) : null}
            </GlassPanel>
          </>
        ) : null}
      </ScrollView>

      {canTrack && selected ? (
        <SortieSheet
          visible={showSortie}
          onClose={() => setShowSortie(false)}
          boatName={selected.nom}
          suiviActif={tracking.actif}
          relever={releverDepart}
          releverDOffice={access === 'accordee'}
          onConfirm={confirmerDepart}
        />
      ) : null}

      <InfoSheet
        visible={pendingAction !== null}
        onClose={() => setPendingAction(null)}
        title={pendingAction === 'suivi' ? 'Avant de démarrer le suivi' : 'Avant d’envoyer la position'}
        icon="navigate-outline"
        points={sheetPoints}
        actions={
          <>
            <GlowButton
              label={pendingAction === 'suivi' ? 'Démarrer le suivi' : 'Envoyer ma position'}
              icon={pendingAction === 'suivi' ? 'navigate-outline' : 'locate-outline'}
              onPress={() => void confirmSheet()}
            />
            <GlowButton
              label="Pas maintenant"
              icon="close-outline"
              variant="ghost"
              onPress={() => setPendingAction(null)}
            />
          </>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: space.lg, paddingBottom: 56, paddingTop: 4 },
  topNotice: { marginTop: 0, marginBottom: 12 },
  boatScroll: { marginBottom: 12 },
  boatRow: { gap: 8, paddingRight: space.lg },
  panel: { marginBottom: space.md },
  panelInner: { padding: 14, gap: 12 },
  boatHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  boatText: { flex: 1, minWidth: 0 },
  boatName: { fontFamily: fonts.bodyBold, color: colors.ink, fontSize: 17 },
  boatMeta: { fontFamily: fonts.body, color: colors.inkMuted, fontSize: 14, marginTop: 1 },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(4, 120, 87, 0.12)',
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  liveText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.success },
  actions: { gap: 8 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    marginBottom: space.sm,
  },
  toggleText: { flex: 1, fontFamily: fonts.bodyMedium, color: colors.ink, fontSize: 16 },
  route: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    minHeight: 56,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.glassBorder,
    backgroundColor: colors.card,
  },
  routeOn: { borderColor: colors.tide, backgroundColor: 'rgba(37, 99, 168, 0.08)' },
  routeTitle: { fontFamily: fonts.bodyBold, color: colors.ink, fontSize: 16 },
  routeTitleOn: { color: colors.tide },
  routeSub: { fontFamily: fonts.body, color: colors.inkMuted, fontSize: 13, marginTop: 2 },
  toggleInline: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  toggleInlineText: { flex: 1, fontFamily: fonts.bodyMedium, color: colors.tide, fontSize: 15 },
  historyInner: { paddingVertical: 6, paddingHorizontal: 14 },
  pointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.glassBorder,
  },
  pointRowLast: { borderBottomWidth: 0 },
  pointDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.glassBorder },
  pointDotLast: { backgroundColor: colors.tide },
  pointIndex: { width: 56, fontFamily: fonts.bodyBold, color: colors.ink, fontSize: 14 },
  pointDate: { flex: 1, fontFamily: fonts.body, color: colors.inkMuted, fontSize: 14 },
  pointTime: { fontFamily: fonts.bodyMedium, color: colors.ink, fontSize: 14 },
  moreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 48,
  },
  moreText: { fontFamily: fonts.bodyMedium, color: colors.tide, fontSize: 15 },
});

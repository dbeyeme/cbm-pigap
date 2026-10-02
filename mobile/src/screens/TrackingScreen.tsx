import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  Embarcation,
  clearTrajectory,
  getGeolocConfig,
  getTrajectory,
  listTrackedEmbarcations,
  PositionPoint,
  postPositionsBatch,
} from '../api';
import { GlassPanel } from '../components/GlassPanel';
import { GlowButton } from '../components/GlowButton';
import { TrajectoryNativeMap } from '../components/TrajectoryNativeMap';
import {
  Chip,
  IconBadge,
  Notice,
  ScreenHeader,
  SectionTitle,
  StatRow,
  StatTile,
} from '../components/ui';
import {
  GABON_MARITIME_ROUTES,
  MaritimeRouteId,
  isOnWater,
} from '../geo/gabonMaritimeRoutes';
import { friendlyApiError } from '../lib/apiErrors';
import { countPendingPositions, enqueuePosition } from '../offline/db';
import { syncPendingPositions } from '../offline/syncPositions';
import type { MobileMode } from '../auth/roles';
import { colors, fonts, radii, space } from '../theme';

type Props = {
  token: string;
  mode?: MobileMode;
  onBack: () => void;
};

const DEMO_INTERVAL_SEC = 30;

export function TrackingScreen({ token, mode = 'agent', onBack }: Props) {
  const [boats, setBoats] = useState<Embarcation[]>([]);
  const [boatId, setBoatId] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const [intervalMin, setIntervalMin] = useState(5);
  const [useDemoInterval, setUseDemoInterval] = useState(true);
  const [routeId, setRouteId] = useState<MaritimeRouteId>('sortie_cote_mer');
  const [last, setLast] = useState<string | null>(null);
  const [points, setPoints] = useState<PositionPoint[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDemoHelp, setShowDemoHelp] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [offlineNote, setOfflineNote] = useState<string | null>(null);
  const [showAllPoints, setShowAllPoints] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const boatIdRef = useRef<string | null>(null);

  const refreshPending = useCallback(async () => {
    try {
      setPendingCount(await countPendingPositions());
    } catch {
      // SQLite indisponible : l'indicateur reste à zéro
    }
  }, []);

  /** Pousse la file locale ; conserve les positions si le réseau manque. */
  const flushQueue = useCallback(async (): Promise<boolean> => {
    const report = await syncPendingPositions(token);
    await refreshPending();
    if (report.error) {
      setOfflineNote(
        `${report.error}. ${report.remaining} position${report.remaining > 1 ? 's' : ''} en attente, envoi automatique au prochain relevé.`,
      );
      return false;
    }
    setOfflineNote(
      report.rejected > 0
        ? `${report.rejected} position${report.rejected > 1 ? 's' : ''} refusée${report.rejected > 1 ? 's' : ''} par le serveur (hors eau).`
        : null,
    );
    return report.accepted > 0 || report.pushed === 0;
  }, [token, refreshPending]);

  const refreshBoats = useCallback(async () => {
    const emb = await listTrackedEmbarcations(token);
    setBoats(emb);
    return emb;
  }, [token]);

  const loadTrajectory = useCallback(
    async (id: string) => {
      const traj = await getTrajectory(token, id);
      setPoints(traj);
      return traj;
    },
    [token],
  );

  const selectBoat = useCallback(
    async (id: string) => {
      setBoatId(id);
      boatIdRef.current = id;
      setError(null);
      try {
        await loadTrajectory(id);
      } catch (err) {
        setPoints([]);
        setError(friendlyApiError(err));
      }
    },
    [loadTrajectory],
  );

  useEffect(() => {
    (async () => {
      await refreshPending();
      try {
        // Positions restées en attente lors d'une session précédente
        await flushQueue();
      } catch {
        // ignoré : nouvelle tentative au prochain relevé
      }
      try {
        const [cfg, emb] = await Promise.all([getGeolocConfig(token), refreshBoats()]);
        setIntervalMin(cfg.gps_interval_minutes);
        if (emb[0]) await selectBoat(emb[0].id);
      } catch (err) {
        setError(friendlyApiError(err));
      }
    })();
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [token, refreshBoats, selectBoat, refreshPending, flushQueue]);

  async function ensurePermission() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Autorisez la localisation dans les réglages du téléphone');
    }
  }

  async function sendOnce(targetBoat: string) {
    await ensurePermission();
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const lon = loc.coords.longitude;
    const lat = loc.coords.latitude;
    if (!isOnWater(lon, lat)) {
      throw new Error(
        'Position hors mer / fleuve gabonais. Sur simulateur, utilisez « Afficher un parcours d’exemple ».',
      );
    }
    // Écriture locale d'abord (§10 : faible couverture réseau), puis envoi
    await enqueuePosition({
      embarcation_id: targetBoat,
      lon,
      lat,
      horodatage: new Date(loc.timestamp).toISOString(),
    });
    const sent = await flushQueue();
    if (!sent) return;
    setLast(new Date().toLocaleTimeString('fr-FR'));
    await loadTrajectory(targetBoat);
    await refreshBoats();
  }

  async function onSendNow() {
    if (!boatId) return;
    setBusy(true);
    setError(null);
    try {
      await sendOnce(boatId);
    } catch (err) {
      setError(friendlyApiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onSimulateTrip() {
    if (!boatId) return;
    setBusy(true);
    setError(null);
    try {
      const route = GABON_MARITIME_ROUTES.find((r) => r.id === routeId)!;
      // Purge historique : agents / autorités seulement (API TrajectoryAdmin).
      // Un pecheur envoie simplement le parcours d'exemple sans supprimer l'historique.
      if (mode === 'agent') {
        try {
          await clearTrajectory(token, boatId);
        } catch (err) {
          // Ne bloque pas la demo si la purge echoue
          console.warn('clearTrajectory', err);
        }
      }
      const now = Date.now();
      const batch = route.path.map((coordinates, i) => {
        const t = new Date(now - (route.path.length - 1 - i) * 12 * 60_000);
        return {
          embarcation_id: boatId,
          position: {
            type: 'Point' as const,
            coordinates,
          },
          horodatage: t.toISOString(),
          source: 'mobile' as const,
        };
      });
      await postPositionsBatch(token, batch);
      setLast(new Date().toLocaleTimeString('fr-FR'));
      await loadTrajectory(boatId);
      await refreshBoats();
    } catch (err) {
      setError(friendlyApiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleTracking() {
    if (!boatId) return;
    setError(null);
    if (active) {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      setActive(false);
      return;
    }
    try {
      setBusy(true);
      await sendOnce(boatId);
      const ms = useDemoInterval
        ? DEMO_INTERVAL_SEC * 1000
        : Math.max(intervalMin, 1) * 60 * 1000;
      timer.current = setInterval(() => {
        const id = boatIdRef.current;
        if (id) void sendOnce(id);
      }, ms);
      setActive(true);
    } catch (err) {
      setError(friendlyApiError(err));
    } finally {
      setBusy(false);
    }
  }

  const selected = boats.find((b) => b.id === boatId);
  const recent = [...points].reverse();
  const visible = showAllPoints ? recent : recent.slice(0, 5);
  const lastPoint = points[points.length - 1];

  return (
    <View style={styles.root}>
      <ScreenHeader
        kicker="Localisation"
        title="Suivi GPS"
        onBack={onBack}
        right={
          <IconBadge
            icon={active ? 'navigate' : pendingCount > 0 ? 'cloud-offline-outline' : 'navigate-outline'}
            tone={active ? 'ok' : pendingCount > 0 ? 'warn' : 'muted'}
            solid={active}
            size={44}
          />
        }
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        {boats.length === 0 ? (
          <Notice
            tone="warn"
            icon="boat-outline"
            text={
              mode === 'pecheur'
                ? 'Aucun bateau lié à votre compte. Contactez un agent.'
                : 'Aucun bateau. Créez d’abord un dossier pêcheur.'
            }
          />
        ) : boats.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.boatRow}
            style={{ marginBottom: 12 }}
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

        <GlassPanel style={styles.panel} contentStyle={styles.panelInner}>
          {selected ? (
            <View style={styles.boatHead}>
              <IconBadge icon="boat-outline" size={36} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.boatName} numberOfLines={1}>
                  {selected.nom}
                </Text>
                <Text style={styles.boatMeta} numberOfLines={1}>
                  {[selected.immatriculation, selected.type].filter(Boolean).join(' · ')}
                </Text>
              </View>
              {active ? (
                <View style={styles.livePill}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>Suivi actif</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <TrajectoryNativeMap points={points} />

          <StatRow>
            <StatTile icon="mci:map-marker-path" value={points.length} label="points" />
            <StatTile
              icon="time-outline"
              value={last ?? (lastPoint ? new Date(lastPoint.horodatage).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—')}
              label={last ? 'dernier envoi' : 'dernier relevé'}
              tone={last ? 'ok' : 'muted'}
            />
            <StatTile
              icon={pendingCount > 0 ? 'cloud-offline-outline' : 'cloud-done-outline'}
              value={pendingCount}
              label="en attente"
              tone={pendingCount > 0 ? 'warn' : 'muted'}
            />
          </StatRow>

          <View style={styles.actions}>
            <GlowButton
              label={busy ? 'Envoi…' : 'Envoyer ma position'}
              icon="locate-outline"
              onPress={onSendNow}
              disabled={!boatId || busy}
            />
            <GlowButton
              label={
                active
                  ? 'Arrêter le suivi'
                  : useDemoInterval
                    ? `Suivi auto · ${DEMO_INTERVAL_SEC} s`
                    : `Suivi auto · ${intervalMin} min`
              }
              icon={active ? 'stop-circle-outline' : 'navigate-outline'}
              onPress={toggleTracking}
              variant="ghost"
              disabled={!boatId || busy}
            />
          </View>

          {pendingCount > 0 ? (
            <Notice
              tone="warn"
              icon="cloud-offline-outline"
              text={`${pendingCount} position${pendingCount > 1 ? 's' : ''} sur le téléphone, envoi au retour du réseau.`}
            />
          ) : offlineNote ? (
            <Notice tone="warn" text={offlineNote} />
          ) : null}
          {error ? <Notice tone="error" text={error} /> : null}
        </GlassPanel>

        <Pressable
          onPress={() => setShowDemoHelp((v) => !v)}
          style={styles.toggleRow}
          accessibilityRole="button"
          accessibilityState={{ expanded: showDemoHelp }}
        >
          <IconBadge icon="flask-outline" size={32} tone="muted" />
          <Text style={styles.toggleText}>Parcours d’exemple (démo)</Text>
          <Ionicons name={showDemoHelp ? 'chevron-up' : 'chevron-down'} size={20} color={colors.inkSoft} />
        </Pressable>

        {showDemoHelp ? (
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
                  <View style={{ flex: 1, minWidth: 0 }}>
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
              onPress={onSimulateTrip}
              variant="accent"
              disabled={!boatId || busy}
            />
            <Pressable
              onPress={() => setUseDemoInterval((v) => !v)}
              style={styles.toggleInline}
              disabled={active}
              accessibilityRole="switch"
              accessibilityState={{ checked: useDemoInterval }}
            >
              <Ionicons
                name={useDemoInterval ? 'flask-outline' : 'timer-outline'}
                size={18}
                color={colors.tide}
              />
              <Text style={styles.toggleInlineText}>
                {useDemoInterval
                  ? `Envoi rapide démo : ${DEMO_INTERVAL_SEC} s`
                  : `Envoi terrain : ${intervalMin} min`}
              </Text>
              <Ionicons name="swap-horizontal" size={18} color={colors.inkSoft} />
            </Pressable>
          </GlassPanel>
        ) : null}

        {points.length > 0 ? (
          <>
            <SectionTitle icon="time-outline" text="Derniers relevés" />
            <GlassPanel contentStyle={styles.historyInner}>
              {visible.map((item, index) => {
                const n = points.length - index;
                const d = new Date(item.horodatage);
                return (
                  <View key={item.id} style={[styles.pointRow, index === visible.length - 1 && styles.pointRowLast]}>
                    <View style={[styles.pointDot, index === 0 && styles.pointDotLast]} />
                    <Text style={styles.pointIndex}>#{n}</Text>
                    <Text style={styles.pointDate}>{d.toLocaleDateString('fr-FR')}</Text>
                    <Text style={styles.pointTime}>
                      {d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
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
                    {showAllPoints ? 'Réduire' : `Voir les ${recent.length} relevés`}
                  </Text>
                  <Ionicons name={showAllPoints ? 'chevron-up' : 'chevron-down'} size={16} color={colors.tide} />
                </Pressable>
              ) : null}
            </GlassPanel>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: space.lg, paddingBottom: 56, paddingTop: 4 },
  boatRow: { gap: 8, paddingRight: space.lg },
  panel: { marginBottom: space.md },
  panelInner: { padding: 14, gap: 12 },
  boatHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  boatName: { fontFamily: fonts.bodyBold, color: colors.ink, fontSize: 16 },
  boatMeta: { fontFamily: fonts.body, color: colors.inkMuted, fontSize: 13, marginTop: 1 },
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
  liveText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.success },
  actions: { gap: 8 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    marginBottom: space.sm,
  },
  toggleText: { flex: 1, fontFamily: fonts.bodyMedium, color: colors.ink, fontSize: 15 },
  route: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.glassBorder,
    backgroundColor: colors.card,
  },
  routeOn: { borderColor: colors.tide, backgroundColor: 'rgba(37, 99, 168, 0.08)' },
  routeTitle: { fontFamily: fonts.bodyBold, color: colors.ink, fontSize: 15 },
  routeTitleOn: { color: colors.tide },
  routeSub: { fontFamily: fonts.body, color: colors.inkMuted, fontSize: 12, marginTop: 2 },
  toggleInline: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  toggleInlineText: { flex: 1, fontFamily: fonts.bodyMedium, color: colors.tide, fontSize: 13 },
  historyInner: { paddingVertical: 6, paddingHorizontal: 14 },
  pointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.glassBorder,
  },
  pointRowLast: { borderBottomWidth: 0 },
  pointDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.glassBorder },
  pointDotLast: { backgroundColor: colors.tide },
  pointIndex: { width: 40, fontFamily: fonts.bodyBold, color: colors.ink, fontSize: 13 },
  pointDate: { flex: 1, fontFamily: fonts.body, color: colors.inkMuted, fontSize: 13 },
  pointTime: { fontFamily: fonts.bodyMedium, color: colors.ink, fontSize: 13 },
  moreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10 },
  moreText: { fontFamily: fonts.bodyMedium, color: colors.tide, fontSize: 14 },
});

import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  Embarcation,
  clearTrajectory,
  getGeolocConfig,
  getTrajectory,
  listTrackedEmbarcations,
  PositionPoint,
  postPosition,
  postPositionsBatch,
} from '../api';
import { GlassPanel } from '../components/GlassPanel';
import { GlowButton } from '../components/GlowButton';
import { TrajectoryNativeMap } from '../components/TrajectoryNativeMap';
import {
  GABON_MARITIME_ROUTES,
  MaritimeRouteId,
  isOnWater,
} from '../geo/gabonMaritimeRoutes';
import { colors, fonts, radii, space } from '../theme';

type Props = {
  token: string;
  onBack: () => void;
};

/** Intervalle démo mobile (secondes) — le serveur reste en minutes §5.2. */
const DEMO_INTERVAL_SEC = 30;

export function TrackingScreen({ token, onBack }: Props) {
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
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const boatIdRef = useRef<string | null>(null);

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
        setError(err instanceof Error ? err.message : 'Trajectoire indisponible');
      }
    },
    [loadTrajectory],
  );

  useEffect(() => {
    (async () => {
      try {
        const [cfg, emb] = await Promise.all([getGeolocConfig(token), refreshBoats()]);
        setIntervalMin(cfg.gps_interval_minutes);
        if (emb[0]) await selectBoat(emb[0].id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Chargement impossible');
      }
    })();
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [token, refreshBoats, selectBoat]);

  async function ensurePermission() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Permission localisation refusée');
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
        'GPS hors zone d’eau gabonaise (ville ou simulateur). ' +
          'Utilise « Remplacer par trajet » (Côte→mer, Ogooué, navire étranger).',
      );
    }
    await postPosition(token, {
      embarcation_id: targetBoat,
      position: {
        type: 'Point',
        coordinates: [lon, lat],
      },
      horodatage: new Date(loc.timestamp).toISOString(),
      source: 'mobile',
    });
    setLast(new Date().toLocaleTimeString());
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
      setError(err instanceof Error ? err.message : 'Envoi GPS impossible');
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
      // Remplace l'historique anomal (terre / SF) par un corridor en eau
      await clearTrajectory(token, boatId);
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
      setLast(new Date().toLocaleTimeString());
      await loadTrajectory(boatId);
      await refreshBoats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Simulation impossible');
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
      setError(err instanceof Error ? err.message : 'Envoi GPS impossible');
    } finally {
      setBusy(false);
    }
  }

  const selected = boats.find((b) => b.id === boatId);

  return (
    <View style={styles.container}>
      <FlatList
        data={[...points].reverse()}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View>
            <Pressable onPress={onBack} style={styles.backRow}>
              <Ionicons name="chevron-back" size={22} color={colors.foam} />
              <Text style={styles.backText}>Retour</Text>
            </Pressable>
            <Text style={styles.title}>Suivi GPS</Text>
            <Text style={styles.lead}>
              1) Choisis la pirogue · 2) Envoie une position · 3) Vois la trajectoire.
            </Text>

            <Text style={styles.label}>Quelle pirogue suivre ?</Text>
            {boats.length === 0 ? (
              <Text style={styles.empty}>
                Aucune embarcation — crée d’abord un dossier pêcheur.
              </Text>
            ) : (
              boats.map((b) => {
                const activeBoat = boatId === b.id;
                const count = b.positions_count ?? 0;
                return (
                  <Pressable
                    key={b.id}
                    onPress={() => void selectBoat(b.id)}
                    style={[styles.boat, activeBoat && styles.boatActive]}
                  >
                    <Ionicons
                      name="boat-outline"
                      size={18}
                      color={activeBoat ? colors.abyss : colors.foam}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[styles.boatText, activeBoat && styles.boatTextActive]}
                      >
                        {b.nom}
                        {b.type ? ` · ${b.type}` : ''}
                      </Text>
                      <Text
                        style={[styles.boatMeta, activeBoat && styles.boatMetaActive]}
                      >
                        {b.immatriculation} · {count} point{count === 1 ? '' : 's'} GPS
                      </Text>
                    </View>
                    {activeBoat ? (
                      <Ionicons name="checkmark-circle" size={20} color={colors.abyss} />
                    ) : null}
                  </Pressable>
                );
              })
            )}

            <GlassPanel style={styles.panel}>
              <Text style={styles.panelTitle}>
                {selected ? selected.nom : 'Aucune pirogue'}
              </Text>
              <TrajectoryNativeMap points={points} />
              <Text style={styles.routeLabel}>Scénario de trajectoire</Text>
              {GABON_MARITIME_ROUTES.map((r) => {
                const on = routeId === r.id;
                return (
                  <Pressable
                    key={r.id}
                    onPress={() => setRouteId(r.id)}
                    style={[styles.routeChip, on && styles.routeChipOn]}
                  >
                    <Text style={[styles.routeChipTitle, on && styles.routeChipTitleOn]}>
                      {r.label}
                    </Text>
                    <Text style={[styles.routeChipSub, on && styles.routeChipSubOn]}>
                      {r.subtitle}
                    </Text>
                  </Pressable>
                );
              })}
              <GlowButton
                label={busy ? 'Envoi…' : 'Envoyer ma position réelle'}
                icon="locate-outline"
                onPress={onSendNow}
                variant="ghost"
                disabled={!boatId || busy}
              />
              <GlowButton
                label="Appliquer ce scénario (10 pts)"
                icon="boat-outline"
                onPress={onSimulateTrip}
                variant="accent"
                disabled={!boatId || busy}
                style={{ marginTop: 10 }}
              />
              <GlowButton
                label={
                  active
                    ? 'Arrêter le suivi auto'
                    : useDemoInterval
                      ? `Suivi auto (${DEMO_INTERVAL_SEC}s démo)`
                      : `Suivi auto (${intervalMin} min)`
                }
                icon={active ? 'stop-circle-outline' : 'navigate-outline'}
                onPress={toggleTracking}
                variant="ghost"
                disabled={!boatId || busy}
                style={{ marginTop: 10 }}
              />
              <Pressable
                onPress={() => setUseDemoInterval((v) => !v)}
                style={styles.demoToggle}
                disabled={active}
              >
                <Ionicons
                  name={useDemoInterval ? 'flask' : 'timer-outline'}
                  size={16}
                  color={colors.foam}
                />
                <Text style={styles.demoText}>
                  {useDemoInterval
                    ? `Mode démo : envoi toutes les ${DEMO_INTERVAL_SEC}s`
                    : `Mode terrain : envoi toutes les ${intervalMin} min`}
                </Text>
              </Pressable>
              {last ? <Text style={styles.meta}>Dernier envoi : {last}</Text> : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </GlassPanel>

            <Text style={styles.section}>Historique ({points.length})</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <GlassPanel contentStyle={styles.row} style={{ marginBottom: 8 }}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{points.length - index}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>
                {item.position.coordinates[1].toFixed(5)},{' '}
                {item.position.coordinates[0].toFixed(5)}
              </Text>
              <Text style={styles.rowMeta}>
                {new Date(item.horodatage).toLocaleString()} · {item.source}
              </Text>
            </View>
          </GlassPanel>
        )}
        ListEmptyComponent={
          points.length === 0 ? (
            <Text style={styles.emptyList}>
              Aucun point — choisis un scénario (Côte→mer, Ogooué, navire étranger)
              puis « Appliquer ce scénario ».
            </Text>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: 40 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: space.lg,
    paddingTop: space.xxl,
  },
  backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: space.md },
  backText: { fontFamily: fonts.bodyMedium, color: colors.foam, marginLeft: 2 },
  title: { fontFamily: fonts.display, fontSize: 32, color: colors.ink },
  lead: {
    fontFamily: fonts.body,
    color: colors.inkMuted,
    marginBottom: space.md,
    marginTop: 4,
    lineHeight: 22,
  },
  label: {
    fontFamily: fonts.bodyBold,
    color: colors.ink,
    marginBottom: 8,
  },
  boat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  boatActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  boatText: { fontFamily: fonts.bodyBold, color: colors.ink, fontSize: 15 },
  boatTextActive: { color: colors.abyss },
  boatMeta: { fontFamily: fonts.body, color: colors.inkMuted, fontSize: 12, marginTop: 2 },
  boatMetaActive: { color: 'rgba(2,26,34,0.7)' },
  panel: { marginTop: space.sm, marginBottom: space.md },
  panelTitle: {
    fontFamily: fonts.bodyBold,
    color: colors.ink,
    marginBottom: 10,
    fontSize: 16,
  },
  routeLabel: {
    fontFamily: fonts.bodyMedium,
    color: colors.foam,
    fontSize: 12,
    marginBottom: 8,
  },
  routeChip: {
    padding: 10,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    marginBottom: 8,
  },
  routeChipOn: {
    backgroundColor: 'rgba(127, 224, 211, 0.18)',
    borderColor: colors.foam,
  },
  routeChipTitle: {
    fontFamily: fonts.bodyBold,
    color: colors.ink,
    fontSize: 14,
  },
  routeChipTitleOn: { color: colors.foam },
  routeChipSub: {
    fontFamily: fonts.body,
    color: colors.inkMuted,
    fontSize: 11,
    marginTop: 2,
  },
  routeChipSubOn: { color: 'rgba(232, 244, 242, 0.85)' },
  demoToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  demoText: { fontFamily: fonts.body, color: colors.foam, fontSize: 12, flex: 1 },
  meta: { marginTop: 12, color: colors.foam, fontFamily: fonts.body },
  error: { marginTop: 8, color: colors.danger, fontFamily: fonts.body },
  section: {
    fontFamily: fonts.bodyBold,
    color: colors.ink,
    marginBottom: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.tide,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 12 },
  rowTitle: { fontFamily: fonts.bodyBold, color: colors.ink },
  rowMeta: { fontFamily: fonts.body, color: colors.inkMuted, marginTop: 2, fontSize: 12 },
  empty: { color: colors.inkMuted, fontFamily: fonts.body, marginBottom: 12 },
  emptyList: { color: colors.inkMuted, fontFamily: fonts.body, marginTop: 4 },
});

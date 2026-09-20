import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

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
import { friendlyApiError } from '../lib/apiErrors';
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
        setError(friendlyApiError(err));
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
        setError(friendlyApiError(err));
      }
    })();
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [token, refreshBoats, selectBoat]);

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
    await postPosition(token, {
      embarcation_id: targetBoat,
      position: {
        type: 'Point',
        coordinates: [lon, lat],
      },
      horodatage: new Date(loc.timestamp).toISOString(),
      source: 'mobile',
    });
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

  return (
    <View style={styles.container}>
      <FlatList
        data={[...points].reverse()}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View>
            <Pressable
              onPress={onBack}
              style={styles.backRow}
              accessibilityRole="button"
              accessibilityLabel="Retour"
            >
              <Ionicons name="chevron-back" size={24} color={colors.tide} />
              <Text style={styles.backText}>Retour</Text>
            </Pressable>
            <Text style={styles.kicker}>Localisation</Text>
            <Text style={styles.title}>Suivi GPS</Text>
            <Text style={styles.lead}>
              Choisissez le bateau, regardez la carte, puis envoyez la position.
            </Text>

            <Text style={styles.label}>1. Quel bateau suivre ?</Text>
            {boats.length === 0 ? (
              <Text style={styles.empty}>
                Aucun bateau — créez d’abord un dossier pêcheur.
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
                    accessibilityRole="button"
                    accessibilityState={{ selected: activeBoat }}
                  >
                    <View style={[styles.boatIcon, activeBoat && styles.boatIconOn]}>
                      <Ionicons
                        name="boat-outline"
                        size={20}
                        color={activeBoat ? '#F8FAFC' : colors.tide}
                      />
                    </View>
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
                        {b.immatriculation} · {count} point{count === 1 ? '' : 's'} sur la carte
                      </Text>
                    </View>
                    {activeBoat ? (
                      <Ionicons name="checkmark-circle" size={22} color="#F8FAFC" />
                    ) : null}
                  </Pressable>
                );
              })
            )}

            <GlassPanel style={styles.panel}>
              <Text style={styles.panelTitle}>
                {selected ? `Carte — ${selected.nom}` : 'Carte'}
              </Text>
              <Text style={styles.mapHint}>
                La ligne bleue montre le parcours. Le navire indique la dernière
                position.
              </Text>
              <TrajectoryNativeMap points={points} />

              <GlowButton
                label={busy ? 'Envoi…' : 'Envoyer ma position'}
                icon="locate-outline"
                onPress={onSendNow}
                disabled={!boatId || busy}
              />
              <GlowButton
                label={
                  active
                    ? 'Arrêter le suivi automatique'
                    : useDemoInterval
                      ? `Suivi auto (toutes les ${DEMO_INTERVAL_SEC} s)`
                      : `Suivi auto (toutes les ${intervalMin} min)`
                }
                icon={active ? 'stop-circle-outline' : 'navigate-outline'}
                onPress={toggleTracking}
                variant="ghost"
                disabled={!boatId || busy}
                style={{ marginTop: 10 }}
              />

              {last ? (
                <Text style={styles.meta}>Dernier envoi : {last}</Text>
              ) : null}
              {error ? (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={18} color={colors.danger} />
                  <Text style={styles.error}>{error}</Text>
                </View>
              ) : null}
            </GlassPanel>

            <Pressable
              onPress={() => setShowDemoHelp((v) => !v)}
              style={styles.helpToggle}
              accessibilityRole="button"
            >
              <Ionicons
                name={showDemoHelp ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.tide}
              />
              <Text style={styles.helpToggleText}>
                {showDemoHelp ? 'Masquer les exemples' : 'Parcours d’exemple (démo)'}
              </Text>
            </Pressable>

            {showDemoHelp ? (
              <GlassPanel style={styles.demoPanel}>
                <Text style={styles.demoLead}>
                  {mode === 'pecheur'
                    ? 'Utile sur simulateur — remplace le parcours actuel par un trajet en eau gabonaise.'
                    : 'Utile sur simulateur ou pour former un agent — remplace le parcours actuel par un trajet en eau gabonaise.'}
                </Text>
                {GABON_MARITIME_ROUTES.map((r) => {
                  const on = routeId === r.id;
                  return (
                    <Pressable
                      key={r.id}
                      onPress={() => setRouteId(r.id)}
                      style={[styles.routeChip, on && styles.routeChipOn]}
                    >
                      <Text
                        style={[styles.routeChipTitle, on && styles.routeChipTitleOn]}
                      >
                        {r.label}
                      </Text>
                      <Text style={[styles.routeChipSub, on && styles.routeChipSubOn]}>
                        {r.subtitle}
                      </Text>
                    </Pressable>
                  );
                })}
                <GlowButton
                  label="Afficher ce parcours d’exemple"
                  icon="boat-outline"
                  onPress={onSimulateTrip}
                  variant="accent"
                  disabled={!boatId || busy}
                />
                <Pressable
                  onPress={() => setUseDemoInterval((v) => !v)}
                  style={styles.demoToggle}
                  disabled={active}
                >
                  <Ionicons
                    name={useDemoInterval ? 'flask-outline' : 'timer-outline'}
                    size={18}
                    color={colors.tide}
                  />
                  <Text style={styles.demoText}>
                    {useDemoInterval
                      ? `Envoi rapide (démo) : toutes les ${DEMO_INTERVAL_SEC} s`
                      : `Envoi terrain : toutes les ${intervalMin} min`}
                  </Text>
                </Pressable>
              </GlassPanel>
            ) : null}

            <Text style={styles.section}>
              Historique ({points.length} point{points.length === 1 ? '' : 's'})
            </Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <GlassPanel contentStyle={styles.row} style={{ marginBottom: 8 }}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{points.length - index}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>
                Point {points.length - index}
              </Text>
              <Text style={styles.rowMeta}>
                {new Date(item.horodatage).toLocaleString('fr-FR')}
              </Text>
            </View>
          </GlassPanel>
        )}
        ListEmptyComponent={
          points.length === 0 ? (
            <Text style={styles.emptyList}>
              Aucun point sur la carte. Envoyez une position, ou ouvrez « Parcours
              d’exemple ».
            </Text>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: 48 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: space.lg,
    paddingTop: space.xl,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.md,
    alignSelf: 'flex-start',
    minHeight: 44,
  },
  backText: {
    fontFamily: fonts.bodyMedium,
    color: colors.tide,
    marginLeft: 2,
    fontSize: 16,
  },
  kicker: {
    fontFamily: fonts.bodyMedium,
    color: colors.tide,
    fontSize: 14,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: colors.abyss,
  },
  lead: {
    fontFamily: fonts.body,
    color: colors.inkMuted,
    marginBottom: space.md,
    marginTop: 6,
    lineHeight: 24,
    fontSize: 16,
  },
  label: {
    fontFamily: fonts.bodyBold,
    color: colors.abyss,
    marginBottom: 10,
    fontSize: 15,
  },
  boat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    minHeight: 72,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.glassBorder,
    marginBottom: 10,
    backgroundColor: colors.card,
  },
  boatActive: {
    backgroundColor: colors.tide,
    borderColor: colors.tide,
  },
  boatIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(37, 99, 168, 0.1)',
  },
  boatIconOn: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  boatText: { fontFamily: fonts.bodyBold, color: colors.ink, fontSize: 16 },
  boatTextActive: { color: '#F8FAFC' },
  boatMeta: {
    fontFamily: fonts.body,
    color: colors.inkMuted,
    fontSize: 13,
    marginTop: 3,
  },
  boatMetaActive: { color: 'rgba(248,250,252,0.85)' },
  panel: { marginTop: space.sm, marginBottom: space.md },
  panelTitle: {
    fontFamily: fonts.bodyBold,
    color: colors.abyss,
    marginBottom: 6,
    fontSize: 17,
  },
  mapHint: {
    fontFamily: fonts.body,
    color: colors.inkMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  helpToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: space.sm,
    paddingVertical: 8,
  },
  helpToggleText: {
    fontFamily: fonts.bodyMedium,
    color: colors.tide,
    fontSize: 15,
  },
  demoPanel: { marginBottom: space.md },
  demoLead: {
    fontFamily: fonts.body,
    color: colors.inkMuted,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 12,
  },
  routeChip: {
    padding: 14,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.glassBorder,
    marginBottom: 8,
    backgroundColor: colors.card,
  },
  routeChipOn: {
    backgroundColor: 'rgba(37, 99, 168, 0.1)',
    borderColor: colors.foam,
  },
  routeChipTitle: {
    fontFamily: fonts.bodyBold,
    color: colors.ink,
    fontSize: 15,
  },
  routeChipTitleOn: { color: colors.tide },
  routeChipSub: {
    fontFamily: fonts.body,
    color: colors.inkMuted,
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  routeChipSubOn: { color: colors.inkMuted },
  demoToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  demoText: {
    fontFamily: fonts.body,
    color: colors.tide,
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  meta: {
    marginTop: 14,
    color: colors.success,
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
  },
  errorBox: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    padding: 12,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(185, 28, 28, 0.08)',
  },
  error: {
    flex: 1,
    color: colors.danger,
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
  },
  section: {
    fontFamily: fonts.bodyBold,
    color: colors.abyss,
    marginBottom: 10,
    fontSize: 15,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.tide,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#F8FAFC', fontFamily: fonts.bodyBold, fontSize: 13 },
  rowTitle: { fontFamily: fonts.bodyBold, color: colors.ink, fontSize: 15 },
  rowMeta: {
    fontFamily: fonts.body,
    color: colors.inkMuted,
    marginTop: 2,
    fontSize: 13,
  },
  empty: {
    color: colors.inkMuted,
    fontFamily: fonts.body,
    marginBottom: 12,
    fontSize: 15,
    lineHeight: 22,
  },
  emptyList: {
    color: colors.inkMuted,
    fontFamily: fonts.body,
    marginTop: 4,
    fontSize: 15,
    lineHeight: 22,
  },
});

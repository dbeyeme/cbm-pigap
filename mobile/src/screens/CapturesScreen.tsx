import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Embarcation, listTrackedEmbarcations } from '../api';
import { GlassField } from '../components/GlassField';
import { GlassPanel } from '../components/GlassPanel';
import { GlowButton } from '../components/GlowButton';
import { ESPECES_MVP, METHODES_MVP } from '../offline/catalog';
import {
  LocalCapture,
  cacheEmbarcations,
  countByStatus,
  enqueueCapture,
  listCachedEmbarcations,
  listLocalCaptures,
} from '../offline/db';
import { syncPendingCaptures } from '../offline/syncCaptures';
import { colors, fonts, radii, space } from '../theme';

type Props = {
  token: string;
  onBack: () => void;
};

function newClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback MVP (hors crypto) — toujours unique pour la file locale
  return `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function CapturesScreen({ token, onBack }: Props) {
  const [boats, setBoats] = useState<Embarcation[]>([]);
  const [boatId, setBoatId] = useState<string | null>(null);
  const [espece, setEspece] = useState<string>(ESPECES_MVP[0]);
  const [methode, setMethode] = useState<string>(METHODES_MVP[0]);
  const [quantite, setQuantite] = useState('5');
  const [debarquement, setDebarquement] = useState('Owendo');
  const [dateCapture, setDateCapture] = useState(
    () => new Date().toISOString().slice(0, 16),
  );
  const [localRows, setLocalRows] = useState<LocalCapture[]>([]);
  const [counts, setCounts] = useState({ pending: 0, synced: 0 });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [rows, c] = await Promise.all([listLocalCaptures(), countByStatus()]);
    setLocalRows(rows);
    setCounts(c);
  }, []);

  useEffect(() => {
    void (async () => {
      // Offline-first : cache SQLite d'abord (déclaration possible à froid)
      try {
        const cached = await listCachedEmbarcations();
        if (cached.length) {
          setBoats(cached);
          if (!boatId && cached[0]) setBoatId(cached[0].id);
        }
      } catch {
        /* cache vide / première install */
      }
      try {
        const emb = await listTrackedEmbarcations(token);
        setBoats(emb);
        if (emb[0]) setBoatId((prev) => prev ?? emb[0].id);
        await cacheEmbarcations(
          emb.map((b) => ({
            id: b.id,
            pecheur_id: b.pecheur_id,
            nom: b.nom,
            immatriculation: b.immatriculation,
            type: b.type,
          })),
        );
        setError(null);
      } catch (err) {
        const cached = await listCachedEmbarcations();
        if (cached.length) {
          setBoats(cached);
          if (!boatId && cached[0]) setBoatId(cached[0].id);
          setStatus('Hors-ligne — embarcations depuis le cache local');
        } else {
          setError(
            err instanceof Error
              ? err.message
              : 'Embarcations indisponibles — reconnecte-toi une fois pour les mettre en cache',
          );
        }
      }
      await refresh();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount / token
  }, [token, refresh]);

  const selectedBoat = boats.find((b) => b.id === boatId) ?? null;

  async function onSaveLocal() {
    setError(null);
    setStatus(null);
    if (!selectedBoat) {
      setError('Choisis une embarcation');
      return;
    }
    const qty = Number(quantite.replace(',', '.'));
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('Quantité (kg) invalide');
      return;
    }
    if (!debarquement.trim()) {
      setError('Point de débarquement requis');
      return;
    }
    const isoDate = dateCapture.includes('T')
      ? new Date(dateCapture).toISOString()
      : new Date(`${dateCapture}:00`).toISOString();

    setBusy(true);
    try {
      // Offline-first : écriture locale immédiate (même sans réseau)
      await enqueueCapture({
        id: newClientId(),
        pecheur_id: selectedBoat.pecheur_id ?? '',
        embarcation_id: selectedBoat.id,
        espece,
        quantite_kg: qty,
        methode,
        point_debarquement: debarquement.trim(),
        date_capture: isoDate,
      });
      await refresh();
      setStatus('Enregistré localement — en attente de synchronisation');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec enregistrement local');
    } finally {
      setBusy(false);
    }
  }

  async function onSync() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const report = await syncPendingCaptures(token);
      await refresh();
      if (report.error) {
        setError(report.error);
        setStatus('Réseau indisponible — les déclarations restent en attente');
      } else if (report.pushed === 0) {
        setStatus('Rien à synchroniser');
      } else {
        setStatus(
          `Sync OK — ${report.accepted} acceptée(s), ${report.duplicates} déjà connue(s), ${report.rejected} rejetée(s)`,
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <Pressable onPress={onBack} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>M4 · Offline-first</Text>
          <Text style={styles.title}>Captures</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <GlassPanel style={styles.banner}>
          <Text style={styles.bannerTitle}>
            {counts.pending > 0
              ? `${counts.pending} en attente de synchronisation`
              : 'Toutes les déclarations locales sont synchronisées'}
          </Text>
          <Text style={styles.bannerSub}>
            {counts.synced} synchronisée(s) · saisie toujours locale d'abord
          </Text>
        </GlassPanel>

        <Text style={styles.section}>Embarcation</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
          {boats.map((b) => {
            const on = b.id === boatId;
            return (
              <Pressable
                key={b.id}
                onPress={() => setBoatId(b.id)}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{b.nom}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={styles.section}>Espèce</Text>
        <View style={styles.wrapChips}>
          {ESPECES_MVP.map((e) => {
            const on = e === espece;
            return (
              <Pressable
                key={e}
                onPress={() => setEspece(e)}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{e}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.section}>Méthode</Text>
        <View style={styles.wrapChips}>
          {METHODES_MVP.map((m) => {
            const on = m === methode;
            return (
              <Pressable
                key={m}
                onPress={() => setMethode(m)}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{m}</Text>
              </Pressable>
            );
          })}
        </View>

        <GlassField
          label="Quantité (kg)"
          icon="scale-outline"
          value={quantite}
          onChangeText={setQuantite}
          keyboardType="decimal-pad"
        />
        <GlassField
          label="Point de débarquement"
          icon="boat-outline"
          value={debarquement}
          onChangeText={setDebarquement}
        />
        <GlassField
          label="Date (AAAA-MM-JJTHH:mm)"
          icon="calendar-outline"
          value={dateCapture}
          onChangeText={setDateCapture}
          autoCapitalize="none"
        />

        <GlowButton
          label={busy ? '…' : 'Enregistrer hors-ligne'}
          onPress={() => void onSaveLocal()}
          disabled={busy}
        />
        <View style={{ height: space.sm }} />
        <GlowButton
          label={busy ? '…' : 'Synchroniser maintenant'}
          onPress={() => void onSync()}
          disabled={busy}
          variant="ghost"
        />

        {status ? <Text style={styles.statusOk}>{status}</Text> : null}
        {error ? <Text style={styles.statusErr}>{error}</Text> : null}

        <Text style={[styles.section, { marginTop: space.lg }]}>File locale</Text>
        <FlatList
          data={localRows}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          ListEmptyComponent={
            <Text style={styles.empty}>Aucune déclaration locale pour l’instant.</Text>
          }
          renderItem={({ item }) => (
            <GlassPanel style={styles.row} contentStyle={styles.rowInner}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>
                  {item.espece} · {item.quantite_kg} kg
                </Text>
                <Text style={styles.rowMeta}>
                  {item.methode} · {item.point_debarquement}
                </Text>
                <Text style={styles.rowMeta}>
                  {new Date(item.date_capture).toLocaleString()}
                </Text>
              </View>
              <View
                style={[
                  styles.badge,
                  item.sync_status === 'synced' ? styles.badgeOk : styles.badgeWait,
                ]}
              >
                <Text style={styles.badgeText}>
                  {item.sync_status === 'synced' ? 'synchronisé' : 'en attente'}
                </Text>
              </View>
            </GlassPanel>
          )}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingTop: space.xl,
    gap: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  kicker: {
    fontFamily: fonts.bodyMedium,
    color: colors.foam,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 30,
    color: colors.ink,
  },
  scroll: { paddingHorizontal: space.lg, paddingBottom: 48 },
  banner: { marginTop: space.md, marginBottom: space.md },
  bannerTitle: {
    fontFamily: fonts.bodyBold,
    color: colors.ink,
    fontSize: 15,
  },
  bannerSub: {
    fontFamily: fonts.body,
    color: colors.inkMuted,
    marginTop: 4,
  },
  section: {
    fontFamily: fonts.bodyMedium,
    color: colors.inkMuted,
    marginBottom: 8,
    marginTop: 4,
  },
  chips: { marginBottom: space.md },
  wrapChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: space.md,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    marginRight: 8,
  },
  chipOn: {
    backgroundColor: colors.foam,
    borderColor: colors.foam,
  },
  chipText: {
    fontFamily: fonts.bodyMedium,
    color: colors.ink,
    fontSize: 13,
  },
  chipTextOn: { color: colors.abyss },
  statusOk: {
    marginTop: space.md,
    fontFamily: fonts.body,
    color: colors.foam,
  },
  statusErr: {
    marginTop: space.sm,
    fontFamily: fonts.body,
    color: '#FF9B7A',
  },
  empty: {
    fontFamily: fonts.body,
    color: colors.inkMuted,
    marginBottom: space.md,
  },
  row: { marginBottom: space.sm },
  rowInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowTitle: {
    fontFamily: fonts.bodyBold,
    color: colors.ink,
    fontSize: 15,
  },
  rowMeta: {
    fontFamily: fonts.body,
    color: colors.inkMuted,
    fontSize: 12,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  badgeWait: { backgroundColor: 'rgba(240,199,94,0.25)' },
  badgeOk: { backgroundColor: 'rgba(127,224,211,0.25)' },
  badgeText: {
    fontFamily: fonts.bodyMedium,
    color: colors.ink,
    fontSize: 11,
  },
});

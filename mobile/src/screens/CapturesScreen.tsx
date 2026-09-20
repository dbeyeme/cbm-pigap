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
  CachedEmbarcation,
  LocalCapture,
  cacheEmbarcations,
  countByStatus,
  enqueueCapture,
  listCachedEmbarcations,
  listLocalCaptures,
} from '../offline/db';
import { syncPendingCaptures } from '../offline/syncCaptures';
import { friendlyApiError } from '../lib/apiErrors';
import type { MobileMode } from '../auth/roles';
import { colors, fonts, radii, space } from '../theme';

type Props = {
  token: string;
  mode?: MobileMode;
  onBack: () => void;
};

function newClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function asBoats(cached: CachedEmbarcation[]): Embarcation[] {
  return cached.map((b) => ({
    id: b.id,
    pecheur_id: b.pecheur_id,
    nom: b.nom,
    immatriculation: b.immatriculation,
    type: b.type ?? null,
  }));
}

export function CapturesScreen({ token, mode = 'agent', onBack }: Props) {
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
      try {
        const cached = await listCachedEmbarcations();
        if (cached.length) {
          setBoats(asBoats(cached));
          if (!boatId && cached[0]) setBoatId(cached[0].id);
        }
      } catch {
        /* cache vide */
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
          setBoats(asBoats(cached));
          if (!boatId && cached[0]) setBoatId(cached[0].id);
          setStatus('Pas de réseau — bateaux lus depuis le téléphone');
        } else {
          setError(
            friendlyApiError(err) ||
              'Impossible de charger les bateaux. Connectez-vous une fois avec internet.',
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
      setError('Choisissez un bateau ci-dessus');
      return;
    }
    const qty = Number(quantite.replace(',', '.'));
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('Indiquez une quantité en kg (ex. 5 ou 12,5)');
      return;
    }
    if (!debarquement.trim()) {
      setError('Indiquez le lieu de débarquement (ex. Owendo)');
      return;
    }
    const isoDate = dateCapture.includes('T')
      ? new Date(dateCapture).toISOString()
      : new Date(`${dateCapture}:00`).toISOString();

    setBusy(true);
    try {
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
      setStatus('Enregistré sur le téléphone. Vous pourrez l’envoyer plus tard.');
    } catch (err) {
      setError(friendlyApiError(err));
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
        setStatus('Pas de réseau — vos déclarations restent sur le téléphone');
      } else if (report.pushed === 0) {
        setStatus('Rien à envoyer pour le moment');
      } else {
        setStatus(
          `Envoi terminé — ${report.accepted} acceptée(s)${
            report.rejected ? `, ${report.rejected} refusée(s)` : ''
          }`,
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <Pressable
          onPress={onBack}
          style={styles.backBtn}
          hitSlop={14}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <Ionicons name="chevron-back" size={24} color={colors.tide} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Déclaration</Text>
          <Text style={styles.title}>Captures</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <GlassPanel
          style={styles.banner}
          contentStyle={counts.pending > 0 ? styles.bannerWait : styles.bannerOk}
        >
          <View style={styles.bannerRow}>
            <Ionicons
              name={counts.pending > 0 ? 'cloud-upload-outline' : 'checkmark-circle'}
              size={22}
              color={counts.pending > 0 ? colors.warn : colors.success}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerTitle}>
                {counts.pending > 0
                  ? `${counts.pending} déclaration(s) à envoyer`
                  : 'Tout est à jour'}
              </Text>
              <Text style={styles.bannerSub}>
                {counts.synced > 0
                  ? `${counts.synced} déjà envoyée(s) au serveur`
                  : 'Remplissez le formulaire puis appuyez sur Enregistrer'}
              </Text>
            </View>
          </View>
        </GlassPanel>

        <Text style={styles.section}>1. Quel bateau ?</Text>
        {boats.length === 0 ? (
          <Text style={styles.empty}>
            {mode === 'pecheur'
              ? 'Aucun bateau lie a votre compte — contactez un agent.'
              : 'Aucun bateau — creez d’abord un dossier pecheur.'}
          </Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
            {boats.map((b) => {
              const on = b.id === boatId;
              return (
                <Pressable
                  key={b.id}
                  onPress={() => setBoatId(b.id)}
                  style={[styles.chip, on && styles.chipOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{b.nom}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        <Text style={styles.section}>2. Quelle espèce ?</Text>
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

        <Text style={styles.section}>3. Quelle méthode ?</Text>
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

        <Text style={styles.section}>4. Détails</Text>
        <GlassField
          label="Quantité (kilogrammes)"
          icon="scale-outline"
          value={quantite}
          onChangeText={setQuantite}
          keyboardType="decimal-pad"
          placeholder="Ex. 5"
        />
        <GlassField
          label="Lieu de débarquement"
          icon="boat-outline"
          value={debarquement}
          onChangeText={setDebarquement}
          placeholder="Ex. Owendo"
        />
        <GlassField
          label="Date et heure"
          icon="calendar-outline"
          value={dateCapture}
          onChangeText={setDateCapture}
          autoCapitalize="none"
          placeholder="AAAA-MM-JJTHH:mm"
        />

        <GlowButton
          label={busy ? '…' : 'Enregistrer'}
          icon="save-outline"
          onPress={() => void onSaveLocal()}
          disabled={busy}
        />
        <View style={{ height: space.sm }} />
        <GlowButton
          label={busy ? '…' : 'Envoyer au serveur'}
          icon="cloud-upload-outline"
          onPress={() => void onSync()}
          disabled={busy}
          variant="ghost"
        />

        {status ? (
          <View style={styles.msgOk}>
            <Ionicons name="information-circle" size={18} color={colors.success} />
            <Text style={styles.statusOk}>{status}</Text>
          </View>
        ) : null}
        {error ? (
          <View style={styles.msgErr}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
            <Text style={styles.statusErr}>{error}</Text>
          </View>
        ) : null}

        <Text style={[styles.section, { marginTop: space.lg }]}>Mes déclarations</Text>
        <FlatList
          data={localRows}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          ListEmptyComponent={
            <Text style={styles.empty}>Aucune déclaration pour l’instant.</Text>
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
                  {new Date(item.date_capture).toLocaleString('fr-FR')}
                </Text>
              </View>
              <View
                style={[
                  styles.badge,
                  item.sync_status === 'synced' ? styles.badgeOk : styles.badgeWait,
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    item.sync_status === 'synced' ? styles.badgeTextOk : styles.badgeTextWait,
                  ]}
                >
                  {item.sync_status === 'synced' ? 'Envoyé' : 'Sur le téléphone'}
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
    gap: 10,
  },
  backBtn: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glassStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
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
  scroll: { paddingHorizontal: space.lg, paddingBottom: 56 },
  banner: { marginTop: space.md, marginBottom: space.md },
  bannerWait: {},
  bannerOk: {},
  bannerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  bannerTitle: {
    fontFamily: fonts.bodyBold,
    color: colors.ink,
    fontSize: 16,
  },
  bannerSub: {
    fontFamily: fonts.body,
    color: colors.inkMuted,
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
  },
  section: {
    fontFamily: fonts.bodyBold,
    color: colors.abyss,
    fontSize: 15,
    marginBottom: 10,
    marginTop: 8,
  },
  chips: { marginBottom: space.md },
  wrapChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: space.md,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 48,
    borderRadius: radii.md,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.glassBorder,
    marginRight: 8,
    justifyContent: 'center',
  },
  chipOn: {
    backgroundColor: colors.tide,
    borderColor: colors.tide,
  },
  chipText: {
    fontFamily: fonts.bodyMedium,
    color: colors.ink,
    fontSize: 15,
  },
  chipTextOn: { color: '#F8FAFC', fontFamily: fonts.bodyBold },
  msgOk: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: space.md,
    padding: 12,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(4, 120, 87, 0.08)',
  },
  msgErr: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: space.sm,
    padding: 12,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(185, 28, 28, 0.08)',
  },
  statusOk: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    color: colors.success,
    fontSize: 14,
    lineHeight: 20,
  },
  statusErr: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  empty: {
    fontFamily: fonts.body,
    color: colors.inkMuted,
    marginBottom: space.md,
    fontSize: 15,
    lineHeight: 22,
  },
  row: { marginBottom: space.sm },
  rowInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowTitle: {
    fontFamily: fonts.bodyBold,
    color: colors.ink,
    fontSize: 16,
  },
  rowMeta: {
    fontFamily: fonts.body,
    color: colors.inkMuted,
    fontSize: 13,
    marginTop: 3,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    maxWidth: 120,
  },
  badgeWait: { backgroundColor: 'rgba(180, 83, 9, 0.14)' },
  badgeOk: { backgroundColor: 'rgba(4, 120, 87, 0.14)' },
  badgeText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    textAlign: 'center',
  },
  badgeTextWait: { color: colors.warn },
  badgeTextOk: { color: colors.success },
});

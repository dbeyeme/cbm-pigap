import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  confirmerQuittanceDemo,
  createQuittance,
  getEncoursRedevances,
  getPaiementConfig,
  listQuittances,
  payerQuittance,
  synchroniserPaiement,
  type EncoursRedevances,
  type PaiementConfig,
  type Quittance,
} from '../api';
import { GlassPanel } from '../components/GlassPanel';
import { GlowButton } from '../components/GlowButton';
import { friendlyApiError } from '../lib/apiErrors';
import { colors, fonts, radii, space } from '../theme';

type Props = {
  token: string;
  onBack: () => void;
};

const GROUPES: Record<string, string> = {
  pelagique: 'Pélagiques',
  demersal: 'Démersaux',
  crustace: 'Crustacés',
  autre: 'Autres',
};

const STATUT: Record<string, string> = {
  en_attente: 'En attente de paiement',
  payee: 'Payée',
  annulee: 'Annulée',
};

function fcfa(n: number | null | undefined): string {
  return `${Math.round(n ?? 0).toLocaleString('fr-FR')} FCFA`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR');
}

/** Redevances du pêcheur : taxe à la production due, quittance, paiement Mobile Money. */
export function RedevancesScreen({ token, onBack }: Props) {
  const [encours, setEncours] = useState<EncoursRedevances | null>(null);
  const [quittances, setQuittances] = useState<Quittance[]>([]);
  const [config, setConfig] = useState<PaiementConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [e, q, c] = await Promise.all([
      getEncoursRedevances(token),
      listQuittances(token),
      getPaiementConfig().catch(() => null),
    ]);
    setEncours(e);
    setQuittances(q);
    setConfig(c);
  }, [token]);

  useEffect(() => {
    refresh().catch((err) => setError(friendlyApiError(err)));
  }, [refresh]);

  const live = config?.mode === 'live';

  async function run(fn: () => Promise<string | null>) {
    setBusy(true);
    setError(null);
    try {
      const msg = await fn();
      if (msg) setMessage(msg);
      await refresh();
    } catch (err) {
      setError(friendlyApiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function waitLivePayment(paiementId: string): Promise<string> {
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const done = await synchroniserPaiement(token, paiementId);
      if (done.paiement.statut === 'reussi') return 'Quittance payée. Merci.';
      if (done.paiement.statut === 'echoue' || done.paiement.statut === 'expire') {
        throw new Error('Paiement refusé ou expiré, réessayez');
      }
      setMessage('Validez le code PIN Airtel Money sur votre téléphone…');
      await new Promise((r) => setTimeout(r, 3000));
    }
    return 'Paiement en cours de confirmation.';
  }

  const enAttente = quittances.find((q) => q.statut === 'en_attente');

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Pressable onPress={onBack} style={styles.backRow} accessibilityRole="button">
        <Ionicons name="chevron-back" size={24} color={colors.tide} />
        <Text style={styles.backText}>Retour</Text>
      </Pressable>
      <Text style={styles.kicker}>Redevances</Text>
      <Text style={styles.title}>Taxe sur mes captures</Text>
      <Text style={styles.lead}>
        Chaque capture déclarée est taxée au poids selon son espèce. Vous réglez vos redevances
        par Mobile Money depuis votre numéro enregistré et recevez une quittance.
      </Text>

      <GlassPanel style={styles.panel}>
        <Text style={styles.panelTitle}>Montant dû</Text>
        <Text style={styles.amount}>{encours ? fcfa(encours.montant_fcfa) : '…'}</Text>
        {encours ? (
          <Text style={styles.meta}>
            {encours.nb_captures} capture(s) · {Math.round(encours.quantite_kg)} kg
            {encours.depuis ? ` · du ${fmtDate(encours.depuis)} au ${fmtDate(encours.jusqu_a)}` : ''}
          </Text>
        ) : null}
        {encours?.par_groupe.map((g) => (
          <View key={g.groupe} style={styles.groupeRow}>
            <Text style={styles.groupeLabel}>{GROUPES[g.groupe] ?? g.groupe}</Text>
            <Text style={styles.groupeKg}>{Math.round(g.quantite_kg)} kg</Text>
            <Text style={styles.groupeMontant}>{fcfa(g.montant_fcfa)}</Text>
          </View>
        ))}
        {encours && encours.nb_captures > 0 && !enAttente ? (
          <GlowButton
            label={busy ? 'Génération…' : 'Générer ma quittance'}
            icon="receipt-outline"
            onPress={() =>
              void run(async () => {
                const q = await createQuittance(token);
                return `Quittance ${q.numero} générée (${fcfa(q.montant_fcfa)})`;
              })
            }
            disabled={busy}
          />
        ) : null}
        {encours && encours.nb_captures === 0 && !enAttente ? (
          <Text style={styles.ok}>Vous êtes à jour de vos redevances.</Text>
        ) : null}
      </GlassPanel>

      {enAttente ? (
        <GlassPanel style={styles.panel}>
          <Text style={styles.panelTitle}>Quittance {enAttente.numero}</Text>
          <Text style={styles.amount}>{fcfa(enAttente.montant_fcfa)}</Text>
          <Text style={styles.meta}>
            {enAttente.nb_captures} capture(s) · émise le {fmtDate(enAttente.date_creation)}
          </Text>
          {enAttente.paiement && enAttente.paiement.statut === 'en_attente' ? (
            <>
              <Text style={styles.meta}>
                Paiement en attente · {enAttente.paiement.msisdn ?? 'numéro enregistré'}
              </Text>
              {!live ? (
                <GlowButton
                  label="Confirmer le paiement (démonstration)"
                  icon="checkmark-circle-outline"
                  variant="accent"
                  onPress={() =>
                    void run(async () => {
                      await confirmerQuittanceDemo(token, enAttente.paiement!.id);
                      return 'Quittance payée (démonstration).';
                    })
                  }
                  disabled={busy}
                />
              ) : (
                <GlowButton
                  label="Vérifier le paiement"
                  icon="refresh-outline"
                  variant="ghost"
                  onPress={() => void run(() => waitLivePayment(enAttente.paiement!.id))}
                  disabled={busy}
                />
              )}
            </>
          ) : (
            <GlowButton
              label={live ? 'Payer par Airtel Money' : 'Payer (démonstration)'}
              icon="card-outline"
              variant="accent"
              onPress={() =>
                void run(async () => {
                  const r = await payerQuittance(token, enAttente.id, {
                    operateur: live ? 'airtel_money' : 'demo',
                  });
                  if (live) return waitLivePayment(r.paiement.id);
                  return `Paiement démonstration initié depuis ${r.paiement.msisdn ?? 'votre numéro'}.`;
                })
              }
              disabled={busy}
            />
          )}
        </GlassPanel>
      ) : null}

      {message ? (
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={18} color={colors.tide} />
          <Text style={styles.info}>{message}</Text>
        </View>
      ) : null}
      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={18} color={colors.danger} />
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : null}

      <Text style={styles.section}>Mes quittances</Text>
      {quittances.length === 0 ? (
        <Text style={styles.empty}>Aucune quittance pour l'instant.</Text>
      ) : (
        quittances.map((q) => (
          <GlassPanel key={q.id} style={{ marginBottom: 8 }} contentStyle={styles.row}>
            <View style={[styles.badge, q.statut === 'payee' ? styles.badgeOk : q.statut === 'annulee' ? styles.badgeMuted : styles.badgeWait]}>
              <Ionicons
                name={q.statut === 'payee' ? 'checkmark' : q.statut === 'annulee' ? 'close' : 'time-outline'}
                size={16}
                color="#F8FAFC"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>
                {q.numero} · {fcfa(q.montant_fcfa)}
              </Text>
              <Text style={styles.rowMeta}>
                {STATUT[q.statut] ?? q.statut} · {q.nb_captures} capture(s) · {fmtDate(q.date_creation)}
                {q.date_paiement ? ` · payée le ${fmtDate(q.date_paiement)}` : ''}
              </Text>
            </View>
          </GlassPanel>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: space.lg, paddingTop: space.xl, paddingBottom: 48 },
  backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: space.md, alignSelf: 'flex-start', minHeight: 44 },
  backText: { fontFamily: fonts.bodyMedium, color: colors.tide, marginLeft: 2, fontSize: 16 },
  kicker: { fontFamily: fonts.bodyMedium, color: colors.tide, fontSize: 14 },
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.abyss },
  lead: { fontFamily: fonts.body, color: colors.inkMuted, marginBottom: space.md, marginTop: 6, lineHeight: 24, fontSize: 16 },
  panel: { marginBottom: space.md },
  panelTitle: { fontFamily: fonts.bodyBold, color: colors.abyss, fontSize: 17, marginBottom: 4 },
  amount: { fontFamily: fonts.display, fontSize: 30, color: colors.abyss, marginBottom: 4 },
  meta: { fontFamily: fonts.body, color: colors.inkMuted, fontSize: 13, lineHeight: 19, marginBottom: 8 },
  ok: { fontFamily: fonts.bodyMedium, color: colors.success, fontSize: 14, marginTop: 4 },
  groupeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.glassBorder },
  groupeLabel: { flex: 1, fontFamily: fonts.bodyMedium, color: colors.ink, fontSize: 14 },
  groupeKg: { fontFamily: fonts.body, color: colors.inkMuted, fontSize: 13 },
  groupeMontant: { fontFamily: fonts.bodyBold, color: colors.ink, fontSize: 14 },
  infoBox: { flexDirection: 'row', gap: 8, marginBottom: 12, padding: 12, borderRadius: radii.sm, backgroundColor: 'rgba(37, 99, 168, 0.08)' },
  info: { flex: 1, color: colors.ink, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 19 },
  errorBox: { flexDirection: 'row', gap: 8, marginBottom: 12, padding: 12, borderRadius: radii.sm, backgroundColor: 'rgba(185, 28, 28, 0.08)' },
  error: { flex: 1, color: colors.danger, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20 },
  section: { fontFamily: fonts.bodyBold, color: colors.abyss, marginBottom: 10, fontSize: 15 },
  empty: { color: colors.inkMuted, fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  badgeOk: { backgroundColor: colors.success },
  badgeWait: { backgroundColor: colors.warn },
  badgeMuted: { backgroundColor: '#94A3B8' },
  rowTitle: { fontFamily: fonts.bodyBold, color: colors.ink, fontSize: 15 },
  rowMeta: { fontFamily: fonts.body, color: colors.inkMuted, marginTop: 2, fontSize: 13, lineHeight: 18 },
});

import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

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
import {
  AppIcon,
  IconBadge,
  ListRow,
  Notice,
  ScreenHeader,
  SectionTitle,
  StatRow,
  StatTile,
  type IconName,
} from '../components/ui';
import { GROUPES_ICON, GROUPES_LABEL, type GroupeEspece } from '../offline/catalog';
import { friendlyApiError } from '../lib/apiErrors';
import { colors, fonts, radii, space } from '../theme';

type Props = {
  token: string;
  onBack: () => void;
};

const STATUT: Record<string, string> = {
  en_attente: 'En attente',
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

function groupeIcon(g: string): IconName {
  return (GROUPES_ICON[g as GroupeEspece] ?? 'fish-outline') as IconName;
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
  const aJour = encours && encours.nb_captures === 0 && !enAttente;

  return (
    <View style={styles.root}>
      <ScreenHeader
        kicker="Taxe sur mes captures"
        title="Redevances"
        onBack={onBack}
        right={<IconBadge icon="mci:receipt-text-outline" size={44} />}
      />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <GlassPanel style={styles.panel} contentStyle={styles.panelInner}>
          <View style={styles.amountRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.amountLabel}>Montant dû</Text>
              <Text style={styles.amount}>{encours ? fcfa(encours.montant_fcfa) : '…'}</Text>
              {encours?.depuis ? (
                <Text style={styles.period}>
                  du {fmtDate(encours.depuis)} au {fmtDate(encours.jusqu_a)}
                </Text>
              ) : null}
            </View>
            <IconBadge
              icon={aJour ? 'checkmark-circle' : 'mci:cash-clock'}
              tone={aJour ? 'ok' : 'warn'}
              size={48}
            />
          </View>

          {encours ? (
            <StatRow>
              <StatTile icon="fish-outline" value={encours.nb_captures} label="captures" />
              <StatTile icon="scale-outline" value={`${Math.round(encours.quantite_kg)} kg`} label="déclarés" />
            </StatRow>
          ) : null}

          {encours?.par_groupe.length ? (
            <View style={styles.groupes}>
              {encours.par_groupe.map((g) => (
                <View key={g.groupe} style={styles.groupeRow}>
                  <AppIcon name={groupeIcon(g.groupe)} size={16} color={colors.tide} />
                  <Text style={styles.groupeLabel}>{GROUPES_LABEL[g.groupe as GroupeEspece] ?? g.groupe}</Text>
                  <Text style={styles.groupeKg}>{Math.round(g.quantite_kg)} kg</Text>
                  <Text style={styles.groupeMontant}>{fcfa(g.montant_fcfa)}</Text>
                </View>
              ))}
            </View>
          ) : null}

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
          {aJour ? <Notice tone="ok" text="Vous êtes à jour de vos redevances." style={{ marginTop: 0 }} /> : null}
        </GlassPanel>

        {enAttente ? (
          <GlassPanel style={styles.panel} contentStyle={styles.panelInner}>
            <View style={styles.amountRow}>
              <IconBadge icon="receipt-outline" tone="warn" size={44} />
              <View style={{ flex: 1 }}>
                <Text style={styles.amountLabel}>Quittance {enAttente.numero}</Text>
                <Text style={styles.amountSmall}>{fcfa(enAttente.montant_fcfa)}</Text>
                <Text style={styles.period}>
                  {enAttente.nb_captures} capture(s) · émise le {fmtDate(enAttente.date_creation)}
                </Text>
              </View>
            </View>
            {enAttente.paiement && enAttente.paiement.statut === 'en_attente' ? (
              <>
                <Notice
                  tone="warn"
                  icon="phone-portrait-outline"
                  text={`Paiement en attente · ${enAttente.paiement.msisdn ?? 'numéro enregistré'}`}
                  style={{ marginTop: 0 }}
                />
                {!live ? (
                  <GlowButton
                    label="Confirmer le paiement (démo)"
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
                label={live ? 'Payer par Airtel Money' : 'Payer (démo)'}
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

        {message ? <Notice tone="info" text={message} style={{ marginTop: 0, marginBottom: 12 }} /> : null}
        {error ? <Notice tone="error" text={error} style={{ marginTop: 0, marginBottom: 12 }} /> : null}

        <SectionTitle icon="mci:receipt-text-outline" text="Mes quittances" />
        {quittances.length === 0 ? (
          <Notice tone="muted" icon="receipt-outline" text="Aucune quittance pour l’instant." style={{ marginTop: 0 }} />
        ) : (
          quittances.map((q) => {
            const tone = q.statut === 'payee' ? 'ok' : q.statut === 'annulee' ? 'muted' : 'warn';
            return (
              <ListRow
                key={q.id}
                icon={q.statut === 'payee' ? 'checkmark' : q.statut === 'annulee' ? 'close' : 'time-outline'}
                tone={tone}
                solid
                title={fcfa(q.montant_fcfa)}
                meta={`${q.numero} · ${q.nb_captures} capture(s) · ${fmtDate(q.date_paiement ?? q.date_creation)}`}
                right={
                  <View style={[styles.statusPill, { backgroundColor: tone === 'ok' ? 'rgba(4,120,87,0.12)' : tone === 'warn' ? 'rgba(180,83,9,0.14)' : colors.surface }]}>
                    <Text style={[styles.statusText, { color: tone === 'ok' ? colors.success : tone === 'warn' ? colors.warn : colors.inkSoft }]}>
                      {STATUT[q.statut] ?? q.statut}
                    </Text>
                  </View>
                }
              />
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { paddingHorizontal: space.lg, paddingBottom: 48, paddingTop: 4 },
  panel: { marginBottom: space.md },
  panelInner: { padding: 16, gap: 12 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  amountLabel: { fontFamily: fonts.bodyMedium, color: colors.inkMuted, fontSize: 13 },
  amount: { fontFamily: fonts.display, fontSize: 32, color: colors.abyss, letterSpacing: -0.4 },
  amountSmall: { fontFamily: fonts.display, fontSize: 22, color: colors.abyss },
  period: { fontFamily: fonts.body, color: colors.inkSoft, fontSize: 12, marginTop: 2 },
  groupes: { borderTopWidth: 1, borderTopColor: colors.glassBorder },
  groupeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.glassBorder,
  },
  groupeLabel: { flex: 1, fontFamily: fonts.bodyMedium, color: colors.ink, fontSize: 14 },
  groupeKg: { fontFamily: fonts.body, color: colors.inkMuted, fontSize: 13 },
  groupeMontant: { fontFamily: fonts.bodyBold, color: colors.ink, fontSize: 14, minWidth: 90, textAlign: 'right' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.pill },
  statusText: { fontFamily: fonts.bodyBold, fontSize: 12 },
});

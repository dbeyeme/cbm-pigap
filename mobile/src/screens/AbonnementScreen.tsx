import { Component, PropsWithChildren, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  confirmerPaiementDemo,
  getPaiementConfig,
  initierAbonnementB2C,
  listOffresAbonnement,
  OffreAbonnement,
  PaiementConfig,
  synchroniserPaiement,
  getPayeur,
  updateMonTelephone,
  type Payeur,
} from '../api';
import { GlassField } from '../components/GlassField';
import { GlassPanel } from '../components/GlassPanel';
import { GlowButton } from '../components/GlowButton';
import { IconBadge, Notice, ScreenHeader, SectionTitle, type IconName } from '../components/ui';
import { colors, fonts, radii, space } from '../theme';

type Props = {
  token: string;
  onBack: () => void;
};

function formatFcfa(n: number): string {
  try {
    return `${Number(n).toLocaleString('fr-FR')} FCFA`;
  } catch {
    return `${n} FCFA`;
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR');
  } catch {
    return iso.slice(0, 10);
  }
}

/** « Licence pêcheur — mensuel » devient « Mensuel » : la carte porte déjà le contexte. */
function offerLabel(o: OffreAbonnement): string {
  const short = o.libelle.replace(/^licence\s+p[êe]cheur\s*[—–-]\s*/i, '').trim();
  return short ? short.charAt(0).toUpperCase() + short.slice(1) : o.libelle;
}

function offerIcon(o: OffreAbonnement): IconName {
  return /an/i.test(o.code) || /an/i.test(o.libelle) ? 'ribbon-outline' : 'calendar-outline';
}

/** Evite un crash silencieux si le catalogue ou le paiement echoue. */
class ScreenSafe extends Component<
  PropsWithChildren<{ onBack: () => void }>,
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(err: Error) {
    return { error: err.message || 'Erreur ecran abonnement' };
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.root}>
          <ScreenHeader kicker="Licence d'usage" title="Abonnement" onBack={this.props.onBack} />
          <View style={styles.container}>
            <Notice tone="error" text={this.state.error} />
          </View>
        </View>
      );
    }
    return this.props.children;
  }
}

export function AbonnementScreen({ token, onBack }: Props) {
  return (
    <ScreenSafe onBack={onBack}>
      <AbonnementBody token={token} onBack={onBack} />
    </ScreenSafe>
  );
}

function AbonnementBody({ token, onBack }: Props) {
  const [offres, setOffres] = useState<OffreAbonnement[]>([]);
  const [config, setConfig] = useState<PaiementConfig | null>(null);
  const [code, setCode] = useState('b2c_annuel');
  const [licence, setLicence] = useState('');
  const [msisdn, setMsisdn] = useState('');
  const [payeur, setPayeur] = useState<Payeur | null>(null);
  const [savingPhone, setSavingPhone] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getPayeur(token)
      .then((p) => {
        if (cancelled) return;
        setPayeur(p);
        if (p.telephone) setMsisdn(p.telephone);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token]);

  const phoneDirty = msisdn.trim() !== (payeur?.telephone ?? '').trim();

  async function savePhone() {
    setSavingPhone(true);
    setError(null);
    setMessage(null);
    try {
      const me = await updateMonTelephone(token, msisdn.trim());
      const p = await getPayeur(token);
      setPayeur(p);
      setMsisdn(me.telephone ?? p.telephone ?? '');
      setMessage('Numéro enregistré. Les paiements partiront de ce téléphone.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Numéro non enregistré');
    } finally {
      setSavingPhone(false);
    }
  }
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const live = config?.mode === 'live';

  useEffect(() => {
    let cancelled = false;
    void Promise.all([listOffresAbonnement(), getPaiementConfig()])
      .then(([list, cfg]) => {
        if (cancelled) return;
        const b2c = (list || []).filter((o) => o.canal === 'b2c');
        setOffres(b2c);
        setConfig(cfg);
        if (b2c.length) {
          setCode((prev) => (b2c.some((o) => o.code === prev) ? prev : b2c[0].code));
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Catalogue indisponible');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function waitLivePayment(paiementId: string) {
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const done = await synchroniserPaiement(token, paiementId);
      if (done.paiement.statut === 'reussi') return done;
      if (done.paiement.statut === 'echoue' || done.paiement.statut === 'expire') {
        throw new Error('Paiement refuse ou expire — reessayez');
      }
      setMessage('Validez le code PIN Airtel Money sur votre telephone…');
      await new Promise((r) => setTimeout(r, 3000));
    }
    throw new Error('Delai depasse — si le debit a eu lieu, reouvrez cet ecran dans 1 min');
  }

  async function pay() {
    if (live && !msisdn.trim()) {
      setError('Numero Airtel Money requis (ex. 077xxxxxx)');
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const init = await initierAbonnementB2C(token, {
        code_offre: code,
        ...(licence.trim() ? { numero_licence: licence.trim() } : {}),
        operateur: live ? 'airtel_money' : 'demo',
        msisdn: msisdn.trim() || undefined,
      });
      if (!init?.paiement?.id) {
        throw new Error('Paiement non cree — reessayez');
      }
      const done =
        live || init.paiement.operateur !== 'demo'
          ? await waitLivePayment(init.paiement.id)
          : await confirmerPaiementDemo(token, init.paiement.id);
      const fin = done.abonnement.date_fin ? ` jusqu'au ${formatDate(done.abonnement.date_fin)}` : '';
      setMessage(
        `Abonnement ${done.abonnement.code_offre} actif - ${formatFcfa(done.abonnement.montant_fcfa)}${fin}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Paiement impossible');
    } finally {
      setLoading(false);
    }
  }

  const selectedOffer = offres.find((o) => o.code === code);

  return (
    <View style={styles.root}>
      <ScreenHeader
        kicker="Licence d'usage"
        title="Abonnement"
        onBack={onBack}
        right={<IconBadge icon="wallet-outline" size={44} />}
      />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <SectionTitle icon="pricetags-outline" text="Formule" />
        {offres.length === 0 && !error ? <ActivityIndicator color={colors.tide} /> : null}
        <View style={styles.offers}>
          {offres.map((o) => {
            const on = code === o.code;
            return (
              <Pressable
                key={o.code}
                onPress={() => setCode(o.code)}
                style={[styles.offer, on && styles.offerOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <IconBadge icon={offerIcon(o)} size={36} tone={on ? 'info' : 'muted'} solid={on} />
                <Text style={[styles.offerTitle, on && styles.offerTitleOn]} numberOfLines={2}>
                  {offerLabel(o)}
                </Text>
                <Text style={styles.offerPrice}>{formatFcfa(o.montant_fcfa)}</Text>
              </Pressable>
            );
          })}
        </View>

        <GlassPanel style={styles.card} contentStyle={styles.cardInner}>
          <SectionTitle icon="card-outline" text="Paiement" style={{ marginTop: 0 }} />
          <GlassField
            label="Téléphone Mobile Money"
            icon="phone-portrait-outline"
            value={msisdn}
            onChangeText={setMsisdn}
            placeholder="Ex. 077 12 34 56"
            keyboardType="phone-pad"
            autoComplete="tel"
          />
          {phoneDirty ? (
            <GlowButton
              label={savingPhone ? 'Enregistrement…' : 'Enregistrer ce numéro'}
              icon="checkmark-circle-outline"
              variant="ghost"
              onPress={() => void savePhone()}
              disabled={savingPhone || msisdn.trim().length < 8}
              style={{ marginBottom: 12 }}
            />
          ) : payeur && !payeur.valide ? (
            <Notice
              tone="warn"
              icon="call-outline"
              text="Aucun numéro valide : saisissez votre téléphone Mobile Money ci-dessus."
              style={{ marginTop: 0, marginBottom: 12 }}
            />
          ) : null}
          <GlassField
            label="N° de licence (optionnel)"
            icon="ribbon-outline"
            value={licence}
            onChangeText={setLicence}
            placeholder="LIC-DEMO-01"
            autoCapitalize="characters"
          />

          <View style={styles.summary}>
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryLabel}>Total</Text>
              <Text style={styles.summaryValue}>
                {selectedOffer ? formatFcfa(selectedOffer.montant_fcfa) : '—'}
              </Text>
            </View>
            <View style={styles.modePill}>
              <IconBadge icon={live ? 'shield-checkmark-outline' : 'flask-outline'} size={24} tone={live ? 'ok' : 'muted'} />
              <Text style={styles.modeText}>{live ? 'Airtel Money' : 'Démonstration'}</Text>
            </View>
          </View>

          {loading ? <ActivityIndicator color={colors.tide} /> : null}
          {error ? <Notice tone="error" text={error} style={{ marginTop: 0 }} /> : null}
          {message ? <Notice tone="ok" text={message} style={{ marginTop: 0 }} /> : null}

          <GlowButton
            label={live ? 'Payer via Airtel Money' : 'Payer et activer (démo)'}
            icon="wallet-outline"
            onPress={() => void pay()}
            disabled={loading || !code || phoneDirty || (live && !(payeur?.valide ?? false))}
          />
          <Text style={styles.hint}>
            {live
              ? 'Validez le code secret Mobile Money quand il apparaît sur votre téléphone.'
              : 'Mode démonstration : confirmation instantanée, sans débit.'}
          </Text>
        </GlassPanel>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { paddingHorizontal: space.lg, paddingBottom: 120, paddingTop: 4 },
  offers: { flexDirection: 'row', gap: 10, marginBottom: space.md },
  offer: {
    flex: 1,
    gap: 8,
    padding: 14,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.glassBorder,
    backgroundColor: colors.card,
  },
  offerOn: { borderColor: colors.tide, backgroundColor: 'rgba(37, 99, 168, 0.08)' },
  offerTitle: { fontFamily: fonts.bodyMedium, color: colors.ink, fontSize: 14, lineHeight: 19 },
  offerTitleOn: { color: colors.tide, fontFamily: fonts.bodyBold },
  offerPrice: { fontFamily: fonts.display, color: colors.abyss, fontSize: 18 },
  card: {},
  cardInner: { padding: 16, gap: 4 },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    marginBottom: 12,
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
  },
  summaryLabel: { fontFamily: fonts.bodyMedium, color: colors.inkMuted, fontSize: 13 },
  summaryValue: { fontFamily: fonts.display, color: colors.abyss, fontSize: 24 },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 10,
    paddingLeft: 4,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  modeText: { fontFamily: fonts.bodyMedium, color: colors.inkMuted, fontSize: 12 },
  hint: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: 10,
  },
});

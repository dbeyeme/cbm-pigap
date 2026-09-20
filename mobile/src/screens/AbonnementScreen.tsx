import { Component, PropsWithChildren, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  confirmerPaiementDemo,
  getPaiementConfig,
  initierAbonnementB2C,
  listOffresAbonnement,
  OffreAbonnement,
  PaiementConfig,
  synchroniserPaiement,
} from '../api';
import { GlassPanel } from '../components/GlassPanel';
import { GlowButton } from '../components/GlowButton';
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
        <View style={styles.container}>
          <Pressable onPress={this.props.onBack} hitSlop={12}>
            <Text style={styles.back}>Retour</Text>
          </Pressable>
          <Text style={styles.error}>{this.state.error}</Text>
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

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Pressable onPress={onBack} hitSlop={12}>
        <Text style={styles.back}>Retour</Text>
      </Pressable>
      <Text style={styles.kicker}>Licence d'usage</Text>
      <Text style={styles.title}>Abonnement</Text>
      <Text style={styles.lead}>
        {live
          ? '3000 FCFA / mois ou 30000 FCFA / an via Airtel Money (Gabon). Validez le PIN sur votre telephone.'
          : '3000 FCFA / mois ou 30000 FCFA / an. Mode demo : confirmation instantanee.'}
      </Text>

      <GlassPanel style={styles.card} contentStyle={styles.cardInner}>
        <Text style={styles.label}>Formule</Text>
        {offres.length === 0 && !error ? (
          <ActivityIndicator color={colors.tide} />
        ) : null}
        {offres.map((o) => {
          const on = code === o.code;
          return (
            <Pressable
              key={o.code}
              onPress={() => setCode(o.code)}
              style={[styles.offer, on && styles.offerOn]}
            >
              <Text style={[styles.offerTitle, on && styles.offerTitleOn]}>{o.libelle}</Text>
              <Text style={styles.offerPrice}>{formatFcfa(o.montant_fcfa)}</Text>
            </Pressable>
          );
        })}

        <Text style={styles.label}>N de licence (optionnel si vous etes pecheur)</Text>
        <TextInput
          style={styles.input}
          value={licence}
          onChangeText={setLicence}
          placeholder="LIC-DEMO-01"
          autoCapitalize="characters"
          placeholderTextColor={colors.inkSoft}
        />

        <Text style={styles.label}>
          Telephone Airtel Money{live ? ' (obligatoire)' : ' (optionnel)'}
        </Text>
        <TextInput
          style={styles.input}
          value={msisdn}
          onChangeText={setMsisdn}
          placeholder="077..."
          keyboardType="phone-pad"
          placeholderTextColor={colors.inkSoft}
        />

        {loading ? <ActivityIndicator color={colors.tide} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {message ? <Text style={styles.ok}>{message}</Text> : null}

        <GlowButton
          label={live ? 'Payer via Airtel Money' : 'Payer et activer (demo)'}
          icon="wallet-outline"
          onPress={() => void pay()}
          disabled={loading || !code || (live && !msisdn.trim())}
          style={styles.cta}
        />
      </GlassPanel>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.lg, paddingBottom: 120, gap: space.sm },
  back: { fontFamily: fonts.bodyMedium, color: colors.tide, marginBottom: space.sm },
  kicker: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.ink },
  lead: { fontFamily: fonts.body, fontSize: 15, color: colors.inkSoft, lineHeight: 22 },
  card: { marginTop: space.md },
  cardInner: { gap: space.sm },
  label: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.inkSoft, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  offer: {
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radii.md,
    padding: 12,
    marginBottom: 6,
  },
  offerOn: {
    borderColor: colors.tide,
    backgroundColor: 'rgba(37, 99, 168, 0.08)',
  },
  offerTitle: { fontFamily: fonts.bodyMedium, color: colors.ink },
  offerTitleOn: { color: colors.tide },
  offerPrice: { fontFamily: fonts.bodyBold, color: colors.ink, marginTop: 2 },
  error: { fontFamily: fonts.body, color: '#B91C1C' },
  ok: { fontFamily: fonts.bodyMedium, color: '#047857' },
  cta: { marginTop: space.sm },
});

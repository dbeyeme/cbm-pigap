import { useEffect, useState } from 'react';
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
  initierAbonnementB2C,
  listOffresAbonnement,
  OffreAbonnement,
} from '../api';
import { GlassPanel } from '../components/GlassPanel';
import { GlowButton } from '../components/GlowButton';
import { colors, fonts, radii, space } from '../theme';

type Props = {
  token: string;
  onBack: () => void;
};

function formatFcfa(n: number): string {
  return `${n.toLocaleString('fr-FR')} FCFA`;
}

export function AbonnementScreen({ token, onBack }: Props) {
  const [offres, setOffres] = useState<OffreAbonnement[]>([]);
  const [code, setCode] = useState('b2c_annuel');
  const [licence, setLicence] = useState('');
  const [msisdn, setMsisdn] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listOffresAbonnement()
      .then((list) => setOffres(list.filter((o) => o.canal === 'b2c')))
      .catch((err) => setError(err instanceof Error ? err.message : 'Catalogue indisponible'));
  }, []);

  async function pay() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const init = await initierAbonnementB2C(token, {
        code_offre: code,
        numero_licence: licence.trim(),
        operateur: 'demo',
        msisdn: msisdn.trim() || undefined,
      });
      const done = await confirmerPaiementDemo(token, init.paiement.id);
      setMessage(
        `Abonnement ${done.abonnement.code_offre} actif — ${formatFcfa(done.abonnement.montant_fcfa)}` +
          (done.abonnement.date_fin
            ? ` · jusqu’au ${new Date(done.abonnement.date_fin).toLocaleDateString('fr-GA')}`
            : ''),
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
        <Text style={styles.back}>← Retour</Text>
      </Pressable>
      <Text style={styles.kicker}>Licence d’usage</Text>
      <Text style={styles.title}>Abonnement</Text>
      <Text style={styles.lead}>
        3 000 FCFA / mois ou 30 000 FCFA / an via Mobile Money (Airtel / Moov). Mode démo :
        confirmation instantanée.
      </Text>

      <GlassPanel style={styles.card} contentStyle={styles.cardInner}>
        <Text style={styles.label}>Formule</Text>
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

        <Text style={styles.label}>N° de licence</Text>
        <TextInput
          style={styles.input}
          value={licence}
          onChangeText={setLicence}
          placeholder="LIC-…"
          autoCapitalize="characters"
          placeholderTextColor={colors.inkSoft}
        />

        <Text style={styles.label}>Téléphone Mobile Money (optionnel)</Text>
        <TextInput
          style={styles.input}
          value={msisdn}
          onChangeText={setMsisdn}
          placeholder="077…"
          keyboardType="phone-pad"
          placeholderTextColor={colors.inkSoft}
        />

        {loading ? <ActivityIndicator color={colors.tide} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {message ? <Text style={styles.ok}>{message}</Text> : null}

        <GlowButton
          label="Payer & activer"
          icon="card-outline"
          onPress={() => void pay()}
          disabled={loading || !licence.trim()}
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

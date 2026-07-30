import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { getLicenceDossier, LicenceDossier, Pecheur, searchPecheurs } from '../api';
import { GlassField } from '../components/GlassField';
import { GlassPanel } from '../components/GlassPanel';
import { GlowButton } from '../components/GlowButton';
import { friendlyApiError } from '../lib/apiErrors';
import { colors, fonts, radii, space } from '../theme';

type Props = {
  token: string;
  onBack: () => void;
};

export function SearchScreen({ token, onBack }: Props) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Pecheur[]>([]);
  const [dossier, setDossier] = useState<LicenceDossier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function onSearch() {
    setLoading(true);
    setError(null);
    setSearched(true);
    setDossier(null);
    try {
      const query = q.trim();
      if (/lic|ga-|^\d/i.test(query) || query.includes('-')) {
        try {
          const d = await getLicenceDossier(token, query);
          setDossier(d);
          setResults([]);
          return;
        } catch {
          /* fallback recherche classique */
        }
      }
      const data = await searchPecheurs(token, query);
      setResults(data);
      if (data.length === 1) {
        const d = await getLicenceDossier(token, data[0].numero_licence);
        setDossier(d);
      }
    } catch (err) {
      setError(friendlyApiError(err));
    } finally {
      setLoading(false);
    }
  }

  async function openLicence(numero: string) {
    setLoading(true);
    setError(null);
    try {
      const d = await getLicenceDossier(token, numero);
      setDossier(d);
    } catch (err) {
      setError(friendlyApiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Pressable
        onPress={onBack}
        style={styles.backRow}
        accessibilityRole="button"
        accessibilityLabel="Retour"
      >
        <Ionicons name="chevron-back" size={24} color={colors.tide} />
        <Text style={styles.backText}>Retour</Text>
      </Pressable>

      <Text style={styles.kicker}>Licences</Text>
      <Text style={styles.title}>Recherche</Text>
      <Text style={styles.lead}>
        Tapez le nom du pêcheur ou le numéro de licence pour ouvrir le dossier.
      </Text>

      <GlassPanel style={styles.panel}>
        <GlassField
          label="Nom ou n° de licence"
          icon="search-outline"
          value={q}
          onChangeText={setQ}
          placeholder="Ex. Obiang ou LIC-…"
          returnKeyType="search"
          onSubmitEditing={onSearch}
        />
        <GlowButton
          label="Rechercher"
          icon="search"
          onPress={onSearch}
          loading={loading}
          variant="accent"
        />
      </GlassPanel>

      {error ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle" size={18} color={colors.danger} />
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : null}

      {dossier ? (
        <FlatList
          data={dossier.trajectories}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            <View>
              <GlassPanel style={{ marginBottom: 12 }}>
                <Text style={styles.cardTitle}>
                  {dossier.prenom} {dossier.nom}
                </Text>
                <Text style={styles.cardMeta}>
                  Licence {dossier.numero_licence} · {dossier.statut}
                </Text>
                {dossier.note_infractions ? (
                  <Text style={styles.note}>{dossier.note_infractions}</Text>
                ) : null}
              </GlassPanel>
              <Text style={styles.section}>
                Bateaux ({dossier.embarcations.length})
              </Text>
              {dossier.embarcations.map((e) => (
                <GlassPanel key={e.id} style={{ marginBottom: 8 }}>
                  <Text style={styles.cardTitle}>{e.nom}</Text>
                  <Text style={styles.cardMeta}>
                    {e.immatriculation} · {e.positions_count ?? 0} point(s) GPS
                  </Text>
                </GlassPanel>
              ))}
              <Text style={styles.section}>
                Sorties enregistrées ({dossier.trajectories.length})
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <GlassPanel style={{ marginBottom: 8 }}>
              <Text style={styles.cardTitle}>
                {item.embarcation_nom} · sortie {item.index}
              </Text>
              <Text style={styles.cardMeta}>
                {item.points_count} pts · {new Date(item.debut).toLocaleString('fr-FR')}
              </Text>
            </GlassPanel>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>Aucune sortie GPS pour cette licence.</Text>
          }
          contentContainerStyle={styles.list}
        />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            searched && !loading ? (
              <Text style={styles.empty}>Aucun pêcheur trouvé pour « {q} »</Text>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => void openLicence(item.numero_licence)}
              accessibilityRole="button"
              accessibilityLabel={`Ouvrir le dossier de ${item.prenom} ${item.nom}`}
            >
              <GlassPanel contentStyle={styles.card} style={{ marginBottom: 10 }}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {item.prenom.charAt(0)}
                    {item.nom.charAt(0)}
                  </Text>
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle}>
                    {item.prenom} {item.nom}
                  </Text>
                  <Text style={styles.cardMeta}>{item.numero_licence}</Text>
                  <Text style={styles.trajCta}>Ouvrir le dossier →</Text>
                </View>
              </GlassPanel>
            </Pressable>
          )}
        />
      )}
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
    minHeight: 44,
    alignSelf: 'flex-start',
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
    marginBottom: space.lg,
    marginTop: 6,
    fontSize: 16,
    lineHeight: 24,
  },
  panel: { marginBottom: space.md },
  list: { paddingBottom: space.xxl },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 72,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.tide,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontFamily: fonts.bodyBold,
    color: '#F8FAFC',
    fontSize: 16,
  },
  cardBody: { flex: 1 },
  cardTitle: {
    fontFamily: fonts.bodyBold,
    color: colors.ink,
    fontSize: 17,
  },
  cardMeta: {
    fontFamily: fonts.body,
    color: colors.inkMuted,
    marginTop: 4,
    fontSize: 14,
  },
  trajCta: {
    fontFamily: fonts.bodyMedium,
    color: colors.tide,
    marginTop: 6,
    fontSize: 14,
  },
  section: {
    fontFamily: fonts.bodyBold,
    color: colors.abyss,
    marginBottom: 8,
    marginTop: 4,
    fontSize: 15,
  },
  note: {
    fontFamily: fonts.body,
    color: colors.inkMuted,
    fontSize: 13,
    marginTop: 10,
    lineHeight: 19,
  },
  empty: {
    fontFamily: fonts.body,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: space.lg,
    fontSize: 15,
    lineHeight: 22,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: space.md,
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
});

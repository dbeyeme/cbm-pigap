import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { getLicenceDossier, LicenceDossier, Pecheur, searchPecheurs } from '../api';
import { GlassField } from '../components/GlassField';
import { GlassPanel } from '../components/GlassPanel';
import { GlowButton } from '../components/GlowButton';
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
      // Si ça ressemble à une licence, dossier complet + trajectoires
      if (/lic|ga-|^\d/i.test(query) || query.includes('-')) {
        try {
          const d = await getLicenceDossier(token, query);
          setDossier(d);
          setResults([]);
          return;
        } catch {
          // fallback recherche classique
        }
      }
      const data = await searchPecheurs(token, query);
      setResults(data);
      if (data.length === 1) {
        const d = await getLicenceDossier(token, data[0].numero_licence);
        setDossier(d);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recherche impossible');
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
      setError(err instanceof Error ? err.message : 'Dossier impossible');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Pressable onPress={onBack} style={styles.backRow}>
        <Ionicons name="chevron-back" size={22} color={colors.foam} />
        <Text style={styles.backText}>Retour</Text>
      </Pressable>

      <Text style={styles.title}>Recherche</Text>
      <Text style={styles.lead}>
        Nom ou n° de licence — affiche aussi les trajectoires GPS (M2).
      </Text>

      <GlassPanel style={styles.panel}>
        <GlassField
          label="Critère"
          icon="search-outline"
          value={q}
          onChangeText={setQ}
          placeholder="Ex. Obiang ou LIC-…"
          returnKeyType="search"
          onSubmitEditing={onSearch}
        />
        <GlowButton
          label="Lancer la recherche"
          icon="search"
          onPress={onSearch}
          loading={loading}
          variant="accent"
        />
      </GlassPanel>

      {error ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle" size={16} color={colors.danger} />
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
                <Text style={styles.note}>{dossier.note_infractions}</Text>
              </GlassPanel>
              <Text style={styles.section}>
                Embarcations ({dossier.embarcations.length})
              </Text>
              {dossier.embarcations.map((e) => (
                <GlassPanel key={e.id} style={{ marginBottom: 8 }}>
                  <Text style={styles.cardTitle}>{e.nom}</Text>
                  <Text style={styles.cardMeta}>
                    {e.immatriculation} · {e.positions_count ?? 0} pts GPS
                  </Text>
                </GlassPanel>
              ))}
              <Text style={styles.section}>
                Trajectoires ({dossier.trajectories.length})
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <GlassPanel style={{ marginBottom: 8 }}>
              <Text style={styles.cardTitle}>
                {item.embarcation_nom} · sortie {item.index}
              </Text>
              <Text style={styles.cardMeta}>
                {item.points_count} pts · {new Date(item.debut).toLocaleString()}
              </Text>
            </GlassPanel>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>Aucune trajectoire pour cette licence.</Text>
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
            <Pressable onPress={() => void openLicence(item.numero_licence)}>
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
                  <Text style={styles.trajCta}>Voir trajectoires →</Text>
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
    paddingTop: space.xxl,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.md,
  },
  backText: {
    fontFamily: fonts.bodyMedium,
    color: colors.foam,
    marginLeft: 2,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 32,
    color: colors.ink,
  },
  lead: {
    fontFamily: fonts.body,
    color: colors.inkMuted,
    marginBottom: space.lg,
    marginTop: 4,
  },
  panel: { marginBottom: space.md },
  list: { paddingBottom: space.xxl },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: radii.sm,
    backgroundColor: colors.tide,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontFamily: fonts.bodyBold,
    color: colors.ink,
  },
  cardBody: { flex: 1 },
  cardTitle: {
    fontFamily: fonts.bodyBold,
    color: colors.ink,
    fontSize: 16,
  },
  cardMeta: {
    fontFamily: fonts.body,
    color: colors.inkMuted,
    marginTop: 4,
  },
  trajCta: {
    fontFamily: fonts.bodyMedium,
    color: colors.foam,
    marginTop: 6,
    fontSize: 13,
  },
  section: {
    fontFamily: fonts.bodyBold,
    color: colors.ink,
    marginBottom: 8,
    marginTop: 4,
  },
  note: {
    fontFamily: fonts.body,
    color: colors.inkMuted,
    fontSize: 12,
    marginTop: 10,
    lineHeight: 18,
  },
  empty: {
    fontFamily: fonts.body,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: space.lg,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: space.md,
  },
  error: { flex: 1, color: colors.danger, fontFamily: fonts.body, fontSize: 13 },
});

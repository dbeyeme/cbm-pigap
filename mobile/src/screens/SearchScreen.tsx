import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import {
  getLicenceDossier,
  LicenceDossier,
  Pecheur,
  searchPecheurs,
} from "../api";
import { GlassField } from "../components/GlassField";
import { GlassPanel } from "../components/GlassPanel";
import { GlowButton } from "../components/GlowButton";
import {
  IconBadge,
  ListRow,
  Notice,
  ScreenHeader,
  SectionTitle,
  StatRow,
  StatTile,
} from "../components/ui";
import { friendlyApiError } from "../lib/apiErrors";
import { colors, fonts, radii, space } from "../theme";

type Props = {
  token: string;
  onBack: () => void;
};

function statutTone(statut: string): "ok" | "warn" | "muted" {
  const s = statut.toLowerCase();
  if (/^acti|valid/.test(s)) return "ok";
  if (/suspend|expir|retir/.test(s)) return "warn";
  return "muted";
}

export function SearchScreen({ token, onBack }: Props) {
  const [q, setQ] = useState("");
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
      if (/lic|ga-|^\d/i.test(query) || query.includes("-")) {
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

  const totalPoints =
    dossier?.embarcations.reduce((n, e) => n + (e.positions_count ?? 0), 0) ??
    0;

  return (
    <View style={styles.root}>
      <ScreenHeader
        kicker="Licences"
        title="Recherche"
        onBack={dossier && results.length > 0 ? () => setDossier(null) : onBack}
        right={<IconBadge icon="id-card-outline" size={44} />}
      />
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {dossier ? (
          <ListRow
            icon="search-outline"
            tone="muted"
            title="Nouvelle recherche"
            meta={q.trim() ? `« ${q.trim()} »` : undefined}
            onPress={() => {
              setDossier(null);
              setResults([]);
              setSearched(false);
            }}
            style={{ marginBottom: space.md }}
          />
        ) : (
          <GlassPanel style={styles.panel} contentStyle={styles.panelInner}>
            <GlassField
              label="Nom du pêcheur ou n° de licence"
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
        )}

        {error ? (
          <Notice
            tone="error"
            text={error}
            style={{ marginTop: 0, marginBottom: 12 }}
          />
        ) : null}

        {dossier ? (
          <>
            <GlassPanel style={styles.panel} contentStyle={styles.panelInner}>
              <View style={styles.identity}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {dossier.prenom.charAt(0)}
                    {dossier.nom.charAt(0)}
                  </Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {dossier.prenom} {dossier.nom}
                  </Text>
                  <Text style={styles.licence} numberOfLines={1}>
                    {dossier.numero_licence}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor:
                        statutTone(dossier.statut) === "ok"
                          ? "rgba(4,120,87,0.12)"
                          : statutTone(dossier.statut) === "warn"
                            ? "rgba(180,83,9,0.14)"
                            : colors.surface,
                    },
                  ]}
                >
                  <IconBadge
                    icon={
                      statutTone(dossier.statut) === "ok"
                        ? "shield-checkmark"
                        : statutTone(dossier.statut) === "warn"
                          ? "warning"
                          : "ellipse-outline"
                    }
                    tone={statutTone(dossier.statut)}
                    size={22}
                  />
                  <Text
                    style={[
                      styles.statusText,
                      {
                        color:
                          statutTone(dossier.statut) === "ok"
                            ? colors.success
                            : statutTone(dossier.statut) === "warn"
                              ? colors.warn
                              : colors.inkSoft,
                      },
                    ]}
                  >
                    {dossier.statut}
                  </Text>
                </View>
              </View>
              <StatRow>
                <StatTile
                  icon="boat-outline"
                  value={dossier.embarcations.length}
                  label="bateaux"
                />
                <StatTile
                  icon="navigate-outline"
                  value={dossier.trajectories.length}
                  label="sorties"
                />
                <StatTile
                  icon="mci:map-marker-path"
                  value={totalPoints}
                  label="points GPS"
                />
              </StatRow>
            </GlassPanel>

            <SectionTitle icon="boat-outline" text="Bateaux" />
            {dossier.embarcations.length === 0 ? (
              <Notice
                tone="muted"
                icon="boat-outline"
                text="Aucun bateau enregistré."
                style={{ marginTop: 0, marginBottom: 12 }}
              />
            ) : (
              dossier.embarcations.map((e) => (
                <ListRow
                  key={e.id}
                  icon="boat-outline"
                  title={e.nom}
                  meta={`${e.immatriculation} · ${e.positions_count ?? 0} point(s) GPS`}
                />
              ))
            )}

            <SectionTitle icon="navigate-outline" text="Sorties enregistrées" />
            {dossier.trajectories.length === 0 ? (
              <Notice
                tone="muted"
                icon="navigate-outline"
                text="Aucune sortie GPS pour cette licence."
                style={{ marginTop: 0 }}
              />
            ) : (
              dossier.trajectories.map((t) => (
                <ListRow
                  key={t.id}
                  icon="mci:map-marker-path"
                  tone="muted"
                  title={`${t.embarcation_nom} · sortie ${t.index}`}
                  meta={`${t.points_count} pts · ${new Date(t.debut).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}`}
                />
              ))
            )}
          </>
        ) : (
          <>
            {results.length > 0 ? (
              <SectionTitle
                icon="people-outline"
                text={`${results.length} pêcheur(s)`}
              />
            ) : null}
            {results.map((item) => (
              <ListRow
                key={item.id}
                icon="person-outline"
                title={`${item.prenom} ${item.nom}`}
                meta={item.numero_licence}
                onPress={() => void openLicence(item.numero_licence)}
              />
            ))}
            {searched && !loading && results.length === 0 ? (
              <Notice
                tone="muted"
                icon="search-outline"
                text={`Aucun pêcheur trouvé pour « ${q} »`}
                style={{ marginTop: 0 }}
              />
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xxl,
    paddingTop: 4,
  },
  panel: { marginBottom: space.md },
  panelInner: { padding: 16, gap: 12 },
  identity: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.tide,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: fonts.bodyBold, color: "#F8FAFC", fontSize: 16 },
  name: { fontFamily: fonts.bodyBold, color: colors.ink, fontSize: 17 },
  licence: {
    fontFamily: fonts.body,
    color: colors.inkMuted,
    fontSize: 13,
    marginTop: 2,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingLeft: 4,
    paddingRight: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  statusText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    textTransform: "capitalize",
  },
});

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getAvisMer, type AvisMer } from '../api';

import { GlassPanel } from '../components/GlassPanel';
import { GlowButton } from '../components/GlowButton';
import { ShipIcon } from '../components/ShipIcon';
import { ActionTile, AppIcon } from '../components/ui';
import { colors, fonts, radii, space } from '../theme';

const ILLU = {
  captures: require('../../assets/illustrations/icon-captures.png'),
  trajectories: require('../../assets/illustrations/icon-trajectories.png'),
  abo: require('../../assets/illustrations/icon-licences.png'),
} as const;

type Props = {
  userName: string;
  /** Jeton API : permet d'afficher l'avis de mer du secteur du pêcheur. */
  token?: string;
  /** Dernière position connue [lon, lat] ; défaut : estuaire de Libreville. */
  position?: [number, number];
  onCaptures: () => void;
  onTracking: () => void;
  onAbonnement: () => void;
  onRedevances?: () => void;
  onLogout: () => void;
};

/** Accueil pecheur — captures, GPS perso, abonnement B2C. */
export function PecheurHomeScreen({
  userName,
  token,
  position,
  onCaptures,
  onTracking,
  onAbonnement,
  onRedevances,
  onLogout,
}: Props) {
  const first = userName.trim().split(/\s+/)[0] || '';
  const [avis, setAvis] = useState<AvisMer | null>(null);
  useEffect(() => {
    if (!token) return;
    const [lon, lat] = position ?? [9.3, 0.3];
    let cancelled = false;
    getAvisMer(token, lon, lat)
      .then((a) => {
        if (!cancelled) setAvis(a);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token, position]);
  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.top}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={styles.kicker}>Espace pecheur</Text>
          <Text style={styles.title}>Bonjour{first ? `, ${first}` : ''}</Text>
        </View>
        <Pressable
          onPress={onLogout}
          style={styles.logoutBtn}
          hitSlop={14}
          accessibilityRole="button"
          accessibilityLabel="Se deconnecter"
        >
          <Ionicons name="log-out-outline" size={24} color={colors.tide} />
        </Pressable>
      </View>

      <GlassPanel style={styles.heroCard} contentStyle={styles.heroInner}>
        <View style={styles.heroRow}>
          <View style={styles.heroBadge}>
            <ShipIcon size={30} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Ma sortie</Text>
            <Text style={styles.heroBody}>Déclarez même sans réseau, l’envoi suivra.</Text>
          </View>
        </View>
        <GlowButton label="Enregistrer une capture" icon="fish-outline" onPress={onCaptures} />
      </GlassPanel>

      {avis ? <AvisMerCard avis={avis} /> : null}

      <View style={styles.grid}>
        <ActionTile illustration={ILLU.trajectories} title="Mon GPS" subtitle="Mes bateaux en mer" onPress={onTracking} />
        <ActionTile illustration={ILLU.captures} title="Mes captures" subtitle="Historique et envoi" onPress={onCaptures} />
        <ActionTile illustration={ILLU.abo} title="Abonnement" subtitle="Mobile Money" onPress={onAbonnement} />
        {onRedevances ? (
          <ActionTile icon="mci:receipt-text-outline" title="Redevances" subtitle="Taxe et quittances" onPress={onRedevances} />
        ) : null}
      </View>
    </ScrollView>
  );
}

const NIVEAU = {
  vert: { label: 'Mer praticable', color: '#15803d', bg: 'rgba(21, 128, 61, 0.1)', icon: 'checkmark-circle-outline' as const },
  orange: { label: 'Prudence en mer', color: '#c2410c', bg: 'rgba(194, 65, 12, 0.1)', icon: 'warning-outline' as const },
  rouge: { label: 'Sortie deconseillee', color: '#b91c1c', bg: 'rgba(185, 28, 28, 0.1)', icon: 'alert-circle-outline' as const },
};

/** Avis de mer du secteur le plus proche : niveau, conseil, conditions clés. */
function AvisMerCard({ avis }: { avis: AvisMer }) {
  const n = NIVEAU[(avis.niveau as keyof typeof NIVEAU) in NIVEAU ? (avis.niveau as keyof typeof NIVEAU) : 'vert'];
  const c = avis.secteur?.conditions;
  const facts: Array<{ icon: Parameters<typeof AppIcon>[0]['name']; text: string }> = [];
  if (c) {
    if (c.etat_mer) facts.push({ icon: 'mci:waves', text: `Mer ${c.etat_mer}` });
    if (c.houle_m != null) facts.push({ icon: 'trending-up-outline', text: `Houle ${c.houle_m.toFixed(1)} m` });
    if (c.rafales_max_24h_noeuds != null) facts.push({ icon: 'mci:weather-windy', text: `Rafales ${Math.round(c.rafales_max_24h_noeuds)} nd` });
    if (c.courant_noeuds != null) facts.push({ icon: 'swap-horizontal-outline', text: `Courant ${c.courant_noeuds.toFixed(1)} nd` });
    if (c.maree) facts.push({ icon: 'water-outline', text: `Marée ${c.maree}` });
  }
  return (
    <GlassPanel style={styles.avisCard} contentStyle={styles.avisInner}>
      <View style={styles.avisHead}>
        <View style={[styles.avisIcon, { backgroundColor: n.bg }]}>
          <Ionicons name={n.icon} size={24} color={n.color} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.avisLevel, { color: n.color }]}>{n.label}</Text>
          <Text style={styles.avisTitle} numberOfLines={1}>
            {avis.secteur?.nom ?? 'Avis de mer'}
          </Text>
        </View>
      </View>
      {facts.length ? (
        <View style={styles.facts}>
          {facts.map((f) => (
            <View key={f.text} style={styles.fact}>
              <AppIcon name={f.icon} size={14} color={colors.tide} />
              <Text style={styles.factText}>{f.text}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {avis.fleuve_proche && avis.fleuve_proche.niveau !== 'normal' ? (
        <Text style={styles.avisMeta}>{avis.fleuve_proche.conseil}</Text>
      ) : null}
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.lg,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.md,
  },
  kicker: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.tide, marginBottom: 2 },
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.abyss, letterSpacing: -0.3 },
  logoutBtn: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glassStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  heroCard: { marginBottom: space.md },
  heroInner: { gap: 14, padding: 16 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.accentGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.abyss },
  heroBody: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.inkMuted, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  avisCard: { marginBottom: space.md },
  avisInner: { gap: 10, padding: 14 },
  avisHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avisIcon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  avisLevel: { fontFamily: fonts.bodyBold, fontSize: 15 },
  avisTitle: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted, marginTop: 1 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  fact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  factText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.ink },
  avisMeta: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.tide },
});

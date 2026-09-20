import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Image, ImageSourcePropType, Pressable, StyleSheet, Text, View } from 'react-native';

import { getAvisMer, type AvisMer } from '../api';

import { GlassPanel } from '../components/GlassPanel';
import { GlowButton } from '../components/GlowButton';
import { ShipIcon } from '../components/ShipIcon';
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
    <View style={styles.container}>
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
          <Text style={styles.logoutText}>Sortir</Text>
        </Pressable>
      </View>

      <GlassPanel style={styles.heroCard} contentStyle={styles.heroInner}>
        <View style={styles.heroBadge}>
          <ShipIcon size={36} />
        </View>
        <Text style={styles.heroTitle}>Ma sortie</Text>
        <Text style={styles.heroBody}>
          Declarez vos captures meme sans reseau — l'envoi se fera automatiquement plus
          tard.
        </Text>
        <GlowButton
          label="Enregistrer une capture"
          icon="fish-outline"
          onPress={onCaptures}
          style={styles.heroCta}
        />
      </GlassPanel>

      {avis ? <AvisMerCard avis={avis} /> : null}

      <Text style={styles.sectionLabel}>Mes outils</Text>

      <ActionTile
        illustration={ILLU.trajectories}
        title="Mon GPS"
        subtitle="Position de mes bateaux en mer ou fleuve"
        onPress={onTracking}
      />
      <ActionTile
        illustration={ILLU.abo}
        title="Abonnement"
        subtitle="3000 / mois ou 30000 / an - Mobile Money"
        onPress={onAbonnement}
      />
      <ActionTile
        illustration={ILLU.captures}
        title="Mes captures"
        subtitle="Historique local et sync"
        onPress={onCaptures}
      />
    </View>
  );
}

const NIVEAU = {
  vert: { label: 'Mer praticable', color: '#15803d', bg: 'rgba(21, 128, 61, 0.1)', icon: 'checkmark-circle-outline' as const },
  orange: { label: 'Prudence en mer', color: '#c2410c', bg: 'rgba(194, 65, 12, 0.1)', icon: 'warning-outline' as const },
  rouge: { label: 'Sortie deconseillee', color: '#b91c1c', bg: 'rgba(185, 28, 28, 0.1)', icon: 'alert-circle-outline' as const },
};

/** Avis de mer du secteur le plus proche : niveau, conseil, conditions cles. */
function AvisMerCard({ avis }: { avis: AvisMer }) {
  const n = NIVEAU[(avis.niveau as keyof typeof NIVEAU) in NIVEAU ? (avis.niveau as keyof typeof NIVEAU) : 'vert'];
  const c = avis.secteur?.conditions;
  return (
    <GlassPanel style={styles.avisCard} contentStyle={styles.avisInner}>
      <View style={[styles.avisBadge, { backgroundColor: n.bg }]}>
        <Ionicons name={n.icon} size={22} color={n.color} />
        <Text style={[styles.avisLevel, { color: n.color }]}>{n.label}</Text>
      </View>
      <Text style={styles.avisTitle}>{avis.secteur?.nom ?? 'Avis de mer'}</Text>
      <Text style={styles.avisBody}>{avis.message}</Text>
      {c ? (
        <Text style={styles.avisMeta}>
          Mer {c.etat_mer}
          {c.houle_m != null ? ` · houle ${c.houle_m.toFixed(1)} m` : ''}
          {c.rafales_max_24h_noeuds != null ? ` · rafales ${Math.round(c.rafales_max_24h_noeuds)} nd` : ''}
          {c.courant_noeuds != null ? ` · courant ${c.courant_noeuds.toFixed(1)} nd` : ''}
          {c.maree ? ` · maree ${c.maree}` : ''}
        </Text>
      ) : null}
      {avis.fleuve_proche && avis.fleuve_proche.niveau !== 'normal' ? (
        <Text style={styles.avisMeta}>{avis.fleuve_proche.conseil}</Text>
      ) : null}
    </GlassPanel>
  );
}

function ActionTile({
  illustration,
  title,
  subtitle,
  onPress,
}: {
  illustration: ImageSourcePropType;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tilePress, pressed && styles.tilePressed]}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
    >
      <GlassPanel contentStyle={styles.tile}>
        <Image source={illustration} style={styles.tileArt} accessibilityIgnoresInvertColors />
        <View style={styles.tileText}>
          <Text style={styles.tileTitle}>{title}</Text>
          <Text style={styles.tileSub}>{subtitle}</Text>
        </View>
        <View style={styles.chevronWrap}>
          <Ionicons name="chevron-forward" size={22} color={colors.tide} />
        </View>
      </GlassPanel>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avisCard: {
    marginBottom: space.lg,
  },
  avisInner: {
    gap: 6,
  },
  avisBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  avisLevel: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
  },
  avisTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.ink,
  },
  avisBody: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.inkMuted,
  },
  avisMeta: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.tide,
  },
  container: {
    flex: 1,
    paddingHorizontal: space.lg,
    paddingTop: space.xl,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.lg,
  },
  kicker: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.tide,
    marginBottom: 2,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 30,
    color: colors.abyss,
    letterSpacing: -0.3,
  },
  logoutBtn: {
    minWidth: 64,
    minHeight: 56,
    paddingHorizontal: 10,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glassStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  logoutText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: colors.tide,
    marginTop: 2,
  },
  heroCard: {
    marginBottom: space.lg,
  },
  heroInner: {
    gap: 10,
  },
  heroBadge: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(37, 99, 168, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  heroTitle: {
    fontFamily: fonts.display,
    fontSize: 22,
    color: colors.abyss,
  },
  heroBody: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 24,
    color: colors.inkMuted,
    marginBottom: 6,
  },
  heroCta: {
    marginTop: 4,
  },
  sectionLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.inkMuted,
    marginBottom: space.sm,
  },
  tilePress: {
    marginBottom: 12,
  },
  tilePressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    minHeight: 72,
  },
  tileArt: {
    width: 48,
    height: 48,
    borderRadius: 14,
  },
  tileText: {
    flex: 1,
    minWidth: 0,
  },
  tileTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 17,
    color: colors.ink,
  },
  tileSub: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkMuted,
    marginTop: 3,
  },
  chevronWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(37, 99, 168, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

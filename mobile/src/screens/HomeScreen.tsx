import { Ionicons } from '@expo/vector-icons';
import { Image, ImageSourcePropType, Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassPanel } from '../components/GlassPanel';
import { GlowButton } from '../components/GlowButton';
import { ShipIcon } from '../components/ShipIcon';
import { colors, fonts, radii, space } from '../theme';

const ILLU = {
  licences: require('../../assets/illustrations/icon-licences.png'),
  captures: require('../../assets/illustrations/icon-captures.png'),
  trajectories: require('../../assets/illustrations/icon-trajectories.png'),
  search: require('../../assets/illustrations/icon-zones.png'),
} as const;

type Props = {
  userName: string;
  onCreate: () => void;
  onSearch: () => void;
  onTracking: () => void;
  onCaptures: () => void;
  onLogout: () => void;
};

/** Accueil agent de controle — dossiers, licences, GPS flotte. */
export function AgentHomeScreen({
  userName,
  onCreate,
  onSearch,
  onTracking,
  onCaptures,
  onLogout,
}: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.top}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={styles.kicker}>Espace agent</Text>
          <Text style={styles.title}>Bonjour{userName ? `, ${userName.split(' ')[0]}` : ''}</Text>
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
        <Text style={styles.heroTitle}>Terrain</Text>
        <Text style={styles.heroBody}>
          Creez un dossier pecheur, cherchez une licence, ou assistez une declaration de
          capture (hors-ligne OK).
        </Text>
        <GlowButton
          label="Nouveau dossier"
          icon="person-add-outline"
          onPress={onCreate}
          style={styles.heroCta}
        />
      </GlassPanel>

      <Text style={styles.sectionLabel}>Actions</Text>

      <ActionTile
        illustration={ILLU.search}
        title="Chercher une licence"
        subtitle="Par nom ou numero"
        onPress={onSearch}
      />
      <ActionTile
        illustration={ILLU.trajectories}
        title="Suivi GPS"
        subtitle="Flotte en mer ou sur le fleuve"
        onPress={onTracking}
      />
      <ActionTile
        illustration={ILLU.captures}
        title="Assister une capture"
        subtitle="Declaration pour un bateau suivi"
        onPress={onCaptures}
      />
    </View>
  );
}

/** @deprecated Utiliser AgentHomeScreen — alias de compat. */
export const HomeScreen = AgentHomeScreen;

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

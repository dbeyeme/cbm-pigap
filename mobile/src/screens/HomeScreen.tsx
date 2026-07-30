import { Ionicons } from '@expo/vector-icons';
import { Image, ImageSourcePropType, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { GlassPanel } from '../components/GlassPanel';
import { GlowButton } from '../components/GlowButton';
import { ShipIcon } from '../components/ShipIcon';
import { colors, fonts, motion, radii, space } from '../theme';

const ILLU = {
  licences: require('../../assets/illustrations/icon-licences.png'),
  captures: require('../../assets/illustrations/icon-captures.png'),
  trajectories: require('../../assets/illustrations/icon-trajectories.png'),
  search: require('../../assets/illustrations/icon-zones.png'),
} as const;

type Props = {
  onCreate: () => void;
  onSearch: () => void;
  onTracking: () => void;
  onCaptures: () => void;
  onLogout: () => void;
};

export function HomeScreen({
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
          <Text style={styles.title}>Bonjour</Text>
        </View>
        <Pressable
          onPress={onLogout}
          style={styles.logoutBtn}
          hitSlop={14}
          accessibilityRole="button"
          accessibilityLabel="Se déconnecter"
        >
          <Ionicons name="log-out-outline" size={24} color={colors.tide} />
          <Text style={styles.logoutText}>Sortir</Text>
        </Pressable>
      </View>

      <Animated.View entering={FadeInDown.duration(motion.base)}>
        <GlassPanel style={styles.heroCard} contentStyle={styles.heroInner}>
          <View style={styles.heroBadge}>
            <ShipIcon size={36} />
          </View>
          <Text style={styles.heroTitle}>Commencer ici</Text>
          <Text style={styles.heroBody}>
            Enregistrez une capture. Ça marche même sans internet — l’envoi se fera
            automatiquement plus tard.
          </Text>
          <GlowButton
            label="Enregistrer une capture"
            icon="fish-outline"
            onPress={onCaptures}
            style={styles.heroCta}
          />
        </GlassPanel>
      </Animated.View>

      <Text style={styles.sectionLabel}>Autres actions</Text>

      <ActionTile
        illustration={ILLU.licences}
        title="Nouveau dossier"
        subtitle="Ajouter un pêcheur et son bateau"
        onPress={onCreate}
      />
      <ActionTile
        illustration={ILLU.trajectories}
        title="Suivi GPS"
        subtitle="Voir la position en mer ou sur le fleuve"
        onPress={onTracking}
      />
      <ActionTile
        illustration={ILLU.search}
        title="Chercher une licence"
        subtitle="Par nom ou numéro"
        onPress={onSearch}
      />
    </View>
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

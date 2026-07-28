import { Ionicons } from '@expo/vector-icons';
import { Image, ImageSourcePropType, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInRight } from 'react-native-reanimated';

import { GlassPanel } from '../components/GlassPanel';
import { colors, fonts, radii, space } from '../theme';

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
        <View>
          <Text style={styles.kicker}>Agent de contrôle</Text>
          <Text style={styles.title}>Accueil</Text>
        </View>
        <Pressable onPress={onLogout} style={styles.logoutBtn} hitSlop={12}>
          <Ionicons name="log-out-outline" size={22} color={colors.ink} />
        </Pressable>
      </View>

      <GlassPanel style={styles.heroCard}>
        <Text style={styles.heroTitle}>Mission du jour</Text>
        <Text style={styles.heroBody}>
          Enregistre un pêcheur, déclare les captures hors-ligne, suis le GPS, retrouve le
          dossier par licence.
        </Text>
      </GlassPanel>

      <Animated.View entering={FadeInRight.delay(120).duration(450)}>
        <ActionTile
          illustration={ILLU.licences}
          title="Nouveau dossier"
          subtitle="Pêcheur + embarcation"
          onPress={onCreate}
        />
      </Animated.View>

      <Animated.View entering={FadeInRight.delay(160).duration(450)}>
        <ActionTile
          illustration={ILLU.captures}
          title="Captures"
          subtitle="Déclaration offline → sync"
          onPress={onCaptures}
        />
      </Animated.View>

      <Animated.View entering={FadeInRight.delay(200).duration(450)}>
        <ActionTile
          illustration={ILLU.trajectories}
          title="Suivi GPS"
          subtitle="Envoi périodique + historique"
          onPress={onTracking}
        />
      </Animated.View>

      <Animated.View entering={FadeInRight.delay(240).duration(450)}>
        <ActionTile
          illustration={ILLU.search}
          title="Recherche"
          subtitle="Nom ou n° de licence"
          onPress={onSearch}
        />
      </Animated.View>
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
    <Pressable onPress={onPress} style={styles.tilePress}>
      <GlassPanel contentStyle={styles.tile}>
        <Image source={illustration} style={styles.tileArt} accessibilityIgnoresInvertColors />
        <View style={styles.tileText}>
          <Text style={styles.tileTitle}>{title}</Text>
          <Text style={styles.tileSub}>{subtitle}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.inkMuted} />
      </GlassPanel>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: space.lg,
    paddingTop: space.xxl,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.lg,
  },
  kicker: {
    fontFamily: fonts.bodyMedium,
    color: colors.foam,
    fontSize: 13,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 36,
    color: colors.ink,
    marginTop: 2,
  },
  logoutBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  heroCard: { marginBottom: space.lg },
  heroTitle: {
    fontFamily: fonts.bodyBold,
    color: colors.ink,
    fontSize: 16,
    marginBottom: 6,
  },
  heroBody: {
    fontFamily: fonts.body,
    color: colors.inkMuted,
    lineHeight: 22,
  },
  tilePress: { marginBottom: space.md },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tileArt: {
    width: 52,
    height: 52,
    borderRadius: 14,
    marginRight: 14,
  },
  tileText: { flex: 1 },
  tileTitle: {
    fontFamily: fonts.bodyBold,
    color: colors.ink,
    fontSize: 17,
  },
  tileSub: {
    fontFamily: fonts.body,
    color: colors.inkMuted,
    marginTop: 2,
  },
});

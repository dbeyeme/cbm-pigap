import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassPanel } from '../components/GlassPanel';
import { GlowButton } from '../components/GlowButton';
import { ShipIcon } from '../components/ShipIcon';
import { ActionTile } from '../components/ui';
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
        </Pressable>
      </View>

      <GlassPanel style={styles.heroCard} contentStyle={styles.heroInner}>
        <View style={styles.heroRow}>
          <View style={styles.heroBadge}>
            <ShipIcon size={30} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Terrain</Text>
            <Text style={styles.heroBody}>Dossiers, licences et captures, même hors ligne.</Text>
          </View>
        </View>
        <GlowButton label="Nouveau dossier" icon="person-add-outline" onPress={onCreate} />
      </GlassPanel>

      <View style={styles.grid}>
        <ActionTile illustration={ILLU.search} title="Licences" subtitle="Nom ou numéro" onPress={onSearch} />
        <ActionTile illustration={ILLU.trajectories} title="Suivi GPS" subtitle="Flotte en mer" onPress={onTracking} />
        <ActionTile illustration={ILLU.captures} title="Captures" subtitle="Assister une déclaration" onPress={onCaptures} />
        <ActionTile illustration={ILLU.licences} title="Dossier" subtitle="Pêcheur et bateau" onPress={onCreate} />
      </View>
    </View>
  );
}

/** @deprecated Utiliser AgentHomeScreen — alias de compat. */
export const HomeScreen = AgentHomeScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
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
});

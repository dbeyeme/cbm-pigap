import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { GlassPanel } from '../components/GlassPanel';
import { GlowButton } from '../components/GlowButton';
import { ShipIcon } from '../components/ShipIcon';
import { ActionTile, HelpTip, PhotoBanner, type InfoPoint } from '../components/ui';
import { PHOTOS } from '../photos';
import { colors, fonts, space } from '../theme';

const ILLU = {
  captures: require('../../assets/illustrations/icon-captures.png'),
  trajectories: require('../../assets/illustrations/icon-trajectories.png'),
  search: require('../../assets/illustrations/icon-zones.png'),
} as const;

type Props = {
  userName: string;
  onCreate: () => void;
  onSearch: () => void;
  onControle: () => void;
  onTracking: () => void;
  onCaptures: () => void;
  onLogout: () => void;
};

const HELP_POINTS: ReadonlyArray<InfoPoint> = [
  { icon: 'qr-code-outline', text: 'Contrôle : lisez le QR de la carte ou de la licence d’un pêcheur pour connaître sa situation.' },
  { icon: 'person-add-outline', text: 'Nouveau dossier : enregistrez un pêcheur et son bateau ; le numéro de licence est attribué tout seul.' },
  { icon: 'search-outline', text: 'Licences : retrouvez un dossier par nom ou par numéro.' },
  { icon: 'cloud-offline-outline', text: 'Les déclarations de captures s’enregistrent sans réseau et partent au retour du réseau.' },
];

/** Accueil de l'agent de contrôle : contrôler, enregistrer, consulter. */
export function AgentHomeScreen({
  userName,
  onCreate,
  onSearch,
  onControle,
  onTracking,
  onCaptures,
  onLogout,
}: Props) {
  const first = userName.trim().split(/\s+/)[0] || '';
  return (
    <View style={styles.root}>
      <PhotoBanner
        photo={PHOTOS.port}
        kicker="Espace agent"
        title={`Bonjour${first ? `, ${first}` : ''}`}
        tall
        right={<HelpTip title="Votre espace" points={HELP_POINTS} icon="shield-checkmark-outline" onDark />}
      />
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <GlassPanel style={styles.heroCard} contentStyle={styles.heroInner}>
          <View style={styles.heroRow}>
            <View style={styles.heroBadge}>
              <ShipIcon size={30} />
            </View>
            <View style={styles.heroText}>
              <Text style={styles.heroTitle}>Terrain</Text>
              <Text style={styles.heroBody}>Contrôles, dossiers et captures, même hors ligne.</Text>
            </View>
          </View>
          <GlowButton label="Contrôler une licence" icon="qr-code-outline" onPress={onControle} />
        </GlassPanel>

        <View style={styles.grid}>
          <ActionTile icon="person-add-outline" title="Nouveau dossier" subtitle="Pêcheur et bateau" onPress={onCreate} />
          <ActionTile illustration={ILLU.search} title="Licences" subtitle="Nom ou numéro" onPress={onSearch} />
          <ActionTile illustration={ILLU.trajectories} title="Suivi GPS" subtitle="Flotte en mer" onPress={onTracking} />
          <ActionTile illustration={ILLU.captures} title="Captures" subtitle="Assister une déclaration" onPress={onCaptures} />
        </View>

        <GlowButton
          label="Se déconnecter"
          icon="log-out-outline"
          variant="ghost"
          onPress={onLogout}
          style={styles.logout}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: {
    paddingHorizontal: space.lg,
    paddingTop: 4,
    paddingBottom: space.xl,
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
  heroText: { flex: 1, minWidth: 0 },
  heroTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.abyss },
  heroBody: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: colors.inkMuted, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  logout: { marginTop: space.lg },
});

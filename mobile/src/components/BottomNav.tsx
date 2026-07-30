import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radii, space } from '../theme';

const ICONS = {
  home: require('../../assets/illustrations/icon-dashboard.png'),
  captures: require('../../assets/illustrations/icon-captures.png'),
  tracking: require('../../assets/illustrations/icon-trajectories.png'),
  search: require('../../assets/illustrations/icon-licences.png'),
} as const;

export type MobileTab = 'home' | 'captures' | 'tracking' | 'search';

type Props = {
  active: MobileTab;
  onChange: (tab: MobileTab) => void;
};

const TABS: Array<{ id: MobileTab; label: string; icon: keyof typeof ICONS }> = [
  { id: 'home', label: 'Accueil', icon: 'home' },
  { id: 'captures', label: 'Captures', icon: 'captures' },
  { id: 'tracking', label: 'GPS', icon: 'tracking' },
  { id: 'search', label: 'Licences', icon: 'search' },
];

/** Barre basse — libellés visibles, grandes cibles tactiles. */
export function BottomNav({ active, onChange }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {TABS.map((tab) => {
        const on = active === tab.id;
        return (
          <Pressable
            key={tab.id}
            onPress={() => onChange(tab.id)}
            style={[styles.btn, on && styles.btnOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={tab.label}
          >
            <Image source={ICONS[tab.icon]} style={styles.icon} />
            <Text style={[styles.label, on && styles.labelOn]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    bottom: space.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
    paddingHorizontal: 6,
    paddingTop: 10,
    borderRadius: radii.lg,
    backgroundColor: colors.glassStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    shadowColor: colors.abyss,
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  btn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    minHeight: 58,
    borderRadius: radii.md,
  },
  btnOn: {
    backgroundColor: 'rgba(37, 99, 168, 0.12)',
  },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    marginBottom: 4,
  },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.inkSoft,
  },
  labelOn: {
    color: colors.tide,
    fontFamily: fonts.bodyBold,
  },
});

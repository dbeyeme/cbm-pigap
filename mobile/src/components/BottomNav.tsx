import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radii, space } from '../theme';

const ICONS = {
  home: require('../../assets/illustrations/icon-dashboard.png'),
  captures: require('../../assets/illustrations/icon-captures.png'),
  tracking: require('../../assets/illustrations/icon-trajectories.png'),
  search: require('../../assets/illustrations/icon-licences.png'),
  alertes: require('../../assets/illustrations/icon-alertes.png'),
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

/** Barre basse façon command-center — glass + accent or. */
export function BottomNav({ active, onChange }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {TABS.map((tab) => {
        const on = active === tab.id;
        return (
          <Pressable
            key={tab.id}
            onPress={() => onChange(tab.id)}
            style={[styles.btn, on && styles.btnOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
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
    gap: 6,
    paddingHorizontal: 8,
    paddingTop: 8,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(8, 14, 20, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(240, 199, 94, 0.28)',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  btn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: radii.md,
  },
  btnOn: {
    backgroundColor: 'rgba(240, 199, 94, 0.16)',
  },
  icon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    marginBottom: 4,
  },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    color: colors.inkSoft,
  },
  labelOn: {
    color: colors.accent,
  },
});

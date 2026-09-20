import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RoleTab } from '../auth/roles';
import { colors, fonts, radii, space } from '../theme';

const ICONS = {
  home: require('../../assets/illustrations/icon-dashboard.png'),
  captures: require('../../assets/illustrations/icon-captures.png'),
  tracking: require('../../assets/illustrations/icon-trajectories.png'),
  search: require('../../assets/illustrations/icon-licences.png'),
  abonnement: require('../../assets/illustrations/icon-licences.png'),
} as const;

export type MobileTab = RoleTab;

type TabDef = { id: MobileTab; label: string };

type Props = {
  active: MobileTab;
  tabs: TabDef[];
  onChange: (tab: MobileTab) => void;
};

/** Barre basse — onglets fournis selon le role (pecheur / agent). */
export function BottomNav({ active, tabs, onChange }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {tabs.map((tab) => {
        const on = active === tab.id;
        const iconKey = tab.id in ICONS ? (tab.id as keyof typeof ICONS) : 'home';
        return (
          <Pressable
            key={tab.id}
            onPress={() => onChange(tab.id)}
            style={[styles.btn, on && styles.btnOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={tab.label}
          >
            <Image source={ICONS[iconKey]} style={styles.icon} />
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

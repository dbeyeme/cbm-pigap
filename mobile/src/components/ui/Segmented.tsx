import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { colors, fonts, radii } from '../../theme';
import { AppIcon, type IconName } from './AppIcon';

export type SegmentOption<T extends string> = {
  id: T;
  label: string;
  icon?: IconName;
  /** Compteur affiché à droite du libellé. */
  badge?: number;
};

type Props<T extends string> = {
  options: ReadonlyArray<SegmentOption<T>>;
  value: T;
  onChange: (id: T) => void;
  style?: ViewStyle;
};

/** Sélecteur à segments : bascule entre vues sans empiler l'écran. */
export function Segmented<T extends string>({ options, value, onChange, style }: Props<T>) {
  // Au-delà de trois options, icône au-dessus du libellé pour ne rien tronquer.
  const stacked = options.length > 3;
  return (
    <View style={[styles.wrap, style]}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            onPress={() => onChange(o.id)}
            style={[styles.seg, stacked && styles.segStacked, on && styles.on]}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
          >
            {o.icon ? (
              <AppIcon name={o.icon} size={stacked ? 18 : 16} color={on ? '#F8FAFC' : colors.inkMuted} />
            ) : null}
            <Text
              style={[styles.text, stacked && styles.textStacked, on && styles.textOn]}
              numberOfLines={1}
              adjustsFontSizeToFit={stacked}
              minimumFontScale={0.8}
            >
              {o.label}
            </Text>
            {o.badge ? (
              <View style={[styles.badge, on && styles.badgeOn]}>
                <Text style={[styles.badgeText, on && styles.badgeTextOn]}>{o.badge}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    padding: 4,
    gap: 4,
    borderRadius: radii.md,
    backgroundColor: 'rgba(15, 40, 70, 0.07)',
  },
  seg: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 42,
    paddingHorizontal: 8,
    borderRadius: radii.sm,
  },
  segStacked: { flexDirection: 'column', gap: 3, minHeight: 56, paddingHorizontal: 4 },
  on: { backgroundColor: colors.tide },
  text: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.inkMuted },
  textStacked: { fontSize: 12 },
  textOn: { color: '#F8FAFC', fontFamily: fonts.bodyBold },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(180, 83, 9, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeOn: { backgroundColor: 'rgba(255,255,255,0.22)' },
  badgeText: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.warn },
  badgeTextOn: { color: '#F8FAFC' },
});

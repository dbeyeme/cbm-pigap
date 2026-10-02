import type { ReactNode } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';

import { colors, fonts, radii, tones, type Tone } from '../../theme';
import { AppIcon, type IconName } from './AppIcon';

type TileProps = {
  icon: IconName;
  value: string | number;
  label: string;
  tone?: Tone;
  style?: ViewStyle;
};

/** Chiffre clé : icône, valeur, libellé court. Remplace une phrase. */
export function StatTile({ icon, value, label, tone = 'info', style }: TileProps) {
  const t = tones[tone];
  return (
    <View style={[styles.tile, style]}>
      <View style={[styles.icon, { backgroundColor: t.bg }]}>
        <AppIcon name={icon} size={16} color={t.fg} />
      </View>
      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

/** Rangée de tuiles de même largeur. */
export function StatRow({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  tile: {
    flex: 1,
    minWidth: 0,
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    gap: 6,
  },
  icon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: colors.abyss,
  },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkMuted,
  },
});

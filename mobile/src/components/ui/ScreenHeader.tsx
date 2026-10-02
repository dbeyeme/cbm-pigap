import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radii, space } from '../../theme';

type Props = {
  kicker?: string;
  title: string;
  onBack?: () => void;
  /** Élément à droite (indicateur, bouton). */
  right?: ReactNode;
};

/** En-tête d'écran unique : retour, surtitre, titre, action droite. */
export function ScreenHeader({ kicker, title, onBack, right }: Props) {
  return (
    <View style={styles.row}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          style={styles.back}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <Ionicons name="chevron-back" size={24} color={colors.tide} />
        </Pressable>
      ) : null}
      <View style={styles.titles}>
        {kicker ? <Text style={styles.kicker}>{kicker}</Text> : null}
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  back: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glassStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  titles: { flex: 1, minWidth: 0 },
  kicker: {
    fontFamily: fonts.bodyMedium,
    color: colors.tide,
    fontSize: 13,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 26,
    color: colors.abyss,
    letterSpacing: -0.3,
  },
  right: { marginLeft: 4 },
});

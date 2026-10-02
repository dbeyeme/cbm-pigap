import { Ionicons } from '@expo/vector-icons';
import { Image, ImageSourcePropType, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { colors, fonts, radii } from '../../theme';
import { AppIcon, type IconName } from './AppIcon';

type Props = {
  title: string;
  /** Illustration PNG du projet, sinon icône vectorielle. */
  illustration?: ImageSourcePropType;
  icon?: IconName;
  subtitle?: string;
  onPress: () => void;
  /** Pastille d'information (compteur, état). */
  badge?: string;
  style?: ViewStyle;
};

/** Tuile d'accueil en grille : illustration, titre court, sous-titre optionnel. */
export function ActionTile({ title, illustration, icon, subtitle, onPress, badge, style }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed, style]}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
    >
      <View style={styles.head}>
        {illustration ? (
          <Image source={illustration} style={styles.art} accessibilityIgnoresInvertColors />
        ) : (
          <View style={styles.iconWrap}>
            <AppIcon name={icon ?? 'apps-outline'} size={24} color={colors.tide} />
          </View>
        )}
        {badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={18} color={colors.inkSoft} />
        )}
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={styles.sub} numberOfLines={2}>
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 124,
    padding: 14,
    borderRadius: radii.lg,
    backgroundColor: colors.glassStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    shadowColor: colors.abyss,
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
    gap: 4,
  },
  pressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  art: { width: 44, height: 44, borderRadius: 13 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: colors.accentGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    paddingHorizontal: 8,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(180, 83, 9, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.warn },
  title: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink },
  sub: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.inkMuted },
});

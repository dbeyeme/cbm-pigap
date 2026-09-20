import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { colors, fonts, gradients, radii } from '../theme';

type Props = {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: 'primary' | 'ghost' | 'accent';
  loading?: boolean;
  style?: ViewStyle;
  disabled?: boolean;
};

/** Bouton sans Reanimated — stable sur Expo Go / simulateur / device. */
export function GlowButton({
  label,
  onPress,
  icon,
  variant = 'primary',
  loading,
  style,
  disabled,
}: Props) {
  const content = (
    <>
      {icon ? (
        <Ionicons
          name={icon}
          size={18}
          color={variant === 'ghost' ? colors.tide : '#F8FAFC'}
          style={{ marginRight: 8 }}
        />
      ) : null}
      <Text
        style={[
          styles.label,
          variant === 'ghost' && styles.labelGhost,
          variant === 'accent' && styles.labelAccent,
        ]}
      >
        {loading ? '...' : label}
      </Text>
    </>
  );

  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [style, pressed && styles.pressed]}
    >
      {variant === 'ghost' ? (
        <View style={styles.ghost}>{content}</View>
      ) : (
        <LinearGradient
          colors={
            variant === 'accent' ? [...gradients.accent] : [...gradients.button]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.primary}
        >
          {content}
        </LinearGradient>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
  primary: {
    minHeight: 58,
    borderRadius: radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    shadowColor: colors.abyss,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  ghost: {
    minHeight: 58,
    borderRadius: radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderWidth: 1.5,
    borderColor: colors.glassBorder,
    backgroundColor: colors.glassStrong,
  },
  label: {
    fontFamily: fonts.bodyBold,
    fontSize: 17,
    color: '#F8FAFC',
  },
  labelGhost: {
    color: colors.tide,
  },
  labelAccent: {
    color: '#F8FAFC',
  },
});

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { colors, fonts, gradients, radii } from '../theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: 'primary' | 'ghost' | 'accent';
  loading?: boolean;
  style?: ViewStyle;
  disabled?: boolean;
};

export function GlowButton({
  label,
  onPress,
  icon,
  variant = 'primary',
  loading,
  style,
  disabled,
}: Props) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const content = (
    <>
      {icon ? (
        <Ionicons
          name={icon}
          size={18}
          color={variant === 'ghost' ? colors.foam : colors.abyss}
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
        {loading ? '…' : label}
      </Text>
    </>
  );

  return (
    <AnimatedPressable
      disabled={disabled || loading}
      onPressIn={() => {
        scale.value = withSpring(0.96, { damping: 14, stiffness: 320 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 12, stiffness: 280 });
      }}
      onPress={onPress}
      style={[animated, style]}
    >
      {variant === 'ghost' ? (
        <Animated.View style={styles.ghost}>{content}</Animated.View>
      ) : (
        <LinearGradient
          colors={
            variant === 'accent'
              ? [...gradients.accent]
              : [...gradients.button]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.primary}
        >
          {content}
        </LinearGradient>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  primary: {
    minHeight: 54,
    borderRadius: radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  ghost: {
    minHeight: 54,
    borderRadius: radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderWidth: 1.5,
    borderColor: colors.glassBorder,
    backgroundColor: colors.glass,
  },
  label: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.ink,
  },
  labelGhost: {
    color: colors.foam,
  },
  labelAccent: {
    color: colors.abyss,
  },
});

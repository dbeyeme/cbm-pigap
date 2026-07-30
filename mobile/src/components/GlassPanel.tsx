import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { PropsWithChildren } from 'react';
import { Platform, StyleSheet, View, ViewStyle } from 'react-native';

import { colors, gradients, radii } from '../theme';

type Props = PropsWithChildren<{
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  intensity?: number;
}>;

/**
 * Glassmorphisme soft : carte givrée lisible.
 * Opaque assez pour la lecture terrain (soleil / écran usé).
 */
export function GlassPanel({ children, style, contentStyle, intensity = 28 }: Props) {
  return (
    <View style={[styles.wrap, style]}>
      {Platform.OS === 'ios' ? (
        <BlurView intensity={intensity} tint="light" style={StyleSheet.absoluteFill} />
      ) : null}
      <LinearGradient
        colors={[...gradients.glass]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.shine} pointerEvents="none" />
      <View style={[styles.inner, contentStyle]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.glassStrong,
    shadowColor: colors.abyss,
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  shine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors.shine,
    opacity: 0.9,
  },
  inner: {
    padding: 20,
  },
});

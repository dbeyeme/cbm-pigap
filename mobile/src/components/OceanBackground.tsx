import { LinearGradient } from 'expo-linear-gradient';
import { PropsWithChildren, useEffect } from 'react';
import { ImageBackground, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { gradients } from '../theme';

const heroLocal = require('../../assets/illustrations/landing-hero-gabon.png');

/** Fond côtier local (hero Gabon) + voile océan animé. */
export function OceanBackground({ children }: PropsWithChildren) {
  const drift = useSharedValue(0);

  useEffect(() => {
    drift.value = withRepeat(
      withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [drift]);

  const orbA = useAnimatedStyle(() => ({
    transform: [
      { translateX: drift.value * 28 },
      { translateY: drift.value * -18 },
      { scale: 1 + drift.value * 0.08 },
    ],
    opacity: 0.22 + drift.value * 0.12,
  }));

  const orbB = useAnimatedStyle(() => ({
    transform: [
      { translateX: drift.value * -22 },
      { translateY: drift.value * 24 },
    ],
    opacity: 0.16 + (1 - drift.value) * 0.14,
  }));

  return (
    <View style={styles.root}>
      <ImageBackground
        source={heroLocal}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        imageStyle={styles.heroImage}
      >
        <LinearGradient colors={[...gradients.ocean]} style={[StyleSheet.absoluteFill, styles.veil]} />
        <Animated.View style={[styles.orb, styles.orbTeal, orbA]} />
        <Animated.View style={[styles.orb, styles.orbGold, orbB]} />
        <View style={styles.haze} />
      </ImageBackground>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#021A22' },
  heroImage: { opacity: 0.55 },
  veil: { opacity: 0.82 },
  orb: {
    position: 'absolute',
    borderRadius: 999,
  },
  orbTeal: {
    width: 280,
    height: 280,
    top: -40,
    right: -60,
    backgroundColor: '#1A8A9A',
  },
  orbGold: {
    width: 220,
    height: 220,
    bottom: 80,
    left: -70,
    backgroundColor: '#F0C75E',
  },
  haze: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(2, 26, 34, 0.42)',
  },
});

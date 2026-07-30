import { LinearGradient } from 'expo-linear-gradient';
import { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, gradients } from '../theme';

/** Fond clair calme — pas d’orbes animés (moins de distraction). */
export function OceanBackground({ children }: PropsWithChildren) {
  return (
    <View style={styles.root}>
      <LinearGradient colors={[...gradients.ocean]} style={StyleSheet.absoluteFill} />
      <View style={styles.softGlow} pointerEvents="none" />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  softGlow: {
    position: 'absolute',
    top: -80,
    right: -40,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(37, 99, 168, 0.08)',
  },
});

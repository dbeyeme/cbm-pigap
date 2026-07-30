import { PropsWithChildren } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { motion } from '../theme';

type Props = PropsWithChildren<{
  screenKey: string;
}>;

/** Transition douce — fade simple, sans bounce qui déroute. */
export function ScreenTransition({ children, screenKey }: Props) {
  return (
    <Animated.View
      key={screenKey}
      entering={FadeIn.duration(motion.base)}
      exiting={FadeOut.duration(motion.fast)}
      style={styles.fill}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});

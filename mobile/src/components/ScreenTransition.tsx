import { PropsWithChildren } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';

type Props = PropsWithChildren<{
  screenKey: string;
}>;

/** Entrée / sortie douce entre écrans. */
export function ScreenTransition({ children, screenKey }: Props) {
  return (
    <Animated.View
      key={screenKey}
      entering={FadeInDown.duration(420).springify().damping(18)}
      exiting={FadeOutUp.duration(220)}
      style={styles.fill}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});

import { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

type Props = PropsWithChildren<{
  screenKey: string;
}>;

/** Conteneur d'ecran sans animation native (evite crash Reanimated / worklets). */
export function ScreenTransition({ children }: Props) {
  return <View style={styles.fill}>{children}</View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});

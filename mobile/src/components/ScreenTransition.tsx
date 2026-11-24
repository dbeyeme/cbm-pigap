import { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

type Props = PropsWithChildren<{
  screenKey: string;
}>;

/** Conteneur d'écran sans animation native : aucun risque de fermeture inattendue. */
export function ScreenTransition({ children }: Props) {
  return <View style={styles.fill}>{children}</View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});

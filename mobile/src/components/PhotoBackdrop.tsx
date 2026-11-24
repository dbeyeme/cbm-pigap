import { LinearGradient } from 'expo-linear-gradient';
import type { PropsWithChildren } from 'react';
import { Image, ImageSourcePropType, StyleSheet, View } from 'react-native';

import { colors } from '../theme';

type Props = PropsWithChildren<{ photo: ImageSourcePropType }>;

/**
 * Arrière-plan photographique de la bienvenue et de la connexion. La
 * photographie occupe le haut de l'écran dans son format d'origine, puis se
 * fond dans un bleu nuit uni : le texte se lit en blanc sur fond sombre, les
 * champs de saisie restent sur un panneau blanc opaque.
 */
export function PhotoBackdrop({ photo, children }: Props) {
  return (
    <View style={styles.root}>
      <Image source={photo} style={styles.photo} resizeMode="cover" accessibilityIgnoresInvertColors />
      <LinearGradient
        colors={['rgba(11, 31, 58, 0.38)', 'rgba(11, 31, 58, 0.72)', colors.abyss]}
        locations={[0, 0.6, 1]}
        style={styles.photo}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.abyss },
  // Format proche de celui de la photographie : elle n'est pas agrandie à l'excès
  photo: { position: 'absolute', top: 0, left: 0, right: 0, height: 300 },
});

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { ImageBackground, ImageSourcePropType, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radii, space } from '../../theme';

type Props = {
  photo: ImageSourcePropType;
  kicker?: string;
  title: string;
  onBack?: () => void;
  /** Élément à droite (aide, indicateur, déconnexion). */
  right?: ReactNode;
  /** Bannière plus haute pour les écrans d'accueil. */
  tall?: boolean;
};

/**
 * En-tête photographique des écrans principaux. Un voile bleu nuit, presque
 * opaque sous le texte, garde le titre lisible en plein soleil ; la
 * photographie n'apparaît vraiment que sur la droite.
 */
export function PhotoBanner({ photo, kicker, title, onBack, right, tall }: Props) {
  return (
    <View style={styles.wrap}>
      <ImageBackground
        source={photo}
        style={[styles.banner, tall && styles.tall]}
        imageStyle={styles.image}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      >
        <LinearGradient
          colors={['rgba(11, 31, 58, 0.94)', 'rgba(11, 31, 58, 0.80)', 'rgba(11, 31, 58, 0.34)']}
          locations={[0, 0.55, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.veil}
        />
        <View style={styles.row}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              style={({ pressed }) => [styles.back, pressed && styles.pressed]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Retour"
            >
              <Ionicons name="chevron-back" size={24} color="#F8FAFC" />
            </Pressable>
          ) : null}
          <View style={styles.titles}>
            {kicker ? (
              <Text style={styles.kicker} numberOfLines={1}>
                {kicker}
              </Text>
            ) : null}
            <Text
              style={styles.title}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              accessibilityRole="header"
            >
              {title}
            </Text>
          </View>
          {right ? <View style={styles.right}>{right}</View> : null}
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm },
  banner: {
    minHeight: 92,
    borderRadius: radii.lg,
    overflow: 'hidden',
    justifyContent: 'center',
    backgroundColor: colors.abyss,
  },
  tall: { minHeight: 116 },
  image: { borderRadius: radii.lg },
  veil: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  back: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.42)',
  },
  pressed: { opacity: 0.75 },
  titles: { flex: 1, minWidth: 0 },
  kicker: { fontFamily: fonts.bodyMedium, fontSize: 14, color: '#D6E6F5', marginBottom: 2 },
  title: { fontFamily: fonts.display, fontSize: 26, color: '#FFFFFF', letterSpacing: -0.3 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});

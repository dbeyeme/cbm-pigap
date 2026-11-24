import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { colors, fonts } from '../../theme';
import type { IconName } from './AppIcon';
import { InfoSheet, type InfoPoint } from './InfoSheet';

type Props = {
  /** Titre de l'aide, repris par les lecteurs d'écran : « Aide : … ». */
  title: string;
  points: ReadonlyArray<InfoPoint>;
  icon?: IconName;
  /** Libellé affiché à côté du « ? » ; sans lui, le bouton reste discret. */
  label?: string;
  /** Pastille claire, à poser sur une photographie ou un fond sombre. */
  onDark?: boolean;
  style?: ViewStyle;
};

/**
 * Aide contextuelle : un « ? » discret qui ouvre quelques lignes d'explication.
 * Seul composant d'aide de l'application ; jamais de paragraphe permanent.
 */
export function HelpTip({ title, points, icon = 'help-circle-outline', label, onDark, style }: Props) {
  const [open, setOpen] = useState(false);
  const tint = onDark ? '#F8FAFC' : colors.tide;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={10}
        style={({ pressed }) => [styles.button, label ? styles.withLabel : null, pressed && styles.pressed, style]}
        accessibilityRole="button"
        accessibilityLabel={`Aide : ${title}`}
      >
        <View style={[styles.dot, onDark ? styles.dotDark : null]}>
          <Ionicons name="help" size={18} color={tint} />
        </View>
        {label ? <Text style={[styles.label, { color: tint }]}>{label}</Text> : null}
      </Pressable>
      <InfoSheet visible={open} onClose={() => setOpen(false)} title={title} icon={icon} points={points} />
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  withLabel: { flexDirection: 'row', gap: 8, justifyContent: 'flex-start', alignSelf: 'flex-start' },
  dot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(37, 99, 168, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(30, 77, 123, 0.22)',
  },
  dotDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  label: { fontFamily: fonts.bodyMedium, fontSize: 16 },
  pressed: { opacity: 0.7 },
});

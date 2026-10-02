import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

import { colors, fonts, radii } from '../../theme';
import { AppIcon, type IconName } from './AppIcon';

type Props = {
  label: string;
  on: boolean;
  onPress: () => void;
  icon?: IconName;
  /** Bord rouge : élément à manipuler avec attention (espèce protégée). */
  alert?: boolean;
  /** Case à cocher (sélection multiple) plutôt que choix unique. */
  multi?: boolean;
  style?: ViewStyle;
};

/** Pastille sélectionnable avec icône ; coche visible quand active. */
export function Chip({ label, on, onPress, icon, alert, multi, style }: Props) {
  const fg = on ? '#F8FAFC' : alert ? colors.danger : colors.tide;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        on && styles.on,
        alert && !on && styles.alert,
        alert && on && styles.alertOn,
        pressed && styles.pressed,
        style,
      ]}
      accessibilityRole={multi ? 'checkbox' : 'button'}
      accessibilityState={multi ? { checked: on } : { selected: on }}
    >
      {on ? (
        <Ionicons name="checkmark-circle" size={16} color="#F8FAFC" />
      ) : icon ? (
        <AppIcon name={icon} size={16} color={fg} />
      ) : null}
      <Text style={[styles.text, on && styles.textOn]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    minHeight: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.glassBorder,
  },
  on: { backgroundColor: colors.tide, borderColor: colors.tide },
  alert: { borderColor: 'rgba(185, 28, 28, 0.45)' },
  alertOn: { backgroundColor: colors.danger, borderColor: colors.danger },
  pressed: { opacity: 0.85 },
  text: { fontFamily: fonts.bodyMedium, color: colors.ink, fontSize: 15 },
  textOn: { color: '#F8FAFC', fontFamily: fonts.bodyBold },
});

import { StyleSheet, Text, View, ViewStyle } from 'react-native';

import { fonts, radii, tones, type Tone } from '../../theme';
import { AppIcon, type IconName } from './AppIcon';

const DEFAULT_ICON: Record<Tone, IconName> = {
  info: 'information-circle',
  ok: 'checkmark-circle',
  warn: 'warning',
  error: 'alert-circle',
  muted: 'ellipse-outline',
};

type Props = {
  tone?: Tone;
  text: string;
  icon?: IconName;
  style?: ViewStyle;
};

/** Message d'état compact : une icône, une ligne ou deux. */
export function Notice({ tone = 'info', text, icon, style }: Props) {
  const t = tones[tone];
  return (
    <View style={[styles.box, { backgroundColor: t.bg }, style]} accessibilityLiveRegion="polite">
      <AppIcon name={icon ?? DEFAULT_ICON[tone]} size={18} color={t.fg} />
      <Text style={[styles.text, { color: t.fg }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: radii.sm,
    marginTop: 10,
  },
  text: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
  },
});

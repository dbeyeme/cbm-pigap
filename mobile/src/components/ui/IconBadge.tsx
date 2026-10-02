import { StyleSheet, View, ViewStyle } from 'react-native';

import { colors, tones, type Tone } from '../../theme';
import { AppIcon, type IconName } from './AppIcon';

type Props = {
  icon: IconName;
  tone?: Tone;
  /** Fond plein coloré (icône blanche) au lieu du fond teinté. */
  solid?: boolean;
  size?: number;
  style?: ViewStyle;
};

/** Pastille carrée arrondie portant une icône : repère visuel des lignes et tuiles. */
export function IconBadge({ icon, tone = 'info', solid, size = 40, style }: Props) {
  const t = tones[tone];
  return (
    <View
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: size * 0.3 },
        { backgroundColor: solid ? t.fg : t.bg },
        style,
      ]}
    >
      <AppIcon name={icon} size={Math.round(size * 0.5)} color={solid ? '#F8FAFC' : t.fg} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentGlow,
  },
});

import { StyleSheet, Text, View, ViewStyle } from 'react-native';

import { colors, fonts } from '../../theme';
import { AppIcon, type IconName } from './AppIcon';

type Props = { icon?: IconName; text: string; style?: ViewStyle };

/** Titre de section avec icône, remplace les intertitres textuels. */
export function SectionTitle({ icon, text, style }: Props) {
  return (
    <View style={[styles.row, style]}>
      {icon ? <AppIcon name={icon} size={16} color={colors.tide} /> : null}
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10, marginTop: 6 },
  text: { fontFamily: fonts.bodyBold, color: colors.abyss, fontSize: 15 },
});

import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

import { colors, fonts, radii, space } from '../theme';

type Props = TextInputProps & {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
};

export function GlassField({ label, icon, style, ...rest }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.field}>
        {icon ? (
          <Ionicons name={icon} size={20} color={colors.tide} style={styles.icon} />
        ) : null}
        <TextInput
          placeholderTextColor={colors.inkSoft}
          style={[styles.input, style]}
          {...rest}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: space.md },
  label: {
    fontFamily: fonts.bodyBold,
    color: colors.inkMuted,
    fontSize: 15,
    marginBottom: 8,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.glassBorder,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    minHeight: 56,
  },
  icon: { marginRight: 10 },
  input: {
    flex: 1,
    color: colors.ink,
    fontFamily: fonts.body,
    fontSize: 17,
    paddingVertical: 14,
  },
});

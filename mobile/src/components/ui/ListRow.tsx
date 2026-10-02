import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { colors, fonts, radii, type Tone } from '../../theme';
import type { IconName } from './AppIcon';
import { IconBadge } from './IconBadge';

type Props = {
  icon: IconName;
  tone?: Tone;
  solid?: boolean;
  title: string;
  meta?: string;
  right?: ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
};

/** Ligne de liste légère : pastille icône, titre, une ligne de détail, action droite. */
export function ListRow({ icon, tone = 'info', solid, title, meta, right, onPress, style }: Props) {
  const body = (
    <>
      <IconBadge icon={icon} tone={tone} solid={solid} size={40} />
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {meta ? (
          <Text style={styles.meta} numberOfLines={2}>
            {meta}
          </Text>
        ) : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={20} color={colors.inkSoft} /> : null)}
    </>
  );
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.row, pressed && styles.pressed, style]}
        accessibilityRole="button"
        accessibilityLabel={meta ? `${title}. ${meta}` : title}
      >
        {body}
      </Pressable>
    );
  }
  return <View style={[styles.row, style]}>{body}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 60,
    borderRadius: radii.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    marginBottom: 8,
  },
  pressed: { opacity: 0.88 },
  text: { flex: 1, minWidth: 0 },
  title: { fontFamily: fonts.bodyBold, color: colors.ink, fontSize: 15 },
  meta: { fontFamily: fonts.body, color: colors.inkMuted, fontSize: 13, marginTop: 2, lineHeight: 18 },
});

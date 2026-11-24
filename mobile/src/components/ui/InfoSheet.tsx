import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radii, space } from '../../theme';
import { AppIcon, type IconName } from './AppIcon';
import { IconBadge } from './IconBadge';
import { useReducedMotion } from './useReducedMotion';

export type InfoPoint = { icon: IconName; text: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  icon?: IconName;
  /** Quelques lignes courtes, chacune avec son repère visuel. */
  points: ReadonlyArray<InfoPoint>;
  /** Libellé du bouton de fermeture quand aucune action n'est proposée. */
  closeLabel?: string;
  /** Actions propres à la feuille (confirmation, refus) ; remplacent le bouton de fermeture. */
  actions?: ReactNode;
};

/**
 * Feuille d'information qui monte du bas de l'écran : aide contextuelle,
 * explication avant une demande d'autorisation. Jamais affichée d'office.
 */
export function InfoSheet({ visible, onClose, title, icon, points, closeLabel, actions }: Props) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType={reducedMotion ? 'none' : 'slide'}
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Fermer"
        />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.md) + 4 }]}>
          <View style={styles.handle} />
          <View style={styles.head}>
            {icon ? <IconBadge icon={icon} size={44} /> : null}
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
          </View>
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyInner}>
            {points.map((point) => (
              <View key={point.text} style={styles.point}>
                <AppIcon name={point.icon} size={20} color={colors.tide} style={styles.pointIcon} />
                <Text style={styles.pointText}>{point.text}</Text>
              </View>
            ))}
          </ScrollView>
          <View style={styles.actions}>
            {actions ?? (
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [styles.close, pressed && styles.pressed]}
                accessibilityRole="button"
              >
                <AppIcon name="checkmark" size={18} color={colors.tide} />
                <Text style={styles.closeText}>{closeLabel ?? 'J’ai compris'}</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(11, 31, 58, 0.55)',
  },
  sheet: {
    maxHeight: '86%',
    backgroundColor: colors.card,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: space.lg,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.glassBorder,
    marginBottom: 14,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  title: { flex: 1, fontFamily: fonts.display, fontSize: 22, lineHeight: 28, color: colors.abyss },
  body: { flexGrow: 0 },
  bodyInner: { gap: 14, paddingBottom: 6 },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  pointIcon: { marginTop: 2, width: 22, textAlign: 'center' },
  pointText: { flex: 1, fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: colors.ink },
  actions: { marginTop: space.md, gap: 10 },
  close: {
    minHeight: 54,
    borderRadius: radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: colors.glassBorder,
    backgroundColor: colors.surface,
  },
  closeText: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.tide },
  pressed: { opacity: 0.88 },
});

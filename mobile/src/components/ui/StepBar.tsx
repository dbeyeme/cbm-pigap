import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../../theme';
import { AppIcon, type IconName } from './AppIcon';

export type Step = { label: string; icon: IconName };

type Props = {
  steps: ReadonlyArray<Step>;
  current: number;
  /** Étapes déjà remplies : accessibles d'un geste. */
  onSelect?: (index: number) => void;
};

/** Fil d'étapes : une pastille par étape, coche quand elle est passée. */
export function StepBar({ steps, current, onSelect }: Props) {
  return (
    <View style={styles.row}>
      {steps.map((s, i) => {
        const done = i < current;
        const on = i === current;
        return (
          <Pressable
            key={s.label}
            onPress={() => (done && onSelect ? onSelect(i) : undefined)}
            disabled={!done || !onSelect}
            style={styles.step}
            accessibilityRole="button"
            accessibilityLabel={`Étape ${i + 1} : ${s.label}`}
            accessibilityState={{ selected: on }}
          >
            <View style={[styles.dot, on && styles.dotOn, done && styles.dotDone]}>
              {done ? (
                <Ionicons name="checkmark" size={16} color="#F8FAFC" />
              ) : (
                <AppIcon name={s.icon} size={16} color={on ? '#F8FAFC' : colors.inkSoft} />
              )}
            </View>
            <Text style={[styles.label, on && styles.labelOn]} numberOfLines={1}>
              {s.label}
            </Text>
            {i < steps.length - 1 ? (
              <View style={[styles.line, done && styles.lineDone]} pointerEvents="none" />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginBottom: 14 },
  step: { flex: 1, alignItems: 'center', gap: 5 },
  dot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.glassBorder,
    zIndex: 1,
  },
  dotOn: { backgroundColor: colors.tide, borderColor: colors.tide },
  dotDone: { backgroundColor: colors.success, borderColor: colors.success },
  label: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.inkSoft },
  labelOn: { color: colors.tide, fontFamily: fonts.bodyBold },
  line: {
    position: 'absolute',
    top: 16,
    left: '50%',
    right: '-50%',
    height: 2,
    backgroundColor: colors.glassBorder,
  },
  lineDone: { backgroundColor: colors.success },
});

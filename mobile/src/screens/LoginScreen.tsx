import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { login } from '../api';
import { GlassField } from '../components/GlassField';
import { GlassPanel } from '../components/GlassPanel';
import { GlowButton } from '../components/GlowButton';
import { colors, fonts, space } from '../theme';

type Props = {
  onLoggedIn: (token: string) => void;
};

export function LoginScreen({ onLoggedIn }: Props) {
  const [email, setEmail] = useState('agent@example.com');
  const [password, setPassword] = useState('AgentPass123!');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const brandY = useSharedValue(24);
  const brandOpacity = useSharedValue(0);

  useEffect(() => {
    brandOpacity.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
    brandY.value = withDelay(
      80,
      withTiming(0, { duration: 700, easing: Easing.out(Easing.cubic) }),
    );
  }, [brandOpacity, brandY]);

  const brandStyle = useAnimatedStyle(() => ({
    opacity: brandOpacity.value,
    transform: [{ translateY: brandY.value }],
  }));

  async function onSubmit() {
    setLoading(true);
    setError(null);
    try {
      const result = await login(email.trim(), password);
      onLoggedIn(result.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion impossible');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.content}>
        <Animated.View style={[styles.hero, brandStyle]}>
          <View style={styles.badge}>
            <Ionicons name="boat-outline" size={22} color={colors.abyss} />
          </View>
          <Text style={styles.brand}>CBM-PIGAP</Text>
          <Text style={styles.tagline}>La marée des données de pêche</Text>
          <Text style={styles.subtitle}>Espace agent · enregistrement terrain</Text>
        </Animated.View>

        <GlassPanel style={styles.panel}>
          <GlassField
            label="E-mail"
            icon="mail-outline"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholder="agent@example.com"
          />
          <GlassField
            label="Mot de passe"
            icon="lock-closed-outline"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
          />
          {error ? (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <Text style={styles.error}>{error}</Text>
            </View>
          ) : null}
          <GlowButton
            label="Entrer dans la plateforme"
            icon="arrow-forward"
            onPress={onSubmit}
            loading={loading}
            variant="accent"
          />
        </GlassPanel>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    paddingBottom: space.xl,
  },
  hero: { marginBottom: space.lg },
  badge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  brand: {
    fontFamily: fonts.display,
    fontSize: 40,
    color: colors.ink,
    letterSpacing: -0.5,
  },
  tagline: {
    fontFamily: fonts.displayItalic,
    fontSize: 18,
    color: colors.foam,
    marginTop: 6,
  },
  subtitle: {
    fontFamily: fonts.body,
    color: colors.inkMuted,
    marginTop: 8,
    fontSize: 14,
  },
  panel: { marginTop: space.sm },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: space.md,
  },
  error: {
    flex: 1,
    color: colors.danger,
    fontFamily: fonts.body,
    fontSize: 13,
  },
});

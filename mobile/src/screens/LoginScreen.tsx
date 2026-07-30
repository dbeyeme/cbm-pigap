import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { login } from '../api';
import { GlassField } from '../components/GlassField';
import { GlassPanel } from '../components/GlassPanel';
import { GlowButton } from '../components/GlowButton';
import { ShipIcon } from '../components/ShipIcon';
import { friendlyApiError } from '../lib/apiErrors';
import { colors, fonts, motion, radii, space } from '../theme';

type Props = {
  onLoggedIn: (token: string) => void;
};

export function LoginScreen({ onLoggedIn }: Props) {
  const [email, setEmail] = useState('agent@example.com');
  const [password, setPassword] = useState('AgentPass123!');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, {
      duration: motion.slow,
      easing: Easing.out(Easing.cubic),
    });
  }, [opacity]);

  const brandStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  async function onSubmit() {
    setLoading(true);
    setError(null);
    try {
      const result = await login(email.trim(), password);
      onLoggedIn(result.access_token);
    } catch (err) {
      setError(friendlyApiError(err));
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
            <ShipIcon size={28} />
          </View>
          <Text style={styles.brand}>CBM-PIGAP</Text>
          <Text style={styles.tagline}>Suivi de la pêche artisanale</Text>
          <Text style={styles.subtitle}>Connexion agent de terrain</Text>
        </Animated.View>

        <GlassPanel style={styles.panel}>
          <GlassField
            label="Votre e-mail"
            icon="mail-outline"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholder="ex. agent@exemple.ga"
          />
          <GlassField
            label="Mot de passe"
            icon="lock-closed-outline"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="Votre mot de passe"
          />
          {error ? (
            <View style={styles.errorRow} accessibilityLiveRegion="polite">
              <Ionicons name="alert-circle" size={18} color={colors.danger} />
              <Text style={styles.error}>{error}</Text>
            </View>
          ) : null}
          <GlowButton
            label="Se connecter"
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
    width: 56,
    height: 56,
    borderRadius: radii.md,
    backgroundColor: colors.glassStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  brand: {
    fontFamily: fonts.display,
    fontSize: 36,
    color: colors.abyss,
    letterSpacing: -0.4,
  },
  tagline: {
    fontFamily: fonts.bodyMedium,
    fontSize: 17,
    color: colors.tide,
    marginTop: 8,
  },
  subtitle: {
    fontFamily: fonts.body,
    color: colors.inkMuted,
    marginTop: 6,
    fontSize: 15,
  },
  panel: { marginTop: space.sm },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: space.md,
    padding: 12,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(185, 28, 28, 0.08)',
  },
  error: {
    flex: 1,
    color: colors.danger,
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
  },
});

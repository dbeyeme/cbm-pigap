import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { fetchMe, login, type UtilisateurMe } from '../api';
import {
  DEMO_ACCOUNTS,
  isMobileAllowedRole,
  unsupportedRoleMessage,
} from '../auth/roles';
import { GlassField } from '../components/GlassField';
import { GlassPanel } from '../components/GlassPanel';
import { GlowButton } from '../components/GlowButton';
import { ShipIcon } from '../components/ShipIcon';
import { friendlyApiError } from '../lib/apiErrors';
import { colors, fonts, radii, space } from '../theme';

type Props = {
  onLoggedIn: (session: { token: string; user: UtilisateurMe }) => void;
};

export function LoginScreen({ onLoggedIn }: Props) {
  const [email, setEmail] = useState<string>(DEMO_ACCOUNTS.agent.email);
  const [password, setPassword] = useState<string>(DEMO_ACCOUNTS.agent.password);
  const [demoRole, setDemoRole] = useState<'agent' | 'pecheur'>('agent');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function pickDemo(kind: 'agent' | 'pecheur') {
    setDemoRole(kind);
    setEmail(DEMO_ACCOUNTS[kind].email);
    setPassword(DEMO_ACCOUNTS[kind].password);
    setError(null);
  }

  async function onSubmit() {
    setLoading(true);
    setError(null);
    try {
      const result = await login(email.trim(), password);
      const user = await fetchMe(result.access_token);
      if (!isMobileAllowedRole(user.role)) {
        throw new Error(unsupportedRoleMessage(user.role));
      }
      onLoggedIn({ token: result.access_token, user });
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
        <View style={styles.hero}>
          <View style={styles.badge}>
            <ShipIcon size={28} />
          </View>
          <Text style={styles.brand}>CBM-PIGAP</Text>
          <Text style={styles.tagline}>Suivi de la peche artisanale</Text>
          <Text style={styles.subtitle}>Connexion pecheur ou agent de terrain</Text>
        </View>

        <View style={styles.demoSwitch}>
          <Pressable
            onPress={() => pickDemo('agent')}
            style={[styles.demoChip, demoRole === 'agent' && styles.demoChipOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: demoRole === 'agent' }}
          >
            <Text style={[styles.demoChipText, demoRole === 'agent' && styles.demoChipTextOn]}>
              Agent
            </Text>
          </Pressable>
          <Pressable
            onPress={() => pickDemo('pecheur')}
            style={[styles.demoChip, demoRole === 'pecheur' && styles.demoChipOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: demoRole === 'pecheur' }}
          >
            <Text
              style={[styles.demoChipText, demoRole === 'pecheur' && styles.demoChipTextOn]}
            >
              Pecheur
            </Text>
          </Pressable>
        </View>

        <GlassPanel style={styles.panel}>
          <GlassField
            label="Votre e-mail"
            icon="mail-outline"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholder="ex. pecheur@exemple.ga"
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
  hero: { marginBottom: space.md },
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
  demoSwitch: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: space.sm,
  },
  demoChip: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.glassStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoChipOn: {
    borderColor: colors.tide,
    backgroundColor: 'rgba(37, 99, 168, 0.12)',
  },
  demoChipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.inkMuted,
  },
  demoChipTextOn: {
    color: colors.tide,
    fontFamily: fonts.bodyBold,
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

import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fetchMe, login, type UtilisateurMe } from '../api';
import { attachFisher } from '../auth/attachment';
import { DEMO_ACCOUNTS, isMobileAllowedRole, unsupportedRoleMessage, type DemoRole } from '../auth/roles';
import { GlassField } from '../components/GlassField';
import { GlowButton } from '../components/GlowButton';
import { ShipIcon } from '../components/ShipIcon';
import { HelpTip, Notice, type InfoPoint } from '../components/ui';
import { MESSAGE_APPAREIL_DEJA_RATTACHE, friendlyApiError } from '../lib/apiErrors';
import { readTrackingRequest } from '../tracking/state';
import { reconcileTracking, stopTracking } from '../tracking/tracking';
import { colors, fonts, radii, space } from '../theme';

type Props = {
  onLoggedIn: (session: { token: string; user: UtilisateurMe }) => void;
  /** Message à afficher à l'arrivée (session expirée, par exemple). */
  notice?: string | null;
};

const HELP_POINTS: ReadonlyArray<InfoPoint> = [
  { icon: 'key-outline', text: 'Vos identifiants vous sont remis par l’agent qui a créé votre dossier.' },
  { icon: 'phone-portrait-outline', text: 'Vous restez connecté sur ce téléphone : l’application se rouvre sans redemander le mot de passe.' },
  { icon: 'cloud-offline-outline', text: 'La première connexion demande du réseau. Ensuite, vos saisies se font aussi sans réseau.' },
  { icon: 'lock-closed-outline', text: 'Un téléphone n’accepte qu’un seul compte pêcheur. Pour en changer, adressez-vous à un agent de contrôle.' },
  { icon: 'desktop-outline', text: 'Autorités et organisations utilisent le portail web, pas cette application.' },
];

export function LoginScreen({ onLoggedIn, notice }: Props) {
  const demoAccounts = DEMO_ACCOUNTS;
  const [email, setEmail] = useState<string>(demoAccounts?.agent.email ?? '');
  const [password, setPassword] = useState<string>(demoAccounts?.agent.password ?? '');
  const [demoRole, setDemoRole] = useState<DemoRole>('agent');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** Un suivi GPS tourne encore alors qu'aucune session n'est ouverte (session expirée). */
  const [trackingRunning, setTrackingRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    reconcileTracking()
      .then((state) => {
        if (!cancelled) setTrackingRunning(state.actif);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function stopRunningTracking() {
    await stopTracking();
    setTrackingRunning(false);
    setError(null);
  }

  function pickDemo(kind: DemoRole) {
    if (!demoAccounts) return;
    setDemoRole(kind);
    setEmail(demoAccounts[kind].email);
    setPassword(demoAccounts[kind].password);
    setError(null);
  }

  async function onSubmit() {
    if (!email.trim() || !password) {
      setError('Saisissez votre e-mail et votre mot de passe.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await login(email.trim(), password);
      const user = await fetchMe(result.access_token);
      if (!isMobileAllowedRole(user.role)) {
        throw new Error(unsupportedRoleMessage(user.role));
      }
      // Pas de changement de compte pendant un suivi (ADR-012)
      const tracking = await readTrackingRequest().catch(() => null);
      if (tracking?.actif && tracking.utilisateurId && tracking.utilisateurId !== user.id) {
        throw new Error(
          'Un suivi GPS est en cours sur ce téléphone pour un autre compte. Arrêtez-le d’abord, puis reconnectez-vous.',
        );
      }
      // Un téléphone, un seul compte pêcheur : garde locale, le serveur fait foi
      if (user.role === 'pecheur') {
        const verdict = await attachFisher(user.id, result.appareil_rattache === true);
        if (verdict === 'refuse') throw new Error(MESSAGE_APPAREIL_DEJA_RATTACHE);
      }
      onLoggedIn({ token: result.access_token, user });
    } catch (err) {
      setError(friendlyApiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.badge}>
              <ShipIcon size={28} />
            </View>
            <HelpTip title="Se connecter" points={HELP_POINTS} icon="log-in-outline" onDark />
          </View>
          <Text style={styles.brand}>CBM-PIGAP</Text>
          <Text style={styles.tagline}>Suivi de la pêche artisanale</Text>
        </View>

        <View style={styles.panel}>
          {notice ? (
            <Notice tone="warn" icon="time-outline" text={notice} style={styles.notice} />
          ) : null}

          {trackingRunning ? (
            <View style={styles.trackingBox}>
              <Notice
                tone="info"
                icon="navigate-outline"
                text="Un suivi GPS est en cours sur ce téléphone. Reconnectez-vous pour envoyer ses relevés, ou arrêtez-le."
                style={styles.trackingNotice}
              />
              <GlowButton
                label="Arrêter le suivi GPS"
                icon="stop-circle-outline"
                variant="ghost"
                onPress={() => void stopRunningTracking()}
              />
            </View>
          ) : null}

          {demoAccounts ? (
            <View style={styles.demoSwitch}>
              {(Object.keys(demoAccounts) as DemoRole[]).map((kind) => {
                const on = demoRole === kind;
                const account = demoAccounts[kind];
                return (
                  <Pressable
                    key={kind}
                    onPress={() => pickDemo(kind)}
                    style={[styles.demoChip, on && styles.demoChipOn]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`Compte de démonstration : ${account.label}`}
                  >
                    <Text style={[styles.demoChipText, on && styles.demoChipTextOn]}>
                      {account.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <GlassField
            label="Votre e-mail"
            icon="mail-outline"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholder="Ex. pecheur@exemple.ga"
          />
          <GlassField
            label="Mot de passe"
            icon="lock-closed-outline"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="Votre mot de passe"
            returnKeyType="go"
            onSubmitEditing={() => void onSubmit()}
          />
          {error ? <Notice tone="error" text={error} style={styles.error} /> : null}
          <GlowButton
            label={loading ? 'Connexion…' : 'Se connecter'}
            icon="arrow-forward"
            onPress={() => void onSubmit()}
            disabled={loading}
            variant="accent"
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: space.lg,
    paddingTop: space.xl,
    paddingBottom: space.lg,
  },
  hero: { marginBottom: space.lg },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    fontFamily: fonts.display,
    fontSize: 38,
    color: '#FFFFFF',
    letterSpacing: -0.4,
  },
  tagline: {
    fontFamily: fonts.bodyMedium,
    fontSize: 18,
    color: '#D6E6F5',
    marginTop: 6,
  },
  panel: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 18,
  },
  notice: { marginTop: 0, marginBottom: space.md },
  trackingBox: { marginBottom: space.md, gap: 8 },
  trackingNotice: { marginTop: 0 },
  demoSwitch: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: space.md,
  },
  demoChip: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.glassBorder,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoChipOn: {
    borderColor: colors.tide,
    backgroundColor: 'rgba(37, 99, 168, 0.12)',
  },
  demoChipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
    color: colors.inkMuted,
  },
  demoChipTextOn: {
    color: colors.tide,
    fontFamily: fonts.bodyBold,
  },
  error: { marginTop: 0, marginBottom: space.md },
});

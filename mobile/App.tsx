import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import {
  Fraunces_600SemiBold,
  Fraunces_600SemiBold_Italic,
} from '@expo-google-fonts/fraunces';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { Component, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { fetchMe } from './src/api';
import { attachFisher } from './src/auth/attachment';
import {
  isMobileAllowedRole,
  mobileModeForRole,
  tabsForMode,
  unsupportedRoleMessage,
  type RoleTab,
} from './src/auth/roles';
import {
  closeSession,
  consumeExpiredNotice,
  openSession,
  restoreSession,
  subscribeSession,
  updateSessionUser,
  type Session,
} from './src/auth/session';
import { BottomNav } from './src/components/BottomNav';
import { OceanBackground } from './src/components/OceanBackground';
import { PhotoBackdrop } from './src/components/PhotoBackdrop';
import { ScreenTransition } from './src/components/ScreenTransition';
import { MESSAGE_APPAREIL_DEJA_RATTACHE } from './src/lib/apiErrors';
import { pluriel } from './src/lib/format';
import { clearCartePro } from './src/offline/cartePro';
import {
  claimOrphanRows,
  countByStatus,
  countPendingPositions,
  getSetting,
  setSetting,
} from './src/offline/db';
import { syncQuietly } from './src/offline/sync';
import { PHOTOS } from './src/photos';
import { AbonnementScreen } from './src/screens/AbonnementScreen';
import { CapturesScreen } from './src/screens/CapturesScreen';
import { CarteProScreen } from './src/screens/CarteProScreen';
import { ControleLicenceScreen } from './src/screens/ControleLicenceScreen';
import { CreatePecheurScreen } from './src/screens/CreatePecheurScreen';
import { AgentHomeScreen } from './src/screens/HomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { PecheurHomeScreen } from './src/screens/PecheurHomeScreen';
import { RedevancesScreen } from './src/screens/RedevancesScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { TrackingScreen } from './src/screens/TrackingScreen';
import { readTrackingRequest } from './src/tracking/state';
import { reconcileTracking, stopTracking } from './src/tracking/tracking';
import { colors, fonts, space } from './src/theme';

type Screen =
  | 'onboarding'
  | 'login'
  | 'home'
  | 'create'
  | 'search'
  | 'controle'
  | 'tracking'
  | 'captures'
  | 'carte'
  | 'abonnement'
  | 'redevances';

const NOTICE_EXPIRED =
  'Votre session a expiré. Reconnectez-vous : vos saisies sont conservées sur ce téléphone.';

/** Écart entre deux tentatives d'envoi quand l'application reste ouverte. */
const SYNC_EVERY_MS = 60_000;
/** Temps laissé au dernier envoi avant de fermer la session. */
const LOGOUT_SYNC_MS = 4_000;

function tabFromScreen(screen: Screen, mode: 'pecheur' | 'agent'): RoleTab {
  if (screen === 'captures') return 'captures';
  if (screen === 'tracking') return 'tracking';
  if (screen === 'abonnement') return 'abonnement';
  if (screen === 'search' || screen === 'create' || screen === 'controle') {
    return mode === 'agent' ? 'search' : 'home';
  }
  return 'home';
}

class RootErrorBoundary extends Component<
  { children: ReactNode; onReset?: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <OceanBackground>
          <View style={styles.boot}>
            <Text style={styles.errTitle}>CBM-PIGAP</Text>
            <Text style={styles.errBody}>
              Un incident a interrompu l’affichage. Vos saisies sont conservées sur ce téléphone.
            </Text>
            <Pressable
              style={styles.errBtn}
              accessibilityRole="button"
              onPress={() => {
                this.setState({ failed: false });
                this.props.onReset?.();
              }}
            >
              <Text style={styles.errBtnText}>Revenir à l’accueil</Text>
            </Pressable>
          </View>
        </OceanBackground>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [screen, setScreen] = useState<Screen>('login');
  const [loginNotice, setLoginNotice] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  // Démarrage : écran de bienvenue vu ou non, session conservée sur le téléphone
  const [bootDone, setBootDone] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
    Fraunces_600SemiBold,
    Fraunces_600SemiBold_Italic,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [onboarded, restored, expired] = await Promise.all([
        getSetting('onboarding_done').catch(() => null),
        restoreSession().catch(() => null),
        consumeExpiredNotice(),
      ]);
      // Un suivi coupé par le téléphone ne reprend pas en silence à la réouverture
      await reconcileTracking().catch(() => undefined);
      if (cancelled) return;
      // Un téléphone, un seul compte pêcheur (ADR-012) : vérifié aussi à la réouverture
      const refused =
        restored?.user.role === 'pecheur' &&
        (await attachFisher(restored.user.id, false).catch(() => 'deja_rattache')) === 'refuse';
      if (cancelled) return;
      if (restored && refused) {
        await closeSession('deconnexion');
        setLoginNotice(MESSAGE_APPAREIL_DEJA_RATTACHE);
        setScreen('login');
      } else if (restored && isMobileAllowedRole(restored.user.role)) {
        // Session conservée : l'application s'ouvre directement, même sans réseau
        setSession(restored);
        setScreen('home');
      } else {
        if (restored) await closeSession('deconnexion');
        if (expired) setLoginNotice(NOTICE_EXPIRED);
        setScreen(onboarded ? 'login' : 'onboarding');
      }
      setBootDone(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // La session se ferme d'elle-même quand le serveur la refuse (401)
  useEffect(
    () =>
      subscribeSession((next, reason) => {
        setSession(next);
        if (!next) {
          setScreen('login');
          setLoginNotice(reason === 'expiree' ? NOTICE_EXPIRED : null);
        }
      }),
    [],
  );

  // À chaque ouverture de session : profil relu sur le serveur, saisies en attente envoyées
  const token = session?.token ?? null;
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchMe(token)
      .then(async (me) => {
        if (cancelled) return;
        if (!isMobileAllowedRole(me.role)) {
          await closeSession('deconnexion');
          setLoginNotice(unsupportedRoleMessage(me.role));
          return;
        }
        await updateSessionUser(me);
        setSession((current) => (current && current.token === token ? { ...current, user: me } : current));
      })
      .catch(() => {
        // Sans réseau, la session conservée suffit ; un refus du serveur la ferme ailleurs
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Envoi automatique : à l'ouverture, au retour au premier plan, puis à intervalle régulier
  useEffect(() => {
    if (!session) return;
    void (async () => {
      // Saisies sans propriétaire (version précédente) : attribuées une fois pour toutes
      await claimOrphanRows(session.user.id, session.user.role === 'pecheur').catch(() => undefined);
      await syncQuietly(session);
    })();
    const timer = setInterval(() => void syncQuietly(session), SYNC_EVERY_MS);
    const appState = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      void reconcileTracking().catch(() => undefined);
      void syncQuietly(session);
    });
    return () => {
      clearInterval(timer);
      appState.remove();
    };
  }, [session]);

  const mode = session ? mobileModeForRole(session.user.role) : null;
  const navTabs = useMemo(() => (mode ? tabsForMode(mode) : []), [mode]);

  const logout = useCallback(async () => {
    const current = session;
    if (!current) return;
    setLoggingOut(true);
    try {
      // Le suivi GPS s'arrête avec la session : aucun relevé sans compte ouvert
      await stopTracking().catch(() => undefined);
      await Promise.race([
        syncQuietly(current),
        new Promise((resolve) => setTimeout(resolve, LOGOUT_SYNC_MS)),
      ]);
      await clearCartePro(current.user.id);
      await closeSession('deconnexion');
    } finally {
      setLoggingOut(false);
    }
  }, [session]);

  const askLogout = useCallback(() => {
    void (async () => {
      const userId = session?.user.id;
      if (!userId) return;
      const [tracking, captures, positions] = await Promise.all([
        readTrackingRequest().catch(() => null),
        countByStatus(userId)
          .then((c) => c.pending)
          .catch(() => 0),
        countPendingPositions(userId).catch(() => 0),
      ]);
      const waiting = [
        positions > 0 ? pluriel(positions, 'relevé GPS', 'relevés GPS') : null,
        captures > 0 ? pluriel(captures, 'déclaration', 'déclarations') : null,
      ].filter(Boolean);
      const total = positions + captures;
      const lines = [
        tracking?.actif ? 'Le suivi GPS en cours sera arrêté.' : null,
        total > 0 ? `Reste à envoyer : ${waiting.join(' et ')}.` : 'Tout ce que vous avez saisi est déjà envoyé.',
        total > 1
          ? 'Ces saisies restent sur ce téléphone, sous votre compte, et partiront à votre prochaine connexion.'
          : total === 1
            ? 'Cette saisie reste sur ce téléphone, sous votre compte, et partira à votre prochaine connexion.'
            : null,
      ].filter(Boolean);
      Alert.alert(
        'Se déconnecter ?',
        lines.join(' '),
        [
          { text: 'Rester connecté', style: 'cancel' },
          { text: 'Se déconnecter', style: 'destructive', onPress: () => void logout() },
        ],
      );
    })();
  }, [logout, session]);

  if (fontError) {
    return (
      <OceanBackground>
        <View style={styles.boot}>
          <Text style={styles.errBody}>
            L’application n’a pas pu se charger entièrement. Fermez-la, puis rouvrez-la.
          </Text>
        </View>
      </OceanBackground>
    );
  }

  if (!fontsLoaded || !bootDone || loggingOut) {
    return (
      <OceanBackground>
        <View style={styles.boot}>
          <ActivityIndicator size="large" color={colors.foam} />
          {loggingOut ? <Text style={styles.bootText}>Déconnexion…</Text> : null}
        </View>
      </OceanBackground>
    );
  }

  const guest = screen === 'onboarding' || !session || !mode || screen === 'login';

  if (guest) {
    return (
      <RootErrorBoundary onReset={() => setScreen('login')}>
        <SafeAreaProvider>
          <PhotoBackdrop photo={PHOTOS.mer}>
            <StatusBar style="light" />
            <SafeAreaView style={styles.root} edges={['top', 'left', 'right', 'bottom']}>
              {screen === 'onboarding' ? (
                <OnboardingScreen
                  onDone={() => {
                    void setSetting('onboarding_done', new Date().toISOString()).catch(() => undefined);
                    setScreen('login');
                  }}
                />
              ) : (
                <LoginScreen
                  notice={loginNotice}
                  onLoggedIn={(next) => {
                    setLoginNotice(null);
                    setSession(next);
                    setScreen('home');
                    void openSession(next);
                  }}
                />
              )}
            </SafeAreaView>
          </PhotoBackdrop>
        </SafeAreaProvider>
      </RootErrorBoundary>
    );
  }

  const { user } = session;
  const sessionToken = session.token;
  const goHome = () => setScreen('home');

  const showNav = screen !== 'create' && screen !== 'controle' && !(mode === 'agent' && screen === 'abonnement');

  return (
    <RootErrorBoundary onReset={goHome}>
      <SafeAreaProvider>
        <OceanBackground>
          <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
            <StatusBar style="dark" />
            <View style={[styles.body, showNav && styles.bodyWithNav]}>
              <ScreenTransition screenKey={`${mode}-${screen}`}>
                {mode === 'agent' && screen === 'home' && (
                  <AgentHomeScreen
                    userName={user.nom}
                    onCreate={() => setScreen('create')}
                    onSearch={() => setScreen('search')}
                    onControle={() => setScreen('controle')}
                    onTracking={() => setScreen('tracking')}
                    onCaptures={() => setScreen('captures')}
                    onLogout={askLogout}
                  />
                )}

                {mode === 'pecheur' && screen === 'home' && (
                  <PecheurHomeScreen
                    userName={user.nom}
                    userId={user.id}
                    token={sessionToken}
                    onCaptures={() => setScreen('captures')}
                    onTracking={() => setScreen('tracking')}
                    onCarte={() => setScreen('carte')}
                    onAbonnement={() => setScreen('abonnement')}
                    onRedevances={() => setScreen('redevances')}
                    onLogout={askLogout}
                  />
                )}

                {mode === 'pecheur' && screen === 'carte' && (
                  <CarteProScreen token={sessionToken} user={user} onBack={goHome} />
                )}

                {mode === 'pecheur' && screen === 'redevances' && (
                  <RedevancesScreen token={sessionToken} onBack={goHome} />
                )}

                {mode === 'agent' && screen === 'create' && (
                  <CreatePecheurScreen token={sessionToken} onDone={goHome} onBack={goHome} />
                )}

                {mode === 'agent' && screen === 'search' && (
                  <SearchScreen
                    token={sessionToken}
                    onBack={goHome}
                    onControle={() => setScreen('controle')}
                  />
                )}

                {mode === 'agent' && screen === 'controle' && (
                  <ControleLicenceScreen token={sessionToken} onBack={goHome} />
                )}

                {screen === 'abonnement' && <AbonnementScreen token={sessionToken} onBack={goHome} />}

                {screen === 'tracking' && (
                  <TrackingScreen token={sessionToken} user={user} mode={mode} onBack={goHome} />
                )}

                {screen === 'captures' && (
                  <CapturesScreen token={sessionToken} user={user} mode={mode} onBack={goHome} />
                )}
              </ScreenTransition>
            </View>
            {showNav ? (
              <BottomNav
                active={tabFromScreen(screen, mode)}
                tabs={navTabs}
                onChange={(tab) => {
                  if (tab === 'home') setScreen('home');
                  if (tab === 'captures') setScreen('captures');
                  if (tab === 'tracking') setScreen('tracking');
                  if (tab === 'search' && mode === 'agent') setScreen('search');
                  if (tab === 'abonnement' && mode === 'pecheur') setScreen('abonnement');
                }}
              />
            ) : null}
          </SafeAreaView>
        </OceanBackground>
      </SafeAreaProvider>
    </RootErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1 },
  bodyWithNav: { paddingBottom: 96 },
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  bootText: { fontSize: 16, color: colors.inkMuted, marginTop: 14 },
  errTitle: {
    fontFamily: fonts.display,
    fontSize: 22,
    color: colors.abyss,
    marginBottom: 8,
  },
  errBody: {
    fontSize: 16,
    lineHeight: 23,
    color: colors.inkMuted,
    textAlign: 'center',
    marginBottom: 16,
  },
  errBtn: {
    minHeight: 48,
    justifyContent: 'center',
    backgroundColor: colors.tide,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  errBtnText: { fontFamily: fonts.bodyBold, fontSize: 16, color: '#F8FAFC' },
});

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
import { Component, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import type { UtilisateurMe } from './src/api';
import { mobileModeForRole, tabsForMode, type RoleTab } from './src/auth/roles';
import { BottomNav } from './src/components/BottomNav';
import { OceanBackground } from './src/components/OceanBackground';
import { ScreenTransition } from './src/components/ScreenTransition';
import { AbonnementScreen } from './src/screens/AbonnementScreen';
import { CapturesScreen } from './src/screens/CapturesScreen';
import { CreatePecheurScreen } from './src/screens/CreatePecheurScreen';
import { AgentHomeScreen } from './src/screens/HomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { PecheurHomeScreen } from './src/screens/PecheurHomeScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { TrackingScreen } from './src/screens/TrackingScreen';
import { colors, fonts, space } from './src/theme';

type Screen =
  | 'login'
  | 'home'
  | 'create'
  | 'search'
  | 'tracking'
  | 'captures'
  | 'abonnement';

function tabFromScreen(screen: Screen, mode: 'pecheur' | 'agent'): RoleTab {
  if (screen === 'captures') return 'captures';
  if (screen === 'tracking') return 'tracking';
  if (screen === 'abonnement') return 'abonnement';
  if (screen === 'search' || screen === 'create') {
    return mode === 'agent' ? 'search' : 'home';
  }
  return 'home';
}

class RootErrorBoundary extends Component<
  { children: ReactNode; onReset?: () => void },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(err: Error) {
    return { error: err?.message || 'Erreur inattendue' };
  }

  render() {
    if (this.state.error) {
      return (
        <OceanBackground>
          <View style={styles.boot}>
            <Text style={styles.errTitle}>CBM-PIGAP</Text>
            <Text style={styles.errBody}>{this.state.error}</Text>
            <Pressable
              style={styles.errBtn}
              onPress={() => {
                this.setState({ error: null });
                this.props.onReset?.();
              }}
            >
              <Text style={styles.errBtnText}>Reessayer</Text>
            </Pressable>
          </View>
        </OceanBackground>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UtilisateurMe | null>(null);
  const [screen, setScreen] = useState<Screen>('login');
  const [fontsLoaded, fontError] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
    Fraunces_600SemiBold,
    Fraunces_600SemiBold_Italic,
  });

  const mode = user ? mobileModeForRole(user.role) : null;
  const navTabs = useMemo(() => (mode ? tabsForMode(mode) : []), [mode]);

  function logout() {
    setToken(null);
    setUser(null);
    setScreen('login');
  }

  if (fontError) {
    return (
      <OceanBackground>
        <View style={styles.boot}>
          <Text style={styles.errBody}>Polices indisponibles — redemarrez l'app.</Text>
        </View>
      </OceanBackground>
    );
  }

  if (!fontsLoaded) {
    return (
      <OceanBackground>
        <View style={styles.boot}>
          <ActivityIndicator size="large" color={colors.foam} />
        </View>
      </OceanBackground>
    );
  }

  const showNav =
    Boolean(token && user && mode) &&
    screen !== 'login' &&
    screen !== 'create' &&
    !(mode === 'agent' && screen === 'abonnement');

  return (
    <RootErrorBoundary onReset={logout}>
      <SafeAreaProvider>
        <OceanBackground>
          <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
            <StatusBar style="dark" />
            <View style={[styles.body, showNav && styles.bodyWithNav]}>
              <ScreenTransition screenKey={`${mode ?? 'guest'}-${screen}`}>
                {(!token || !user || screen === 'login') && (
                  <LoginScreen
                    onLoggedIn={({ token: t, user: u }) => {
                      setToken(t);
                      setUser(u);
                      setScreen('home');
                    }}
                  />
                )}

                {token && user && mode === 'agent' && screen === 'home' && (
                  <AgentHomeScreen
                    userName={user.nom}
                    onCreate={() => setScreen('create')}
                    onSearch={() => setScreen('search')}
                    onTracking={() => setScreen('tracking')}
                    onCaptures={() => setScreen('captures')}
                    onLogout={logout}
                  />
                )}

                {token && user && mode === 'pecheur' && screen === 'home' && (
                  <PecheurHomeScreen
                    userName={user.nom}
                    token={token}
                    onCaptures={() => setScreen('captures')}
                    onTracking={() => setScreen('tracking')}
                    onAbonnement={() => setScreen('abonnement')}
                    onLogout={logout}
                  />
                )}

                {token && mode === 'agent' && screen === 'create' && (
                  <CreatePecheurScreen
                    token={token}
                    onDone={() => setScreen('home')}
                    onBack={() => setScreen('home')}
                  />
                )}

                {token && mode === 'agent' && screen === 'search' && (
                  <SearchScreen token={token} onBack={() => setScreen('home')} />
                )}

                {token && mode && screen === 'abonnement' && (
                  <AbonnementScreen token={token} onBack={() => setScreen('home')} />
                )}

                {token && mode && screen === 'tracking' && (
                  <TrackingScreen
                    token={token}
                    mode={mode}
                    onBack={() => setScreen('home')}
                  />
                )}

                {token && mode && screen === 'captures' && (
                  <CapturesScreen
                    token={token}
                    mode={mode}
                    onBack={() => setScreen('home')}
                  />
                )}
              </ScreenTransition>
            </View>
            {showNav && mode ? (
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
  errTitle: {
    fontFamily: fonts.display,
    fontSize: 22,
    color: colors.abyss,
    marginBottom: 8,
  },
  errBody: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.inkMuted,
    textAlign: 'center',
    marginBottom: 16,
  },
  errBtn: {
    backgroundColor: colors.tide,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  errBtnText: { fontFamily: fonts.bodyBold, color: '#F8FAFC' },
});

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
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { BottomNav, MobileTab } from './src/components/BottomNav';
import { OceanBackground } from './src/components/OceanBackground';
import { ScreenTransition } from './src/components/ScreenTransition';
import { CapturesScreen } from './src/screens/CapturesScreen';
import { CreatePecheurScreen } from './src/screens/CreatePecheurScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { TrackingScreen } from './src/screens/TrackingScreen';
import { colors } from './src/theme';

type Screen = 'login' | 'home' | 'create' | 'search' | 'tracking' | 'captures';

function tabFromScreen(screen: Screen): MobileTab {
  if (screen === 'captures') return 'captures';
  if (screen === 'tracking') return 'tracking';
  if (screen === 'search' || screen === 'create') return 'search';
  return 'home';
}

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>('login');
  const [fontsLoaded] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
    Fraunces_600SemiBold,
    Fraunces_600SemiBold_Italic,
  });

  if (!fontsLoaded) {
    return (
      <OceanBackground>
        <View style={styles.boot}>
          <ActivityIndicator size="large" color={colors.foam} />
        </View>
      </OceanBackground>
    );
  }

  const showNav = Boolean(token) && screen !== 'login' && screen !== 'create';

  return (
    <SafeAreaProvider>
      <OceanBackground>
        <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
          <StatusBar style="dark" />
          <View style={[styles.body, showNav && styles.bodyWithNav]}>
            <ScreenTransition screenKey={screen}>
              {(!token || screen === 'login') && (
                <LoginScreen
                  onLoggedIn={(value) => {
                    setToken(value);
                    setScreen('home');
                  }}
                />
              )}
              {token && screen === 'home' && (
                <HomeScreen
                  onCreate={() => setScreen('create')}
                  onSearch={() => setScreen('search')}
                  onTracking={() => setScreen('tracking')}
                  onCaptures={() => setScreen('captures')}
                  onLogout={() => {
                    setToken(null);
                    setScreen('login');
                  }}
                />
              )}
              {token && screen === 'create' && (
                <CreatePecheurScreen
                  token={token}
                  onDone={() => setScreen('home')}
                  onBack={() => setScreen('home')}
                />
              )}
              {token && screen === 'search' && (
                <SearchScreen token={token} onBack={() => setScreen('home')} />
              )}
              {token && screen === 'tracking' && (
                <TrackingScreen token={token} onBack={() => setScreen('home')} />
              )}
              {token && screen === 'captures' && (
                <CapturesScreen token={token} onBack={() => setScreen('home')} />
              )}
            </ScreenTransition>
          </View>
          {showNav ? (
            <BottomNav
              active={tabFromScreen(screen)}
              onChange={(tab) => {
                if (tab === 'home') setScreen('home');
                if (tab === 'captures') setScreen('captures');
                if (tab === 'tracking') setScreen('tracking');
                if (tab === 'search') setScreen('search');
              }}
            />
          ) : null}
        </SafeAreaView>
      </OceanBackground>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1 },
  bodyWithNav: { paddingBottom: 96 },
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

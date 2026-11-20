import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LocalGame, type JoinMode } from '@bombarossa/game-core';
import { Match } from './src/Match';
import { OnlineEntry, OnlineSession } from './src/online';
import { Menu, SettingsScreen, SoloSetup } from './src/screens';
import { SettingsProvider, useSettings } from './src/settings';
import { sounds } from './src/sound';
import { Screen } from './src/ui';

type Route =
  | { name: 'menu' }
  | { name: 'soloSetup' }
  | { name: 'solo'; bots: number; round: number }
  | { name: 'onlineEntry' }
  | { name: 'online'; mode: JoinMode }
  | { name: 'settings' };

function SoloMatch({ bots, onExit, onRestart }: { bots: number; onExit: () => void; onRestart: () => void }) {
  const { settings } = useSettings();
  const [game] = useState(() => new LocalGame({ bots, playerName: settings.name.trim() || 'Sen' }));
  return <Match source={game} onExit={onExit} onRestart={bots > 0 ? onRestart : undefined} subtitle={bots === 0 ? 'Antrenman' : undefined} />;
}

function Root() {
  const { loaded } = useSettings();
  const [route, setRoute] = useState<Route>({ name: 'menu' });

  useEffect(() => {
    sounds.init();
  }, []);

  const goMenu = useCallback(() => setRoute({ name: 'menu' }), []);

  // Android back button: step back instead of closing the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (route.name === 'menu') return false;
      if (route.name === 'online' || route.name === 'solo' || route.name === 'soloSetup' || route.name === 'onlineEntry' || route.name === 'settings') {
        setRoute(route.name === 'online' ? { name: 'onlineEntry' } : { name: 'menu' });
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [route]);

  if (!loaded) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="white" />
        </View>
      </Screen>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      {route.name === 'menu' && (
        <Menu
          onSolo={() => setRoute({ name: 'soloSetup' })}
          onOnline={() => setRoute({ name: 'onlineEntry' })}
          onSettings={() => setRoute({ name: 'settings' })}
        />
      )}
      {route.name === 'soloSetup' && <SoloSetup onBack={goMenu} onStart={(bots) => setRoute({ name: 'solo', bots, round: 0 })} />}
      {route.name === 'solo' && (
        <SoloMatch
          key={route.round}
          bots={route.bots}
          onExit={goMenu}
          onRestart={() => setRoute({ name: 'solo', bots: route.bots, round: route.round + 1 })}
        />
      )}
      {route.name === 'onlineEntry' && (
        <OnlineEntry onBack={goMenu} onJoin={(mode) => setRoute({ name: 'online', mode })} onSettings={() => setRoute({ name: 'settings' })} />
      )}
      {route.name === 'online' && <OnlineSession mode={route.mode} onExit={() => setRoute({ name: 'onlineEntry' })} />}
      {route.name === 'settings' && <SettingsScreen onBack={goMenu} />}
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <Root />
      </SettingsProvider>
    </SafeAreaProvider>
  );
}

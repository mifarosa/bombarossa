import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { Dir, GameState } from '@bombarossa/game-core';
import { Controls } from './src/Controls';
import { GameView } from './src/GameView';
import { SERVER_URL } from './src/config';
import { useLocalGame } from './src/useLocalGame';
import { useOnlineGame } from './src/useOnlineGame';

type Screen = 'menu' | 'solo' | 'sandbox' | 'online';

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [round, setRound] = useState(0); // bump to restart a match

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root}>
        <StatusBar style="light" />
        {screen === 'menu' && <Menu onPick={setScreen} />}
        {screen === 'solo' && (
          <SoloScreen key={round} onExit={() => setScreen('menu')} onRestart={() => setRound((r) => r + 1)} />
        )}
        {screen === 'sandbox' && (
          <SoloScreen
            key={round}
            botCount={0}
            onExit={() => setScreen('menu')}
            onRestart={() => setRound((r) => r + 1)}
          />
        )}
        {screen === 'online' && (
          <OnlineScreen key={round} onExit={() => setScreen('menu')} onRestart={() => setRound((r) => r + 1)} />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Menu({ onPick }: { onPick: (s: Screen) => void }) {
  return (
    <View style={styles.center}>
      <Text style={styles.title}>BOMBAROSSA</Text>
      <Button label="Tek Oyuncu" onPress={() => onPick('solo')} />
      <Button label="Online" onPress={() => onPick('online')} />
      <Button label="Test: Boş Harita" onPress={() => onPick('sandbox')} />
    </View>
  );
}

function SoloScreen({
  botCount = 3,
  onExit,
  onRestart,
}: {
  botCount?: number;
  onExit: () => void;
  onRestart: () => void;
}) {
  // botCount 0 = sandbox: alone on the map, the match never ends.
  const { state, myId, onDir, onBomb } = useLocalGame(botCount);
  return <Match state={state} myId={myId} onDir={onDir} onBomb={onBomb} onExit={onExit} onRestart={onRestart} />;
}

function OnlineScreen({ onExit, onRestart }: { onExit: () => void; onRestart: () => void }) {
  const { state, myId, status, lobby, onDir, onBomb } = useOnlineGame(SERVER_URL);

  if (status === 'disconnected') {
    return (
      <View style={styles.center}>
        <Text style={styles.msg}>Sunucuya bağlanılamadı</Text>
        <Button label="Tekrar dene" onPress={onRestart} />
        <Button label="Menü" onPress={onExit} />
      </View>
    );
  }
  if (!state || myId === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.msg}>
          {status === 'connecting'
            ? 'Bağlanılıyor…'
            : `Oyuncu bekleniyor (${lobby.humans}/4)\nBoş yerler botlarla dolacak`}
        </Text>
        <Button label="İptal" onPress={onExit} />
      </View>
    );
  }
  return <Match state={state} myId={myId} onDir={onDir} onBomb={onBomb} onExit={onExit} onRestart={onRestart} />;
}

function Match(props: {
  state: GameState;
  myId: number;
  onDir: (d: Dir | null) => void;
  onBomb: () => void;
  onExit: () => void;
  onRestart: () => void;
}) {
  const { state, myId } = props;
  const me = state.players[myId];
  const result = !state.over ? null : state.winner === myId ? 'Kazandın! 🎉' : state.winner === null ? 'Berabere' : 'Kaybettin';

  return (
    <View style={styles.match}>
      <View style={styles.hud}>
        <Text style={styles.hudText}>{me?.alive ? '❤️ Hayatta' : '💀 Elendin'}</Text>
        <Text style={styles.hudText}>
          💣 {me?.maxBombs}  🔥 {me?.range}
        </Text>
        <Pressable onPress={props.onExit}>
          <Text style={styles.hudText}>✕</Text>
        </Pressable>
      </View>

      <GameView state={state} />

      <View style={styles.controls}>
        <Controls onDir={props.onDir} onBomb={props.onBomb} />
      </View>

      {result && (
        <View style={styles.overlay}>
          <Text style={styles.title}>{result}</Text>
          <Button label="Tekrar oyna" onPress={props.onRestart} />
          <Button label="Menü" onPress={props.onExit} />
        </View>
      )}
    </View>
  );
}

function Button({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f172a' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  title: { color: '#f8fafc', fontSize: 36, fontWeight: '800', letterSpacing: 2, marginBottom: 24 },
  msg: { color: '#e2e8f0', fontSize: 18, textAlign: 'center', marginBottom: 8 },
  button: { backgroundColor: '#dc2626', paddingVertical: 14, paddingHorizontal: 40, borderRadius: 12, minWidth: 220 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  match: { flex: 1 },
  hud: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  hudText: { color: '#e2e8f0', fontSize: 16 },
  controls: { flex: 1, justifyContent: 'center' },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000000bb',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
});

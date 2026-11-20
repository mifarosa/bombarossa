import { useEffect, useReducer, useState } from 'react';
import { ActivityIndicator, Share, StyleSheet, Text, View } from 'react-native';
import { OnlineGame, type JoinMode } from '@bombarossa/game-core';
import { Match } from './Match';
import { Button, Field, Row, Screen, Toggle } from './ui';
import { useSettings } from './settings';

const ERRORS: Record<string, string> = {
  no_room: 'Oda bulunamadı. Kodu kontrol et.',
  room_full: 'Oda dolu.',
  started: 'Bu oyun zaten başlamış.',
  busy: 'Sunucu şu an dolu, biraz sonra tekrar dene.',
  bad_token: 'Oturum bulunamadı.',
  need_players: 'En az 2 oyuncu gerekli, ya da botları aç.',
  not_host: 'Bunu sadece oda sahibi yapabilir.',
  network: 'Sunucuya bağlanılamadı.',
  rate_limited: 'Çok hızlı istek gönderdin.',
};

export function OnlineEntry({ onBack, onJoin, onSettings }: { onBack: () => void; onJoin: (mode: JoinMode) => void; onSettings: () => void }) {
  const { settings, update, theme } = useSettings();
  const [code, setCode] = useState('');
  const hasServer = settings.serverUrl.length > 0;
  const codeOk = code.replace(/[^A-Za-z]/g, '').length === 4;

  return (
    <Screen title="Online" onBack={onBack}>
      <View style={styles.content}>
        <Field
          label="Adın"
          value={settings.name}
          onChangeText={(name) => update({ name })}
          placeholder="Oyuncu"
          maxLength={12}
          autoCorrect={false}
        />
        {!hasServer && (
          <View style={[styles.notice, { backgroundColor: theme.ui.panel, borderColor: theme.ui.danger }]}>
            <Text style={{ color: theme.ui.text, fontSize: 14 }}>
              Sunucu adresi ayarlı değil. Ayarlar'dan bir adres gir (ör. wss://oyun.alanadin.com).
            </Text>
            <Button label="Ayarlar" variant="secondary" onPress={onSettings} style={{ minWidth: 0, paddingVertical: 10 }} />
          </View>
        )}
        <View style={styles.buttons}>
          <Button label="Hızlı Eşleşme" disabled={!hasServer} onPress={() => onJoin({ kind: 'quick' })} />
          <Button label="Oda Kur" variant="secondary" disabled={!hasServer} onPress={() => onJoin({ kind: 'create' })} />
        </View>

        <Text style={[styles.section, { color: theme.ui.text }]}>Kodla katıl</Text>
        <Field
          label="4 harfli oda kodu"
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))}
          placeholder="ABCD"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={4}
          style={{ letterSpacing: 8, fontSize: 24, textAlign: 'center', fontWeight: '800' }}
        />
        <Button label="Katıl" disabled={!hasServer || !codeOk} onPress={() => onJoin({ kind: 'join', code })} />
      </View>
    </Screen>
  );
}

export function OnlineSession({ mode, onExit }: { mode: JoinMode; onExit: () => void }) {
  const { settings } = useSettings();
  const [game] = useState(
    () => new OnlineGame({ url: settings.serverUrl, name: settings.name.trim() || 'Oyuncu', mode }),
  );
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => game.subscribe(rerender), [game]);
  useEffect(() => () => game.close(), [game]);

  const { status } = game;

  if (status === 'error') {
    return (
      <Screen title="Online" onBack={onExit}>
        <View style={styles.center}>
          <Text style={styles.emoji}>😵</Text>
          <Text style={[styles.msg, { color: 'white' }]}>{ERRORS[game.error?.code ?? 'network'] ?? game.error?.message}</Text>
          <Button label="Geri" onPress={onExit} />
        </View>
      </Screen>
    );
  }

  if (status === 'connecting' || status === 'reconnecting' || status === 'closed') {
    return (
      <Screen title="Online" onBack={onExit}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="white" />
          <Text style={[styles.msg, { color: 'white' }]}>
            {status === 'reconnecting' ? 'Bağlantı koptu, yeniden bağlanılıyor…' : 'Bağlanılıyor…'}
          </Text>
          <Button label="İptal" variant="secondary" onPress={onExit} />
        </View>
      </Screen>
    );
  }

  if (status === 'lobby') return <Lobby game={game} onExit={onExit} />;

  const isHost = game.you === 0;
  return (
    <Match
      source={game}
      onExit={onExit}
      subtitle={game.code ? `Oda ${game.code}` : undefined}
      rttMs={game.rttMs}
      onRestart={isHost ? () => game.rematch() : undefined}
      restartLabel="Tekrar oyna (lobi)"
      overHint="Oda sahibi yeni oyunu başlatabilir"
    />
  );
}

function Lobby({ game, onExit }: { game: OnlineGame; onExit: () => void }) {
  const { theme } = useSettings();
  const lobby = game.lobby!;
  const players = lobby.players;
  const canStart = lobby.host && (players.length >= 2 || lobby.bots);
  const err = game.error && (game.error.code === 'need_players' || game.error.code === 'not_host') ? ERRORS[game.error.code] : null;

  return (
    <Screen title={lobby.quick ? 'Hızlı Eşleşme' : 'Oda'} onBack={onExit}>
      <View style={styles.content}>
        {lobby.quick ? (
          <View style={styles.center}>
            <ActivityIndicator color="white" />
            <Text style={[styles.msg, { color: theme.ui.text }]}>
              Rakipler aranıyor… {lobby.startsInMs !== null ? `${Math.ceil(lobby.startsInMs / 1000)} sn` : ''}
            </Text>
            <Text style={[styles.small, { color: theme.ui.muted }]}>Boş yerler botlarla dolacak</Text>
          </View>
        ) : (
          <View style={[styles.codeBox, { backgroundColor: theme.ui.panel, borderColor: theme.ui.panelBorder }]}>
            <Text style={[styles.small, { color: theme.ui.muted }]}>Oda kodu</Text>
            <Text style={[styles.code, { color: theme.ui.accent }]}>{lobby.code}</Text>
            <Button
              label="Arkadaşlarına gönder"
              variant="secondary"
              style={{ minWidth: 0, paddingVertical: 10 }}
              onPress={() => Share.share({ message: `Bombarossa'da oda kodum: ${lobby.code}` }).catch(() => {})}
            />
          </View>
        )}

        <Text style={[styles.section, { color: theme.ui.text }]}>
          Oyuncular ({players.length}/{lobby.max})
        </Text>
        <View style={{ gap: 8 }}>
          {players.map((p, i) => (
            <View key={i} style={[styles.player, { backgroundColor: theme.ui.panel, borderColor: theme.ui.panelBorder }]}>
              <View style={[styles.dot, { backgroundColor: theme.playerColors[i % theme.playerColors.length] }]} />
              <Text style={{ color: theme.ui.text, fontSize: 16, fontWeight: '700', flex: 1 }}>
                {p.name}
                {i === lobby.you ? '  (sen)' : ''}
              </Text>
              {!lobby.quick && i === 0 ? <Text>👑</Text> : null}
            </View>
          ))}
        </View>

        {!lobby.quick && lobby.host && (
          <Row label="Botlarla doldur" hint="Boş yerler botlarla dolsun (en az 4 kişilik oyun)">
            <Toggle value={lobby.bots} onChange={(on) => game.setBots(on)} />
          </Row>
        )}
        {err ? <Text style={{ color: theme.ui.danger, textAlign: 'center' }}>{err}</Text> : null}
        {!lobby.quick && (
          <View style={styles.buttons}>
            {lobby.host ? (
              <Button label="Başlat" disabled={!canStart} onPress={() => game.startMatch()} />
            ) : (
              <Text style={[styles.small, { color: theme.ui.muted }]}>Oda sahibinin başlatması bekleniyor…</Text>
            )}
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, padding: 20, gap: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  emoji: { fontSize: 56 },
  msg: { fontSize: 18, textAlign: 'center', fontWeight: '600' },
  small: { fontSize: 13, textAlign: 'center' },
  buttons: { gap: 12, alignItems: 'center', marginTop: 4 },
  section: { fontSize: 16, fontWeight: '800', marginTop: 4 },
  notice: { borderWidth: 2, borderRadius: 14, padding: 12, gap: 10 },
  codeBox: { borderWidth: 1, borderRadius: 18, padding: 16, alignItems: 'center', gap: 8 },
  code: { fontSize: 56, fontWeight: '900', letterSpacing: 12 },
  player: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  dot: { width: 14, height: 14, borderRadius: 7 },
});

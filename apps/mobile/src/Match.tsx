import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import type { GameEvent, GameSource, RenderFrame } from '@bombarossa/game-core';
import { GameCanvas } from './GameCanvas';
import { TouchControls } from './TouchControls';
import { haptics } from './haptics';
import { useSettings } from './settings';
import { sounds } from './sound';
import { Button } from './ui';
import type { QualityLevel } from './render/theme';

interface Props {
  source: GameSource;
  onExit: () => void;
  /** Called by "play again". Omit to hide the button (e.g. waiting for the host online). */
  onRestart?: () => void;
  restartLabel?: string;
  /** Extra line shown in the HUD, e.g. the room code. */
  subtitle?: string;
  /** Online latency, shown next to the HUD when known. */
  rttMs?: number;
  /** Shown under the result when there is no restart button (e.g. only the host can restart). */
  overHint?: string;
}

interface HudPlayer {
  id: number;
  name: string;
  alive: boolean;
}

/** One running match: canvas, touch controls, HUD, sound/haptics and the result overlay. */
export function Match({ source, onExit, onRestart, restartLabel = 'Tekrar oyna', subtitle, rttMs, overHint }: Props) {
  useKeepAwake();
  const { settings, theme } = useSettings();
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [hud, setHud] = useState<{ players: HudPlayer[]; over: boolean; winner: number | null; fps: number; level: QualityLevel } | null>(
    null,
  );
  const youRef = useRef(source.you);
  youRef.current = source.you;

  const handleEvents = useCallback(
    (events: GameEvent[], frame: RenderFrame) => {
      const you = frame.you;
      const me = frame.players[you];
      let exploded = false;
      for (const ev of events) {
        switch (ev.type) {
          case 'bombPlaced':
            sounds.play('place', ev.owner === you ? 0.9 : 0.5);
            if (ev.owner === you) haptics.light();
            break;
          case 'explosion': {
            if (exploded) break;
            exploded = true;
            const dist = me ? Math.hypot(me.x - (ev.x + 0.5), me.y - (ev.y + 0.5)) : 99;
            sounds.play('explosion', Math.max(0.3, Math.min(1, 1.1 - dist / 14)));
            if (dist < 4) haptics.medium();
            break;
          }
          case 'powerUpTaken':
            if (ev.playerId === you) {
              sounds.play('pickup');
              haptics.light();
            }
            break;
          case 'playerDied':
            sounds.play('death', ev.playerId === you ? 1 : 0.6);
            if (ev.playerId === you) haptics.heavy();
            break;
          case 'gameOver':
            sounds.play(ev.winner === you ? 'win' : 'lose');
            if (ev.winner === you) haptics.success();
            break;
        }
      }
    },
    [],
  );

  const handleFrame = useCallback((frame: RenderFrame, fps: number, level: QualityLevel) => {
    setHud({
      players: frame.players.map((p) => ({ id: p.id, name: p.name, alive: p.alive })),
      over: frame.over,
      winner: frame.winner,
      fps,
      level,
    });
  }, []);

  const you = source.you;
  const result =
    hud?.over === true
      ? hud.winner === you
        ? { title: 'Kazandın! 🎉', tone: theme.ui.accent }
        : hud.winner === null
          ? { title: 'Berabere', tone: theme.ui.muted }
          : { title: `${hud.players.find((p) => p.id === hud.winner)?.name ?? 'Rakip'} kazandı`, tone: theme.ui.danger }
      : null;

  return (
    <View style={[styles.root, { backgroundColor: theme.ui.bg }]}>
      <View style={styles.hud}>
        <View style={styles.chips}>
          {hud?.players.map((p) => (
            <View key={p.id} style={[styles.chip, { backgroundColor: theme.ui.panel, opacity: p.alive ? 1 : 0.4 }]}>
              <View style={[styles.dot, { backgroundColor: theme.playerColors[p.id % theme.playerColors.length] }]} />
              <Text style={[styles.chipText, { color: theme.ui.text, textDecorationLine: p.alive ? 'none' : 'line-through' }]} numberOfLines={1}>
                {p.id === you ? 'Sen' : p.name}
              </Text>
            </View>
          ))}
        </View>
        <Pressable onPress={onExit} hitSlop={14} style={[styles.exit, { backgroundColor: theme.ui.panel }]}>
          <Text style={{ color: theme.ui.text, fontSize: 16, fontWeight: '800' }}>✕</Text>
        </Pressable>
      </View>
      {(subtitle || (settings.showFps && hud) || rttMs) && (
        <Text style={[styles.sub, { color: theme.ui.muted }]}>
          {[subtitle, rttMs ? `${Math.round(rttMs)} ms` : null, settings.showFps && hud ? `${Math.round(hud.fps)} fps · kalite ${hud.level}` : null]
            .filter(Boolean)
            .join('  ·  ')}
        </Text>
      )}

      <View style={styles.board} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {box.w > 0 && (
          <GameCanvas
            source={source}
            theme={theme}
            quality={settings.quality}
            width={box.w}
            height={box.h}
            onEvents={handleEvents}
            onFrame={handleFrame}
          />
        )}
      </View>

      <View style={styles.controlsSpace} />
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <TouchControls onDir={source.setDir.bind(source)} onBomb={source.pressBomb.bind(source)} accent={theme.ui.accent} />
      </View>

      {result && (
        <View style={styles.overlay}>
          <Text style={[styles.resultTitle, { color: result.tone }]}>{result.title}</Text>
          {onRestart ? <Button label={restartLabel} onPress={onRestart} /> : overHint ? <Text style={{ color: theme.ui.muted, fontSize: 15 }}>{overHint}</Text> : null}
          <Button label="Menü" variant="secondary" onPress={onExit} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hud: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 8, gap: 8, zIndex: 5 },
  chips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, maxWidth: 110 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  chipText: { fontSize: 12, fontWeight: '700' },
  exit: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  sub: { textAlign: 'center', fontSize: 12, marginTop: 4 },
  board: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 6 },
  controlsSpace: { height: 170 },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000000bb',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    zIndex: 10,
  },
  resultTitle: { fontSize: 34, fontWeight: '900', marginBottom: 12, textAlign: 'center', paddingHorizontal: 20 },
});

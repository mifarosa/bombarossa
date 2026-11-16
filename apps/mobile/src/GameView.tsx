import { useWindowDimensions, View, StyleSheet } from 'react-native';
import { Canvas, Circle, Group, Rect, RoundedRect } from '@shopify/react-native-skia';
import type { GameState, PowerUpKind } from '@bombarossa/game-core';
import { Tile } from '@bombarossa/game-core';

const COLORS = {
  floor: '#1f2937',
  wall: '#6b7280',
  block: '#b45309',
  bomb: '#0b0b0b',
  fuse: '#fbbf24',
  flame: '#f97316',
  flameCore: '#fde047',
};
const PLAYER_COLORS = ['#38bdf8', '#f43f5e', '#4ade80', '#facc15'];
const POWERUP_COLORS: Record<PowerUpKind, string> = {
  bomb: '#3b82f6',
  range: '#ef4444',
  speed: '#eab308',
};

export function GameView({ state }: { state: GameState }) {
  const { width: screenW } = useWindowDimensions();
  const cell = Math.floor(screenW / state.width);
  const w = cell * state.width;
  const h = cell * state.height;

  return (
    <View style={[styles.wrap, { width: w, height: h }]}>
      <Canvas style={{ width: w, height: h }}>
        <Rect x={0} y={0} width={w} height={h} color={COLORS.floor} />

        {state.tiles.map((t, i) => {
          if (t === Tile.Empty) return null;
          const x = (i % state.width) * cell;
          const y = Math.floor(i / state.width) * cell;
          return t === Tile.Wall ? (
            <Rect key={`t${i}`} x={x} y={y} width={cell} height={cell} color={COLORS.wall} />
          ) : (
            <RoundedRect
              key={`t${i}`}
              x={x + 1}
              y={y + 1}
              width={cell - 2}
              height={cell - 2}
              r={4}
              color={COLORS.block}
            />
          );
        })}

        {state.powerUps.map((u) => (
          <Circle
            key={`u${u.x},${u.y}`}
            cx={u.x * cell + cell / 2}
            cy={u.y * cell + cell / 2}
            r={cell * 0.28}
            color={POWERUP_COLORS[u.kind]}
          />
        ))}

        {state.bombs.map((b) => (
          <Group key={`b${b.id}`}>
            <Circle cx={b.x * cell + cell / 2} cy={b.y * cell + cell / 2} r={cell * 0.38} color={COLORS.bomb} />
            <Circle cx={b.x * cell + cell * 0.65} cy={b.y * cell + cell * 0.25} r={cell * 0.08} color={COLORS.fuse} />
          </Group>
        ))}

        {state.flames.map((f) => (
          <Group key={`f${f.x},${f.y}`}>
            <Rect x={f.x * cell + 2} y={f.y * cell + 2} width={cell - 4} height={cell - 4} color={COLORS.flame} />
            <Rect
              x={f.x * cell + cell * 0.25}
              y={f.y * cell + cell * 0.25}
              width={cell * 0.5}
              height={cell * 0.5}
              color={COLORS.flameCore}
            />
          </Group>
        ))}

        {state.players.map((p) =>
          p.alive ? (
            <Circle
              key={`p${p.id}`}
              cx={p.x * cell + cell / 2}
              cy={p.y * cell + cell / 2}
              r={cell * 0.36}
              color={PLAYER_COLORS[p.id % PLAYER_COLORS.length]}
            />
          ) : null,
        )}
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { alignSelf: 'center' } });

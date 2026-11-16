import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Dir } from '@bombarossa/game-core';

interface Props {
  onDir: (d: Dir | null) => void;
  onBomb: () => void;
}

const ARROWS: Record<Dir, string> = { up: '▲', down: '▼', left: '◀', right: '▶' };

export function Controls({ onDir, onBomb }: Props) {
  const current = useRef<Dir | null>(null);

  const press = (d: Dir) => {
    current.current = d;
    onDir(d);
  };
  // Only release if this button is still the active one, so sliding from one
  // arrow to another (release fires after the new press) doesn't stop movement.
  const release = (d: Dir) => {
    if (current.current === d) {
      current.current = null;
      onDir(null);
    }
  };

  const btn = (d: Dir) => (
    <Pressable
      onPressIn={() => press(d)}
      onPressOut={() => release(d)}
      style={({ pressed }) => [styles.arrow, pressed && styles.pressed]}
    >
      <Text style={styles.arrowText}>{ARROWS[d]}</Text>
    </Pressable>
  );

  return (
    <View style={styles.row}>
      <View style={styles.pad}>
        <View style={styles.padRow}>{btn('up')}</View>
        <View style={styles.padRow}>
          {btn('left')}
          <View style={styles.arrowGap} />
          {btn('right')}
        </View>
        <View style={styles.padRow}>{btn('down')}</View>
      </View>
      <Pressable
        onPressIn={onBomb}
        style={({ pressed }) => [styles.bomb, pressed && styles.pressed]}
      >
        <Text style={styles.bombText}>💣</Text>
      </Pressable>
    </View>
  );
}

const SIZE = 68;
const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24 },
  pad: { alignItems: 'center' },
  padRow: { flexDirection: 'row' },
  arrow: {
    width: SIZE,
    height: SIZE,
    margin: 3,
    borderRadius: 14,
    backgroundColor: '#33415588',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowGap: { width: SIZE * 0.4 },
  arrowText: { color: '#e2e8f0', fontSize: 26 },
  bomb: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#dc2626cc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bombText: { fontSize: 48 },
  pressed: { opacity: 0.6 },
});

import { useRef, useState } from 'react';
import { StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { FloatingStick, type Dir } from '@bombarossa/game-core';

interface Props {
  onDir: (dir: Dir | null) => void;
  onBomb: () => void;
  accent: string;
}

const RADIUS = 56;

/**
 * Full-area touch layer. Left half: a floating joystick that appears where
 * the thumb lands. Right half: tap anywhere to drop a bomb (the button is just
 * a hint, the whole half responds, which is far easier on a phone).
 */
export function TouchControls({ onDir, onBomb, accent }: Props) {
  const stick = useRef(new FloatingStick(RADIUS)).current;
  const stickTouch = useRef<string | null>(null);
  const rightTouches = useRef(new Set<string>()).current;
  const lastDir = useRef<Dir | null>(null);
  const [width, setWidth] = useState(0);
  const [joy, setJoy] = useState<{ ox: number; oy: number; kx: number; ky: number } | null>(null);
  const [bombDown, setBombDown] = useState(false);

  const emitDir = (d: Dir | null) => {
    if (d !== lastDir.current) {
      lastDir.current = d;
      onDir(d);
    }
  };
  const showStick = () => {
    const k = stick.knob();
    setJoy({ ox: stick.originX, oy: stick.originY, kx: k.x, ky: k.y });
  };

  const start = (e: GestureResponderEvent) => {
    for (const t of e.nativeEvent.changedTouches) {
      const id = String(t.identifier);
      if (t.locationX < width / 2) {
        if (stickTouch.current === null) {
          stickTouch.current = id;
          stick.begin(t.locationX, t.locationY);
          showStick();
        }
      } else {
        rightTouches.add(id);
        setBombDown(true);
        onBomb();
      }
    }
  };

  const move = (e: GestureResponderEvent) => {
    for (const t of e.nativeEvent.changedTouches) {
      if (String(t.identifier) === stickTouch.current) {
        emitDir(stick.move(t.locationX, t.locationY));
        showStick();
      }
    }
  };

  const end = (e: GestureResponderEvent) => {
    for (const t of e.nativeEvent.changedTouches) {
      const id = String(t.identifier);
      if (id === stickTouch.current) {
        stickTouch.current = null;
        stick.end();
        emitDir(null);
        setJoy(null);
      } else {
        rightTouches.delete(id);
        if (rightTouches.size === 0) setBombDown(false);
      }
    }
  };

  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onTouchStart={start}
      onTouchMove={move}
      onTouchEnd={end}
      onTouchCancel={end}
    >
      {/* resting hint so players know where the stick lives */}
      {!joy && <View pointerEvents="none" style={[styles.ring, styles.hint]} />}
      {joy && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View style={[styles.ring, { left: joy.ox - RADIUS, top: joy.oy - RADIUS }]} />
          <View style={[styles.knob, { left: joy.ox + joy.kx - 26, top: joy.oy + joy.ky - 26, backgroundColor: accent }]} />
        </View>
      )}
      <View pointerEvents="none" style={[styles.bomb, bombDown && styles.bombDown, { borderColor: accent }]}>
        <Text style={styles.bombText}>💣</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
    width: RADIUS * 2,
    height: RADIUS * 2,
    borderRadius: RADIUS,
    borderWidth: 3,
    borderColor: '#ffffff66',
    backgroundColor: '#ffffff1a',
  },
  hint: { left: 36, bottom: 52, opacity: 0.55 },
  knob: { position: 'absolute', width: 52, height: 52, borderRadius: 26, opacity: 0.85 },
  bomb: {
    position: 'absolute',
    right: 28,
    bottom: 48,
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 4,
    backgroundColor: '#00000066',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.8,
  },
  bombDown: { opacity: 1, transform: [{ scale: 0.92 }], backgroundColor: '#00000099' },
  bombText: { fontSize: 52 },
});

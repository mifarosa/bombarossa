import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Canvas, Group, Picture, createPicture, type SkPicture } from '@shopify/react-native-skia';
import type { GameEvent, GameSource, RenderFrame } from '@bombarossa/game-core';
import { Effects } from './render/effects';
import { SkiaPainter } from './render/skiaPainter';
import type { QualityLevel, Theme } from './render/theme';
import type { QualitySetting } from './settings';

interface Props {
  source: GameSource;
  theme: Theme;
  quality: QualitySetting;
  /** Space available for the board, in px. The board is scaled to fit. */
  width: number;
  height: number;
  onEvents?: (events: GameEvent[], frame: RenderFrame) => void;
  /** ~4 times per second. */
  onFrame?: (frame: RenderFrame, fps: number, level: QualityLevel) => void;
}

interface ViewState {
  staticPic: SkPicture | null;
  dyn: SkPicture | null;
  w: number;
  h: number;
  sx: number;
  sy: number;
}

const SLOW_FRAME_MS = 27; // ~37 fps
const SLOW_STREAK_TO_DEGRADE = 45;

/**
 * Draws the game with Skia. The floor/walls/blocks are recorded once into a
 * picture and only re-recorded when a block breaks; everything that moves is
 * recorded each frame. On slow phones the quality steps down by itself.
 */
export function GameCanvas({ source, theme, quality, width, height, onEvents, onFrame }: Props) {
  const [view, setView] = useState<ViewState>({ staticPic: null, dyn: null, w: 0, h: 0, sx: 0, sy: 0 });
  const sizeRef = useRef({ width, height });
  sizeRef.current = { width, height };
  const cb = useRef({ onEvents, onFrame });
  cb.current = { onEvents, onFrame };

  useEffect(() => {
    let raf = 0;
    let alive = true;
    const effects = new Effects();
    let level: QualityLevel = quality === 'low' ? 0 : 2;
    let staticPic: SkPicture | null = null;
    let staticKey = '';
    const graveyard: SkPicture[] = [];
    let last = performance.now();
    let avg = 16;
    let slowStreak = 0;
    let cooldownUntil = last + 3000;
    let lastInfo = 0;

    const retire = (pic: SkPicture | null) => {
      if (!pic) return;
      graveyard.push(pic);
      // Dispose a few frames later so a picture still being rendered is never freed.
      while (graveyard.length > 4) {
        try {
          graveyard.shift()!.dispose();
        } catch {
          // already gone
        }
      }
    };

    const loop = () => {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = now - last;
      if (level === 0 && dt < 28) return; // low quality runs at 30 fps
      last = now;

      source.update(now);
      const events = source.drainEvents();
      const frame = source.getFrame(now);
      if (!frame) return;

      if (events.length > 0) {
        for (const ev of events) effects.onEvent(ev, level, theme.playerColors);
        cb.current.onEvents?.(events, frame);
      }

      const { width: aw, height: ah } = sizeRef.current;
      const cell = Math.max(10, Math.floor(Math.min(aw / frame.width, ah / frame.height)));
      const w = frame.width * cell;
      const h = frame.height * cell;

      const key = `${theme.id}|${cell}|${level}|${frame.tilesVersion}|${frame.width}x${frame.height}`;
      if (key !== staticKey) {
        retire(staticPic);
        staticPic = createPicture(
          (canvas) => theme.drawStatic(new SkiaPainter(canvas), frame, { cell, quality: level }),
          { width: w, height: h },
        );
        staticKey = key;
      }

      effects.update(Math.min(dt, 100));
      const dyn = createPicture(
        (canvas) => {
          const p = new SkiaPainter(canvas);
          theme.drawDynamic(p, frame, { cell, quality: level });
          effects.draw(p, cell, theme.particleShape);
        },
        { width: w, height: h },
      );
      const shake = level === 2 ? effects.shakeOffset() : { x: 0, y: 0 };
      setView((prev) => {
        retire(prev.dyn);
        return { staticPic, dyn, w, h, sx: shake.x * cell, sy: shake.y * cell };
      });

      // Frame pacing: measure, and step quality down if the device can't keep up.
      const clamped = Math.min(dt, 100);
      avg = avg * 0.94 + clamped * 0.06;
      if (quality === 'auto' && level > 0 && now > cooldownUntil && level !== 0) {
        slowStreak = avg > SLOW_FRAME_MS ? slowStreak + 1 : 0;
        if (slowStreak > SLOW_STREAK_TO_DEGRADE) {
          level = (level - 1) as QualityLevel;
          slowStreak = 0;
          cooldownUntil = now + 3000;
          avg = 16;
          effects.clear();
        }
      }
      if (now - lastInfo > 250) {
        lastInfo = now;
        cb.current.onFrame?.(frame, 1000 / Math.max(avg, 1), level);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [source, theme, quality]);

  if (!view.dyn || !view.staticPic) return <View style={{ width, height }} />;
  return (
    <Canvas style={{ width: view.w, height: view.h }}>
      <Group transform={[{ translateX: view.sx }, { translateY: view.sy }]}>
        <Picture picture={view.staticPic} />
        <Picture picture={view.dyn} />
      </Group>
    </Canvas>
  );
}

/**
 * Renders theme previews to PNG with the software rasteriser (no phone needed).
 *   npx tsx tools/preview/render.ts <outDir>
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  UNIT,
  createGame,
  botInput,
  step,
  type GameState,
  type Input,
  type RenderFrame,
  Tile,
} from '@bombarossa/game-core';
import { cartoonTheme } from '../../apps/mobile/src/render/cartoon';
import { classicTheme } from '../../apps/mobile/src/render/classic';
import type { QualityLevel, Theme } from '../../apps/mobile/src/render/theme';
import { Effects } from '../../apps/mobile/src/render/effects';
import { RasterPainter } from './raster';

const out = process.argv[2] ?? 'preview-out';
mkdirSync(out, { recursive: true });

function frameFrom(s: GameState, timeMs: number): RenderFrame {
  return {
    tick: s.tick,
    width: s.width,
    height: s.height,
    tiles: s.tiles,
    tilesVersion: 0,
    players: s.players.map((p) => ({
      id: p.id,
      x: p.x / UNIT,
      y: p.y / UNIT,
      alive: p.alive,
      facing: p.facing,
      moving: p.moving,
      name: `P${p.id}`,
    })),
    bombs: s.bombs.map((b) => ({ id: b.id, x: b.x, y: b.y, timer: b.timer })),
    flames: s.flames,
    powerUps: s.powerUps,
    over: s.over,
    winner: s.winner,
    you: 0,
    timeMs,
  };
}

/** A busy mid-game moment: several bombs, flames and power-ups at once. */
function midGame(players: number, seed: number): GameState {
  const s = createGame(seed, players);
  let best = s;
  let bestScore = -1;
  for (let i = 0; i < 2500 && !s.over; i++) {
    const inputs: Record<number, Input> = {};
    for (const p of s.players) inputs[p.id] = botInput(s, p.id);
    step(s, inputs);
    const score = s.flames.length * 2 + s.bombs.length * 3 + s.powerUps.length + s.players.filter((p) => p.moving).length;
    if (i > 200 && score > bestScore) {
      bestScore = score;
      best = JSON.parse(JSON.stringify(s));
    }
  }
  // make sure every power-up kind is visible
  const free: Array<[number, number]> = [];
  for (let y = 1; y < best.height - 1; y++) for (let x = 1; x < best.width - 1; x++) {
    if (best.tiles[y * best.width + x] === Tile.Empty && !best.powerUps.some((u) => u.x === x && u.y === y)) free.push([x, y]);
  }
  best.powerUps = [
    { x: free[3][0], y: free[3][1], kind: 'bomb' },
    { x: free[9][0], y: free[9][1], kind: 'range' },
    { x: free[15][0], y: free[15][1], kind: 'speed' },
  ];
  return best;
}

function renderBoard(theme: Theme, s: GameState, cell: number, quality: QualityLevel, name: string, t = 1234): void {
  const f = frameFrom(s, t);
  const p = new RasterPainter(f.width * cell, f.height * cell);
  p.clear('#000000');
  theme.drawStatic(p, f, { cell, quality });
  theme.drawDynamic(p, f, { cell, quality });
  p.save_png(join(out, `${name}.png`));
}

/** Large close-up of every entity in every state, for checking details. */
function renderSheet(theme: Theme, name: string, quality: QualityLevel): void {
  const cell = 120;
  const s = createGame(1, 6);
  const w = 9;
  const h = 5;
  s.width = w;
  s.height = h;
  s.tiles = new Array(w * h).fill(Tile.Empty);
  for (let x = 0; x < w; x++) s.tiles[x] = s.tiles[(h - 1) * w + x] = Tile.Wall;
  s.tiles[1 * w + 8] = Tile.Block;
  s.tiles[2 * w + 8] = Tile.Wall;
  s.bombs = [
    { id: 1, owner: 0, x: 0, y: 1, timer: 80, range: 2, pass: [] },
    { id: 2, owner: 0, x: 1, y: 1, timer: 20, range: 2, pass: [] },
  ];
  s.flames = [
    { x: 2, y: 1, ttl: 8 },
    { x: 3, y: 1, ttl: 14 },
    { x: 4, y: 1, ttl: 3 },
  ];
  s.powerUps = [
    { x: 5, y: 1, kind: 'bomb' },
    { x: 6, y: 1, kind: 'range' },
    { x: 7, y: 1, kind: 'speed' },
  ];
  const faces = ['down', 'left', 'right', 'up'] as const;
  s.players = faces.flatMap((facing, i) =>
    [false, true].map((moving, j) => ({
      id: i * 2 + j,
      x: (1 + i * 2 + j * 0 + 0.5) * UNIT,
      y: (2.5 + j) * UNIT,
      alive: true,
      maxBombs: 1,
      range: 2,
      speed: 170,
      facing,
      moving,
    })),
  );
  // spread players over the grid
  s.players.forEach((p, i) => {
    p.x = (0.5 + (i % 8)) * UNIT;
    p.y = (2.5 + Math.floor(i / 8)) * UNIT;
  });
  const f = frameFrom(s, 300);
  f.you = 0;
  const p = new RasterPainter(w * cell, h * cell, 2);
  p.clear('#000000');
  theme.drawStatic(p, f, { cell, quality });
  theme.drawDynamic(p, f, { cell, quality });
  p.save_png(join(out, `${name}.png`));
  // same sheet a moment later (animation frame 2)
  const p2 = new RasterPainter(w * cell, h * cell, 2);
  p2.clear('#000000');
  const f2 = { ...f, timeMs: 300 + 140 };
  theme.drawStatic(p2, f2, { cell, quality });
  theme.drawDynamic(p2, f2, { cell, quality });
  p2.save_png(join(out, `${name}-b.png`));
}

/** The moment of a blast: particles from an explosion, debris, a pickup and a death. */
function renderEffects(theme: Theme, s: GameState, cell: number, name: string): void {
  const f = frameFrom(s, 2000);
  const fx = new Effects();
  const evs = [
    { type: 'explosion', x: 5, y: 5 },
    { type: 'blockDestroyed', x: 6, y: 5 },
    { type: 'powerUpTaken', playerId: 0, kind: 'range', x: 3, y: 3 },
    { type: 'playerDied', playerId: 1, x: 8, y: 7 },
  ] as const;
  for (const e of evs) fx.onEvent(e as never, 2, theme.playerColors);
  fx.update(110);
  const p = new RasterPainter(f.width * cell, f.height * cell);
  p.clear('#000000');
  theme.drawStatic(p, f, { cell, quality: 2 });
  theme.drawDynamic(p, f, { cell, quality: 2 });
  fx.draw(p, cell, theme.particleShape);
  p.save_png(join(out, `${name}.png`));
}

for (const theme of [cartoonTheme, classicTheme]) {
  renderEffects(theme, midGame(4, 5), 56, `${theme.id}-effects`);
  renderBoard(theme, midGame(4, 5), 56, 2, `${theme.id}-board4`);
  renderBoard(theme, midGame(6, 8), 48, 2, `${theme.id}-board6`);
  renderBoard(theme, midGame(4, 5), 28, 2, `${theme.id}-board4-phone`);
  renderBoard(theme, midGame(4, 5), 56, 0, `${theme.id}-board4-low`);
  renderSheet(theme, `${theme.id}-sheet`, 2);
}
console.log('wrote previews to', out);

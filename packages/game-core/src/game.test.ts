import { describe, expect, it } from 'vitest';
import {
  BOMB_TIMER,
  GRID_H,
  GRID_W,
  GameState,
  Tile,
  botInput,
  createGame,
  idx,
  step,
  SPAWNS,
} from './index';

/** Empty arena (walls on the border only) to test mechanics in isolation. */
function arena(playerCount = 2): GameState {
  const s = createGame(1, playerCount);
  s.tiles = s.tiles.map((t, i) => {
    const x = i % GRID_W;
    const y = Math.floor(i / GRID_W);
    const border = x === 0 || y === 0 || x === GRID_W - 1 || y === GRID_H - 1;
    return border ? Tile.Wall : Tile.Empty;
  });
  return s;
}

function run(s: GameState, ticks: number, inputs = {}) {
  for (let i = 0; i < ticks; i++) step(s, inputs);
}

describe('map', () => {
  it('has walls on the border and keeps spawns free', () => {
    const s = createGame(42, 4);
    for (let x = 0; x < GRID_W; x++) {
      expect(s.tiles[idx(x, 0)]).toBe(Tile.Wall);
      expect(s.tiles[idx(x, GRID_H - 1)]).toBe(Tile.Wall);
    }
    for (const [x, y] of SPAWNS) {
      expect(s.tiles[idx(x, y)]).toBe(Tile.Empty);
      expect(s.tiles[idx(x + (x < GRID_W / 2 ? 1 : -1), y)]).toBe(Tile.Empty);
      expect(s.tiles[idx(x, y + (y < GRID_H / 2 ? 1 : -1))]).toBe(Tile.Empty);
    }
  });

  it('is deterministic for the same seed and differs between seeds', () => {
    expect(createGame(7, 2).tiles).toEqual(createGame(7, 2).tiles);
    expect(createGame(7, 2).tiles).not.toEqual(createGame(8, 2).tiles);
  });
});

describe('movement', () => {
  it('moves one cell and respects the move cooldown', () => {
    const s = arena();
    step(s, { 0: { dir: 'right', bomb: false } });
    expect(s.players[0].x).toBe(2);
    step(s, { 0: { dir: 'right', bomb: false } });
    expect(s.players[0].x).toBe(2); // still cooling down
    run(s, 4, { 0: { dir: 'right', bomb: false } });
    expect(s.players[0].x).toBe(3);
  });

  it('cannot walk into walls or blocks', () => {
    const s = arena();
    run(s, 20, { 0: { dir: 'up', bomb: false } });
    expect(s.players[0].y).toBe(1); // border wall above
    s.tiles[idx(2, 1)] = Tile.Block;
    run(s, 20, { 0: { dir: 'right', bomb: false } });
    expect(s.players[0].x).toBe(1);
  });

  it('cannot walk onto a bomb but can leave the cell it placed it on', () => {
    const s = arena();
    step(s, { 0: { dir: null, bomb: true } });
    expect(s.bombs).toHaveLength(1);
    run(s, 5, { 0: { dir: 'right', bomb: false } });
    expect(s.players[0].x).toBeGreaterThan(1);
    run(s, 10, { 0: { dir: 'left', bomb: false } });
    expect(s.players[0].x).toBe(2); // bomb at x=1 blocks the way back
  });
});

describe('bombs', () => {
  it('limits simultaneous bombs to maxBombs', () => {
    const s = arena();
    step(s, { 0: { dir: null, bomb: true } });
    step(s, { 0: { dir: 'right', bomb: false } });
    run(s, 5, { 0: { dir: 'right', bomb: false } });
    step(s, { 0: { dir: null, bomb: true } });
    expect(s.bombs).toHaveLength(1);
  });

  it('explodes after the timer, creating flames with the right range', () => {
    const s = arena(3);
    s.players[1].x = 11;
    s.players[1].y = 9;
    s.players[2].x = 11;
    s.players[2].y = 8;
    s.players[0].x = 6;
    s.players[0].y = 5;
    step(s, { 0: { dir: null, bomb: true } });
    s.players[0].x = 6;
    s.players[0].y = 1; // moved out of the blast
    run(s, BOMB_TIMER - 1);
    expect(s.bombs).toHaveLength(0);
    const cells = new Set(s.flames.map((f) => `${f.x},${f.y}`));
    expect(cells.has('6,5')).toBe(true);
    expect(cells.has('8,5')).toBe(true); // range 2
    expect(cells.has('9,5')).toBe(false);
    expect(cells.has('6,3')).toBe(true);
  });

  it('flames expire', () => {
    const s = arena(3);
    s.players[0].x = 6;
    s.players[0].y = 1;
    s.bombs.push({ id: 99, owner: 0, x: 6, y: 5, timer: 1, range: 2 });
    step(s);
    expect(s.flames.length).toBeGreaterThan(0);
    run(s, 20);
    expect(s.flames).toHaveLength(0);
  });

  it('destroys a block and stops the flame there', () => {
    const s = arena(3);
    s.players[0].x = 1;
    s.players[0].y = 1;
    s.tiles[idx(6, 5)] = Tile.Block;
    s.bombs.push({ id: 99, owner: 0, x: 5, y: 5, timer: 1, range: 3 });
    step(s);
    expect(s.tiles[idx(6, 5)]).toBe(Tile.Empty);
    expect(s.flames.some((f) => f.x === 6 && f.y === 5)).toBe(true);
    expect(s.flames.some((f) => f.x === 7 && f.y === 5)).toBe(false);
  });

  it('chains explosions between bombs', () => {
    const s = arena(3);
    s.bombs.push({ id: 1, owner: 0, x: 5, y: 5, timer: 1, range: 2 });
    s.bombs.push({ id: 2, owner: 0, x: 7, y: 5, timer: 100, range: 2 });
    step(s);
    expect(s.bombs).toHaveLength(0);
    expect(s.flames.some((f) => f.x === 9 && f.y === 5)).toBe(true);
  });

  it('kills players in the blast and declares a winner', () => {
    const s = arena(2);
    s.players[0].x = 1;
    s.players[0].y = 1;
    s.players[1].x = 6;
    s.players[1].y = 1;
    s.bombs.push({ id: 1, owner: 0, x: 5, y: 1, timer: 1, range: 2 });
    step(s);
    expect(s.players[1].alive).toBe(false);
    expect(s.players[0].alive).toBe(true);
    expect(s.over).toBe(true);
    expect(s.winner).toBe(0);
  });

  it('is a draw when everyone dies at once', () => {
    const s = arena(2);
    s.players[0].x = 5;
    s.players[0].y = 5;
    s.players[1].x = 6;
    s.players[1].y = 5;
    s.bombs.push({ id: 1, owner: 0, x: 5, y: 5, timer: 1, range: 2 });
    step(s);
    expect(s.over).toBe(true);
    expect(s.winner).toBeNull();
  });
});

describe('power-ups', () => {
  it('are collected and applied', () => {
    const s = arena();
    s.powerUps.push({ x: 2, y: 1, kind: 'bomb' });
    step(s, { 0: { dir: 'right', bomb: false } });
    expect(s.players[0].maxBombs).toBe(2);
    expect(s.powerUps).toHaveLength(0);
  });
});

describe('determinism', () => {
  it('same seed and inputs give the same final state', () => {
    const play = () => {
      const s = createGame(123, 4);
      for (let i = 0; i < 400; i++) {
        const inputs: Record<number, ReturnType<typeof botInput>> = {};
        for (const p of s.players) inputs[p.id] = botInput(s, p.id);
        step(s, inputs);
      }
      return JSON.stringify(s);
    };
    expect(play()).toBe(play());
  });
});

describe('bots', () => {
  it('play a full game without breaking invariants, and make progress', () => {
    const s = createGame(5, 4);
    const initialBlocks = s.tiles.filter((t) => t === Tile.Block).length;
    for (let i = 0; i < 20 * 120 && !s.over; i++) {
      const inputs: Record<number, ReturnType<typeof botInput>> = {};
      for (const p of s.players) inputs[p.id] = botInput(s, p.id);
      step(s, inputs);
      for (const p of s.players) {
        if (p.alive) expect(s.tiles[idx(p.x, p.y)]).toBe(Tile.Empty);
      }
    }
    const blocksLeft = s.tiles.filter((t) => t === Tile.Block).length;
    expect(blocksLeft).toBeLessThan(initialBlocks);
  });

  it('flee from a bomb about to explode', () => {
    const s = arena(2);
    s.players[1].x = 11;
    s.players[1].y = 9;
    s.bombs.push({ id: 1, owner: 1, x: 2, y: 1, timer: 20, range: 2 });
    for (let i = 0; i < 18; i++) step(s, { 0: botInput(s, 0) });
    expect(s.players[0].alive).toBe(true);
  });
});

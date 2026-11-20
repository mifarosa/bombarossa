import { describe, expect, it } from 'vitest';
import { arena } from './test-utils';
import {
  BASE_SPEED,
  BOMB_TIMER,
  GameState,
  HALF,
  Input,
  Tile,
  UNIT,
  botInput,
  cellOf,
  createGame,
  idx,
  mapSizeFor,
  spawnsFor,
  step,
} from './index';

const C = (cell: number) => cell * UNIT + UNIT / 2; // centre of a cell in sub-units

function run(s: GameState, ticks: number, inputs: Record<number, Input> = {}) {
  for (let i = 0; i < ticks; i++) step(s, inputs);
}
const go = (dir: Input['dir']): Record<number, Input> => ({ 0: { dir, bomb: false } });

describe('map', () => {
  it('picks the arena size from the player count', () => {
    expect(mapSizeFor(2)).toEqual({ width: 13, height: 11 });
    expect(mapSizeFor(4)).toEqual({ width: 13, height: 11 });
    expect(mapSizeFor(5)).toEqual({ width: 15, height: 13 });
    expect(mapSizeFor(6)).toEqual({ width: 15, height: 13 });
  });

  it.each([1, 2, 3, 4, 5, 6])('keeps spawns of %i players free and walls on the border', (n) => {
    const s = createGame(42, n);
    for (let x = 0; x < s.width; x++) {
      expect(s.tiles[idx(s.width, x, 0)]).toBe(Tile.Wall);
      expect(s.tiles[idx(s.width, x, s.height - 1)]).toBe(Tile.Wall);
    }
    for (const p of s.players) {
      const cx = cellOf(p.x);
      const cy = cellOf(p.y);
      expect(s.tiles[idx(s.width, cx, cy)]).toBe(Tile.Empty);
      // at least two open neighbours so nobody starts boxed in
      const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(
        ([dx, dy]) => s.tiles[idx(s.width, cx + dx, cy + dy)] === Tile.Empty,
      );
      expect(open.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('spawns players on distinct cells', () => {
    const s = createGame(1, 6);
    const cells = new Set(s.players.map((p) => `${cellOf(p.x)},${cellOf(p.y)}`));
    expect(cells.size).toBe(6);
    const spawns = spawnsFor(15, 13);
    expect(spawns).toHaveLength(6);
  });

  it('is deterministic for the same seed and differs between seeds', () => {
    expect(createGame(7, 2).tiles).toEqual(createGame(7, 2).tiles);
    expect(createGame(7, 2).tiles).not.toEqual(createGame(8, 2).tiles);
  });

  it('rejects invalid player counts', () => {
    expect(() => createGame(1, 0)).toThrow();
    expect(() => createGame(1, 7)).toThrow();
  });
});

describe('continuous movement', () => {
  it('moves by the player speed every tick', () => {
    const s = arena();
    step(s, go('right'));
    expect(s.players[0].x).toBe(C(1) + BASE_SPEED);
    step(s, go('right'));
    expect(s.players[0].x).toBe(C(1) + 2 * BASE_SPEED);
    expect(s.players[0].moving).toBe(true);
    step(s);
    expect(s.players[0].moving).toBe(false);
  });

  it('stops flush against walls and blocks', () => {
    const s = arena();
    run(s, 30, go('left'));
    expect(s.players[0].x).toBe(UNIT + HALF);
    s.tiles[idx(s.width, 3, 1)] = Tile.Block;
    run(s, 30, go('right'));
    expect(s.players[0].x).toBe(3 * UNIT - HALF);
    run(s, 30, go('up'));
    expect(s.players[0].y).toBe(UNIT + HALF);
  });

  it('slides around a corner when only the box edge clips an obstacle', () => {
    const s = arena();
    s.tiles[idx(s.width, 2, 2)] = Tile.Block;
    s.players[0].x = 1800; // box overlaps columns 1 and 2, centre is in column 1 (open)
    s.players[0].y = C(1);
    run(s, 12, go('down'));
    expect(s.players[0].x + HALF).toBeLessThanOrEqual(2 * UNIT); // slid clear of the block's column…
    expect(s.players[0].y).toBeGreaterThan(C(1) + UNIT); // …and kept going down
  });

  it('does not slide when the centre lane itself is blocked', () => {
    const s = arena();
    s.tiles[idx(s.width, 2, 2)] = Tile.Block;
    s.players[0].x = 2100; // centre in column 2 (blocked)
    s.players[0].y = C(1);
    run(s, 20, go('down'));
    expect(s.players[0].x).toBe(2100);
    expect(s.players[0].y).toBe(2 * UNIT - HALF);
  });

  it('records the facing direction even when blocked', () => {
    const s = arena();
    run(s, 5, go('up'));
    expect(s.players[0].facing).toBe('up');
    expect(s.players[0].moving).toBe(false);
  });

  it('lets a player walk off their own bomb but not back onto it', () => {
    const s = arena();
    step(s, { 0: { dir: 'right', bomb: true } });
    expect(s.bombs).toHaveLength(1);
    expect(s.bombs[0].pass).toContain(0);
    run(s, 8, go('right')); // fully left the bomb cell
    run(s, 40, go('left'));
    expect(s.players[0].x).toBe(2 * UNIT + HALF); // stopped flush against the bomb in cell 1
    expect(s.bombs[0].pass).not.toContain(0);
  });

  it('keeps players inside the arena', () => {
    const s = createGame(3, 4);
    for (const dir of ['up', 'left', 'down', 'right'] as const) {
      run(s, 400, { 0: { dir, bomb: false } });
      const p = s.players[0];
      expect(p.x).toBeGreaterThan(UNIT);
      expect(p.y).toBeGreaterThan(UNIT);
      expect(p.x).toBeLessThan((s.width - 1) * UNIT);
      expect(p.y).toBeLessThan((s.height - 1) * UNIT);
    }
  });
});

describe('bombs', () => {
  it('limits simultaneous bombs to maxBombs', () => {
    const s = arena();
    step(s, { 0: { dir: null, bomb: true } });
    run(s, 10, go('right'));
    step(s, { 0: { dir: null, bomb: true } });
    expect(s.bombs).toHaveLength(1);
  });

  it('places the bomb in the cell of the player centre', () => {
    const s = arena();
    s.players[0].x = 5400;
    s.players[0].y = 3600;
    step(s, { 0: { dir: null, bomb: true } });
    expect(s.bombs[0]).toMatchObject({ x: 5, y: 3 });
  });

  it('explodes exactly after the timer with the right range', () => {
    const s = arena(3);
    s.players[0].x = C(6);
    s.players[0].y = C(5);
    step(s, { 0: { dir: null, bomb: true } });
    s.players[0].x = C(6);
    s.players[0].y = C(1); // out of the blast
    s.players[1].x = C(11);
    s.players[1].y = C(9);
    run(s, BOMB_TIMER - 2);
    expect(s.bombs).toHaveLength(1);
    step(s);
    expect(s.bombs).toHaveLength(0);
    const cells = new Set(s.flames.map((f) => `${f.x},${f.y}`));
    expect(cells.has('6,5')).toBe(true);
    expect(cells.has('8,5')).toBe(true); // range 2
    expect(cells.has('9,5')).toBe(false);
    expect(cells.has('6,3')).toBe(true);
  });

  it('flames expire', () => {
    const s = arena(3);
    s.players[0].x = C(6);
    s.players[0].y = C(1);
    s.bombs.push({ id: 99, owner: 0, x: 6, y: 5, timer: 1, range: 2, pass: [] });
    step(s);
    expect(s.flames.length).toBeGreaterThan(0);
    run(s, 30);
    expect(s.flames).toHaveLength(0);
  });

  it('destroys a block and stops the flame there', () => {
    const s = arena(3);
    s.tiles[idx(s.width, 6, 5)] = Tile.Block;
    s.bombs.push({ id: 99, owner: 0, x: 5, y: 5, timer: 1, range: 3, pass: [] });
    step(s);
    expect(s.tiles[idx(s.width, 6, 5)]).toBe(Tile.Empty);
    expect(s.flames.some((f) => f.x === 6 && f.y === 5)).toBe(true);
    expect(s.flames.some((f) => f.x === 7 && f.y === 5)).toBe(false);
  });

  it('chains explosions between bombs', () => {
    const s = arena(3);
    s.bombs.push({ id: 1, owner: 0, x: 5, y: 5, timer: 1, range: 2, pass: [] });
    s.bombs.push({ id: 2, owner: 0, x: 7, y: 5, timer: 100, range: 2, pass: [] });
    step(s);
    expect(s.bombs).toHaveLength(0);
    expect(s.flames.some((f) => f.x === 9 && f.y === 5)).toBe(true);
  });

  it('kills players whose centre is in the blast and declares a winner', () => {
    const s = arena(2);
    s.players[1].x = C(6);
    s.players[1].y = C(1);
    s.bombs.push({ id: 1, owner: 0, x: 5, y: 1, timer: 1, range: 2, pass: [] });
    step(s);
    expect(s.players[1].alive).toBe(false);
    expect(s.players[0].alive).toBe(true);
    expect(s.over).toBe(true);
    expect(s.winner).toBe(0);
  });

  it('is a draw when everyone dies at once', () => {
    const s = arena(2);
    s.players[0].x = C(5);
    s.players[0].y = C(5);
    s.players[1].x = C(6);
    s.players[1].y = C(5);
    s.bombs.push({ id: 1, owner: 0, x: 5, y: 5, timer: 1, range: 2, pass: [] });
    step(s);
    expect(s.over).toBe(true);
    expect(s.winner).toBeNull();
  });

  it('keeps playing in sandbox mode (single player)', () => {
    const s = createGame(3, 1);
    run(s, 300);
    expect(s.over).toBe(false);
  });
});

describe('power-ups', () => {
  it('are collected and applied', () => {
    const s = arena();
    s.powerUps.push({ x: 2, y: 1, kind: 'bomb' }, { x: 3, y: 1, kind: 'range' }, { x: 4, y: 1, kind: 'speed' });
    run(s, 40, go('right'));
    expect(s.players[0].maxBombs).toBe(2);
    expect(s.players[0].range).toBe(3);
    expect(s.players[0].speed).toBeGreaterThan(BASE_SPEED);
    expect(s.powerUps).toHaveLength(0);
  });
});

describe('bots', () => {
  function playBots(seed: number, n: number, ticks: number) {
    const s = createGame(seed, n);
    const start = s.players.map((p) => ({ x: p.x, y: p.y }));
    const travelled = new Array(n).fill(0);
    let prev = start;
    for (let i = 0; i < ticks && !s.over; i++) {
      const inputs: Record<number, Input> = {};
      for (const p of s.players) inputs[p.id] = botInput(s, p.id);
      step(s, inputs);
      s.players.forEach((p, k) => {
        travelled[k] += Math.abs(p.x - prev[k].x) + Math.abs(p.y - prev[k].y);
      });
      prev = s.players.map((p) => ({ x: p.x, y: p.y }));
      for (const p of s.players) {
        if (!p.alive) continue;
        expect(s.tiles[idx(s.width, cellOf(p.x), cellOf(p.y))]).toBe(Tile.Empty);
      }
    }
    return { s, travelled };
  }

  it('play a 4-player game without breaking invariants and make progress', () => {
    const initialBlocks = createGame(5, 4).tiles.filter((t) => t === Tile.Block).length;
    const { s, travelled } = playBots(5, 4, 30 * 150);
    expect(s.tiles.filter((t) => t === Tile.Block).length).toBeLessThan(initialBlocks);
    expect(Math.max(...travelled)).toBeGreaterThan(5 * UNIT);
  });

  it('handle the 6-player arena', () => {
    const { s } = playBots(9, 6, 30 * 60);
    expect(s.width).toBe(15);
  });

  it('flee from a bomb about to explode', () => {
    const s = arena(2);
    s.players[1].x = C(11);
    s.players[1].y = C(9);
    s.bombs.push({ id: 1, owner: 1, x: 2, y: 1, timer: 60, range: 2, pass: [] });
    for (let i = 0; i < 58; i++) step(s, { 0: botInput(s, 0) });
    expect(s.players[0].alive).toBe(true);
  });

  it('are deterministic', () => {
    const a = playBots(11, 4, 600).s;
    const b = playBots(11, 4, 600).s;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

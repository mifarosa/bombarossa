import {
  BASE_SPEED,
  BOMB_TIMER,
  FLAME_TTL,
  HALF,
  MAX_BOMBS,
  MAX_PLAYERS,
  MAX_RANGE,
  MAX_SPEED,
  POWERUP_CHANCE,
  SPEED_STEP,
  START_BOMBS,
  START_RANGE,
  UNIT,
  mapSizeFor,
  spawnsFor,
} from './constants';
import { generateTiles } from './map';
import { nextRandom } from './rng';
import { Bomb, Dir, GameState, Input, NO_INPUT, Player, PowerUpKind, Tile } from './types';

export const DIRS: Record<Dir, readonly [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};
export const DIR_LIST: Dir[] = ['up', 'down', 'left', 'right'];
const POWERUP_KINDS: PowerUpKind[] = ['bomb', 'range', 'speed'];

export function idx(width: number, x: number, y: number): number {
  return y * width + x;
}

export function cellOf(units: number): number {
  return Math.floor(units / UNIT);
}

export function inBounds(state: Pick<GameState, 'width' | 'height'>, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < state.width && y < state.height;
}

/** Creates a new match for 1..6 players (1 = sandbox that never ends). */
export function createGame(seed: number, playerCount: number): GameState {
  if (playerCount < 1 || playerCount > MAX_PLAYERS) {
    throw new Error(`playerCount must be 1..${MAX_PLAYERS}`);
  }
  const { width, height } = mapSizeFor(playerCount);
  const { tiles, rng } = generateTiles(seed, width, height, playerCount);
  const spawns = spawnsFor(width, height);
  const players: Player[] = [];
  for (let id = 0; id < playerCount; id++) {
    const [sx, sy] = spawns[id];
    players.push({
      id,
      x: sx * UNIT + UNIT / 2,
      y: sy * UNIT + UNIT / 2,
      alive: true,
      maxBombs: START_BOMBS,
      range: START_RANGE,
      speed: BASE_SPEED,
      facing: 'down',
      moving: false,
    });
  }
  return {
    tick: 0,
    width,
    height,
    tiles,
    players,
    bombs: [],
    flames: [],
    powerUps: [],
    rng,
    nextBombId: 1,
    over: false,
    winner: null,
  };
}

export function bombAt(state: GameState, x: number, y: number): Bomb | undefined {
  return state.bombs.find((b) => b.x === x && b.y === y);
}

/** Whether a cell blocks the given player (walls, blocks, and bombs they can't pass through). */
export function isSolid(state: GameState, cx: number, cy: number, playerId: number): boolean {
  if (!inBounds(state, cx, cy)) return true;
  if (state.tiles[idx(state.width, cx, cy)] !== Tile.Empty) return true;
  const b = bombAt(state, cx, cy);
  return !!b && !b.pass.includes(playerId);
}

/** Cells that can be walked on at all (ignores pass-through rights). Used by bots. */
export function isWalkable(state: GameState, x: number, y: number): boolean {
  return inBounds(state, x, y) && state.tiles[idx(state.width, x, y)] === Tile.Empty && !bombAt(state, x, y);
}

function overlapsCell(p: Pick<Player, 'x' | 'y'>, cx: number, cy: number): boolean {
  return (
    p.x - HALF < (cx + 1) * UNIT &&
    p.x + HALF > cx * UNIT &&
    p.y - HALF < (cy + 1) * UNIT &&
    p.y + HALF > cy * UNIT
  );
}

/** A player may walk through a bomb they were standing on until they have fully left its cell. */
function refreshPass(state: GameState, p: Player): void {
  for (const b of state.bombs) {
    if (b.pass.length > 0 && b.pass.includes(p.id) && !overlapsCell(p, b.x, b.y)) {
      b.pass = b.pass.filter((id) => id !== p.id);
    }
  }
}

/**
 * Moves a player one tick in `dir` with classic Bomberman feel: the player is
 * blocked flush against obstacles, and when only the edge of the box clips a
 * corner they are slid into the free lane ("corner assist"). Returns whether
 * the player moved. Used by the simulation on the server and for client prediction.
 */
export function movePlayer(state: GameState, p: Player, dir: Dir): boolean {
  refreshPass(state, p);
  p.facing = dir;
  const [dx, dy] = DIRS[dir];
  const horizontal = dx !== 0;
  const sign = horizontal ? dx : dy;
  const step = p.speed;

  let a = horizontal ? p.x : p.y; // position along the movement axis
  let q = horizontal ? p.y : p.x; // position across it

  const solid = (ca: number, cq: number) =>
    horizontal ? isSolid(state, ca, cq, p.id) : isSolid(state, cq, ca, p.id);

  const leadNow = sign > 0 ? Math.floor((a + HALF - 1) / UNIT) : Math.floor((a - HALF) / UNIT);
  const leadNext =
    sign > 0 ? Math.floor((a + step + HALF - 1) / UNIT) : Math.floor((a - step - HALF) / UNIT);

  let moved = false;
  if (leadNext === leadNow) {
    a += sign * step;
    moved = true;
  } else {
    const rowLo = Math.floor((q - HALF) / UNIT);
    const rowHi = Math.floor((q + HALF - 1) / UNIT);
    let blocked = false;
    for (let r = rowLo; r <= rowHi; r++) if (solid(leadNext, r)) blocked = true;

    if (!blocked) {
      a += sign * step;
      moved = true;
    } else {
      const lane = Math.floor(q / UNIT);
      if (!solid(leadNext, lane)) {
        // Centre lane is open, only the box edge clips a neighbour: slide toward the lane centre.
        const off = lane * UNIT + UNIT / 2 - q;
        const slide = Math.max(-step, Math.min(step, off));
        if (slide !== 0) {
          q += slide;
          moved = true;
        }
      } else {
        // Truly blocked: stop flush against the obstacle.
        const flush = sign > 0 ? leadNext * UNIT - HALF : (leadNext + 1) * UNIT + HALF;
        const next = sign > 0 ? Math.min(a + step, flush) : Math.max(a - step, flush);
        if (next !== a && (sign > 0 ? next > a : next < a)) {
          a = next;
          moved = true;
        }
      }
    }
  }

  if (horizontal) {
    p.x = a;
    p.y = q;
  } else {
    p.y = a;
    p.x = q;
  }
  p.moving = moved;
  return moved;
}

/**
 * Advances the game by one tick. Mutates `state` in place and returns it.
 * `inputs` maps player id -> input for this tick. Deterministic for a given
 * state + inputs, which lets server, clients (prediction) and tests share it.
 */
export function step(state: GameState, inputs: Record<number, Input> = {}): GameState {
  if (state.over) return state;
  state.tick++;

  for (const p of state.players) {
    if (!p.alive) continue;
    const input = inputs[p.id] ?? NO_INPUT;
    p.moving = false;
    if (input.bomb) placeBomb(state, p);
    if (input.dir) movePlayer(state, p, input.dir);
    collectPowerUp(state, p);
  }

  // Age existing flames before new ones are created this tick.
  for (const f of state.flames) f.ttl--;
  state.flames = state.flames.filter((f) => f.ttl > 0);

  for (const b of state.bombs) b.timer--;
  explodeDueBombs(state);

  for (const p of state.players) {
    if (!p.alive) continue;
    const cx = cellOf(p.x);
    const cy = cellOf(p.y);
    if (state.flames.some((f) => f.x === cx && f.y === cy)) {
      p.alive = false;
      p.moving = false;
    }
  }

  checkGameOver(state);
  return state;
}

function placeBomb(state: GameState, p: Player): void {
  const cx = cellOf(p.x);
  const cy = cellOf(p.y);
  const owned = state.bombs.filter((b) => b.owner === p.id).length;
  if (owned >= p.maxBombs || bombAt(state, cx, cy)) return;
  const pass = state.players.filter((o) => o.alive && overlapsCell(o, cx, cy)).map((o) => o.id);
  state.bombs.push({
    id: state.nextBombId++,
    owner: p.id,
    x: cx,
    y: cy,
    timer: BOMB_TIMER,
    range: p.range,
    pass,
  });
}

function collectPowerUp(state: GameState, p: Player): void {
  const cx = cellOf(p.x);
  const cy = cellOf(p.y);
  const i = state.powerUps.findIndex((u) => u.x === cx && u.y === cy);
  if (i < 0) return;
  const [u] = state.powerUps.splice(i, 1);
  if (u.kind === 'bomb') p.maxBombs = Math.min(MAX_BOMBS, p.maxBombs + 1);
  else if (u.kind === 'range') p.range = Math.min(MAX_RANGE, p.range + 1);
  else p.speed = Math.min(MAX_SPEED, p.speed + SPEED_STEP);
}

function addFlame(state: GameState, x: number, y: number): void {
  const existing = state.flames.find((f) => f.x === x && f.y === y);
  if (existing) existing.ttl = FLAME_TTL;
  else state.flames.push({ x, y, ttl: FLAME_TTL });
}

function explodeDueBombs(state: GameState): void {
  const queue: Bomb[] = state.bombs.filter((b) => b.timer <= 0);
  if (queue.length === 0) return;
  const exploded = new Set<number>();

  while (queue.length > 0) {
    const bomb = queue.shift()!;
    if (exploded.has(bomb.id)) continue;
    exploded.add(bomb.id);
    addFlame(state, bomb.x, bomb.y);

    for (const dir of DIR_LIST) {
      const [dx, dy] = DIRS[dir];
      for (let i = 1; i <= bomb.range; i++) {
        const x = bomb.x + dx * i;
        const y = bomb.y + dy * i;
        if (!inBounds(state, x, y)) break;
        const tile = state.tiles[idx(state.width, x, y)];
        if (tile === Tile.Wall) break;

        addFlame(state, x, y);

        if (tile === Tile.Block) {
          destroyBlock(state, x, y);
          break; // flames never pass through a block
        }
        const other = bombAt(state, x, y);
        if (other) {
          queue.push(other); // chain reaction
          break;
        }
        // Flames destroy power-ups lying in their way.
        state.powerUps = state.powerUps.filter((u) => !(u.x === x && u.y === y));
      }
    }
  }
  state.bombs = state.bombs.filter((b) => !exploded.has(b.id));
}

function destroyBlock(state: GameState, x: number, y: number): void {
  state.tiles[idx(state.width, x, y)] = Tile.Empty;
  let r: number;
  [r, state.rng] = nextRandom(state.rng);
  if (r < POWERUP_CHANCE) {
    let k: number;
    [k, state.rng] = nextRandom(state.rng);
    state.powerUps.push({ x, y, kind: POWERUP_KINDS[Math.floor(k * POWERUP_KINDS.length)] });
  }
}

function checkGameOver(state: GameState): void {
  if (state.players.length < 2) return; // sandbox mode, never ends
  const alive = state.players.filter((p) => p.alive);
  if (alive.length <= 1) {
    state.over = true;
    state.winner = alive.length === 1 ? alive[0].id : null;
  }
}

/** Deep copy of a game state without relying on structuredClone (not available everywhere). */
export function cloneState(s: GameState): GameState {
  return {
    ...s,
    tiles: s.tiles.slice(),
    players: s.players.map((p) => ({ ...p })),
    bombs: s.bombs.map((b) => ({ ...b, pass: b.pass.slice() })),
    flames: s.flames.map((f) => ({ ...f })),
    powerUps: s.powerUps.map((u) => ({ ...u })),
  };
}

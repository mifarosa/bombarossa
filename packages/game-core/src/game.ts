import {
  BOMB_TIMER,
  FLAME_TTL,
  GRID_H,
  GRID_W,
  MAX_BOMBS,
  MAX_RANGE,
  MIN_MOVE_DELAY,
  POWERUP_CHANCE,
  SPAWNS,
  START_BOMBS,
  START_MOVE_DELAY,
  START_RANGE,
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
const DIR_LIST: Dir[] = ['up', 'down', 'left', 'right'];
const POWERUP_KINDS: PowerUpKind[] = ['bomb', 'range', 'speed'];

export function idx(x: number, y: number): number {
  return y * GRID_W + x;
}

export function inBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;
}

/** Creates a new match. `playerCount` is 2..4. */
export function createGame(seed: number, playerCount: number): GameState {
  if (playerCount < 1 || playerCount > SPAWNS.length) {
    throw new Error(`playerCount must be 1..${SPAWNS.length}`);
  }
  const { tiles, rng } = generateTiles(seed);
  const players: Player[] = [];
  for (let id = 0; id < playerCount; id++) {
    const [x, y] = SPAWNS[id];
    players.push({
      id,
      x,
      y,
      alive: true,
      maxBombs: START_BOMBS,
      range: START_RANGE,
      moveDelay: START_MOVE_DELAY,
      cooldown: 0,
      facing: 'down',
    });
  }
  return {
    tick: 0,
    width: GRID_W,
    height: GRID_H,
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

export function isWalkable(state: GameState, x: number, y: number): boolean {
  return inBounds(x, y) && state.tiles[idx(x, y)] === Tile.Empty && !bombAt(state, x, y);
}

/**
 * Advances the game by one tick. Mutates `state` in place and returns it.
 * `inputs` maps player id -> input for this tick. Deterministic for a given
 * state + inputs, which is what makes server/client sharing and tests possible.
 */
export function step(state: GameState, inputs: Record<number, Input> = {}): GameState {
  if (state.over) return state;
  state.tick++;

  for (const p of state.players) {
    if (!p.alive) continue;
    const input = inputs[p.id] ?? NO_INPUT;
    if (p.cooldown > 0) p.cooldown--;

    if (input.bomb) placeBomb(state, p);

    if (input.dir) {
      p.facing = input.dir;
      if (p.cooldown === 0) {
        const [dx, dy] = DIRS[input.dir];
        const nx = p.x + dx;
        const ny = p.y + dy;
        if (isWalkable(state, nx, ny)) {
          p.x = nx;
          p.y = ny;
          p.cooldown = p.moveDelay;
        }
      }
    }
    collectPowerUp(state, p);
  }

  // Age existing flames before new ones are created this tick.
  for (const f of state.flames) f.ttl--;
  state.flames = state.flames.filter((f) => f.ttl > 0);

  for (const b of state.bombs) b.timer--;
  explodeDueBombs(state);

  for (const p of state.players) {
    if (p.alive && state.flames.some((f) => f.x === p.x && f.y === p.y)) p.alive = false;
  }

  checkGameOver(state);
  return state;
}

function placeBomb(state: GameState, p: Player): void {
  const owned = state.bombs.filter((b) => b.owner === p.id).length;
  if (owned >= p.maxBombs || bombAt(state, p.x, p.y)) return;
  state.bombs.push({
    id: state.nextBombId++,
    owner: p.id,
    x: p.x,
    y: p.y,
    timer: BOMB_TIMER,
    range: p.range,
  });
}

function collectPowerUp(state: GameState, p: Player): void {
  const i = state.powerUps.findIndex((u) => u.x === p.x && u.y === p.y);
  if (i < 0) return;
  const [u] = state.powerUps.splice(i, 1);
  if (u.kind === 'bomb') p.maxBombs = Math.min(MAX_BOMBS, p.maxBombs + 1);
  else if (u.kind === 'range') p.range = Math.min(MAX_RANGE, p.range + 1);
  else p.moveDelay = Math.max(MIN_MOVE_DELAY, p.moveDelay - 1);
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
        if (!inBounds(x, y)) break;
        const tile = state.tiles[idx(x, y)];
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
  state.tiles[idx(x, y)] = Tile.Empty;
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

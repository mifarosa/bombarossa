import { Dir, GameState, PowerUpKind, Tile } from './types';

const FACINGS: Dir[] = ['up', 'down', 'left', 'right'];
const KINDS: PowerUpKind[] = ['bomb', 'range', 'speed'];

/**
 * Compact network snapshot of everything that changes during a match. Static
 * data (map layout, names) travels once in the `start` message; destroyed
 * blocks are sent as tile indices. Rows are plain number arrays to keep
 * the JSON small.
 *
 *   p: [id, x, y, alive, facing, moving, maxBombs, range, speed, ack]
 *   b: [id, x, y, timer, owner, passMask, range]
 *   f: [x, y, ttl]
 *   u: [x, y, kind]
 */
export interface Snapshot {
  k: number;
  p: number[][];
  b: number[][];
  f: number[][];
  u: number[][];
  d: number[];
  o: 0 | 1;
  w: number; // winner id, -1 for none
}

/** `destroyed` are tile indices that turned from a block to empty since the previous snapshot. */
export function makeSnapshot(
  state: GameState,
  destroyed: number[],
  acks: Record<number, number> = {},
): Snapshot {
  return {
    k: state.tick,
    p: state.players.map((p) => [
      p.id,
      p.x,
      p.y,
      p.alive ? 1 : 0,
      FACINGS.indexOf(p.facing),
      p.moving ? 1 : 0,
      p.maxBombs,
      p.range,
      p.speed,
      acks[p.id] ?? 0,
    ]),
    b: state.bombs.map((b) => [
      b.id,
      b.x,
      b.y,
      b.timer,
      b.owner,
      b.pass.reduce((m, id) => m | (1 << id), 0),
      b.range,
    ]),
    f: state.flames.map((f) => [f.x, f.y, f.ttl]),
    u: state.powerUps.map((u) => [u.x, u.y, KINDS.indexOf(u.kind)]),
    d: destroyed,
    o: state.over ? 1 : 0,
    w: state.winner ?? -1,
  };
}

/** Applies a snapshot to a client-side copy of the state. Returns the acknowledged input seq per player. */
export function applySnapshot(state: GameState, s: Snapshot): Record<number, number> {
  const acks: Record<number, number> = {};
  state.tick = s.k;
  for (const row of s.p) {
    const p = state.players[row[0]];
    if (!p) continue;
    p.x = row[1];
    p.y = row[2];
    p.alive = row[3] === 1;
    p.facing = FACINGS[row[4]] ?? 'down';
    p.moving = row[5] === 1;
    p.maxBombs = row[6];
    p.range = row[7];
    p.speed = row[8];
    acks[p.id] = row[9];
  }
  state.bombs = s.b.map((r) => {
    const pass: number[] = [];
    for (let id = 0; id < 8; id++) if (r[5] & (1 << id)) pass.push(id);
    return { id: r[0], x: r[1], y: r[2], timer: r[3], owner: r[4], pass, range: r[6] };
  });
  state.flames = s.f.map((r) => ({ x: r[0], y: r[1], ttl: r[2] }));
  state.powerUps = s.u.map((r) => ({ x: r[0], y: r[1], kind: KINDS[r[2]] ?? 'bomb' }));
  for (const i of s.d) state.tiles[i] = Tile.Empty;
  state.over = s.o === 1;
  state.winner = s.w >= 0 ? s.w : null;
  return acks;
}

/** Tile indices that changed from a block to empty between two tile arrays. */
export function destroyedBlocks(before: number[], after: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < before.length; i++) {
    if (before[i] === Tile.Block && after[i] !== Tile.Block) out.push(i);
  }
  return out;
}

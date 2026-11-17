import { DIRS, idx, inBounds, isWalkable } from './game';
import { Dir, GameState, Input, NO_INPUT, Tile } from './types';

const DIR_LIST: Dir[] = ['up', 'down', 'left', 'right'];

/** Cells that are on fire now or will be hit by a bomb (optionally a hypothetical one). */
function dangerCells(
  state: GameState,
  extra?: { x: number; y: number; range: number },
): Set<number> {
  const danger = new Set<number>();
  for (const f of state.flames) danger.add(idx(f.x, f.y));
  const bombs = [...state.bombs.map((b) => ({ x: b.x, y: b.y, range: b.range }))];
  if (extra) bombs.push(extra);
  for (const b of bombs) {
    danger.add(idx(b.x, b.y));
    for (const dir of DIR_LIST) {
      const [dx, dy] = DIRS[dir];
      for (let i = 1; i <= b.range; i++) {
        const x = b.x + dx * i;
        const y = b.y + dy * i;
        if (!inBounds(x, y) || state.tiles[idx(x, y)] !== Tile.Empty) break;
        danger.add(idx(x, y));
      }
    }
  }
  return danger;
}

/**
 * Breadth-first search from (sx, sy). Returns the first direction of the
 * shortest path to a cell satisfying `goal`, or null. `canEnter` decides which
 * cells the path may pass through.
 */
function firstStep(
  state: GameState,
  sx: number,
  sy: number,
  goal: (x: number, y: number) => boolean,
  canEnter: (x: number, y: number) => boolean,
): Dir | null {
  const seen = new Set<number>([idx(sx, sy)]);
  const queue: Array<{ x: number; y: number; first: Dir | null }> = [{ x: sx, y: sy, first: null }];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.first && goal(cur.x, cur.y)) return cur.first;
    for (const dir of DIR_LIST) {
      const [dx, dy] = DIRS[dir];
      const x = cur.x + dx;
      const y = cur.y + dy;
      if (seen.has(idx(x, y)) || !inBounds(x, y) || !canEnter(x, y)) continue;
      seen.add(idx(x, y));
      queue.push({ x, y, first: cur.first ?? dir });
    }
  }
  return null;
}

function hasTarget(state: GameState, id: number, x: number, y: number): boolean {
  for (const dir of DIR_LIST) {
    const [dx, dy] = DIRS[dir];
    const nx = x + dx;
    const ny = y + dy;
    if (!inBounds(nx, ny)) continue;
    if (state.tiles[idx(nx, ny)] === Tile.Block) return true;
    if (state.players.some((p) => p.alive && p.id !== id && p.x === nx && p.y === ny)) return true;
  }
  return false;
}

/** Simple, deterministic bot: flee danger, bomb when safe to do so, otherwise hunt blocks/enemies. */
export function botInput(state: GameState, id: number): Input {
  const me = state.players[id];
  if (!me || !me.alive || state.over) return NO_INPUT;

  const danger = dangerCells(state);
  const walkable = (x: number, y: number) => isWalkable(state, x, y);
  const noFlame = (x: number, y: number) =>
    walkable(x, y) && !state.flames.some((f) => f.x === x && f.y === y);

  if (danger.has(idx(me.x, me.y))) {
    const dir = firstStep(state, me.x, me.y, (x, y) => !danger.has(idx(x, y)), noFlame);
    return { dir, bomb: false };
  }

  const owned = state.bombs.filter((b) => b.owner === id).length;
  if (owned < me.maxBombs && hasTarget(state, id, me.x, me.y)) {
    const after = dangerCells(state, { x: me.x, y: me.y, range: me.range });
    const escape = firstStep(
      state,
      me.x,
      me.y,
      (x, y) => !after.has(idx(x, y)),
      (x, y) => walkable(x, y),
    );
    if (escape) return { dir: null, bomb: true };
  }

  const safeWalkable = (x: number, y: number) => walkable(x, y) && !danger.has(idx(x, y));
  const dir = firstStep(state, me.x, me.y, (x, y) => hasTarget(state, id, x, y), safeWalkable);
  return { dir, bomb: false };
}

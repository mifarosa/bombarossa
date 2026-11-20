import { UNIT } from './constants';
import { DIRS, DIR_LIST, cellOf, idx, inBounds, isWalkable } from './game';
import { Dir, GameState, Input, NO_INPUT, Tile } from './types';

/** How close to a cell centre (in sub-units) a bot must be to count as "aligned". */
const ALIGN = 130;

/** Cells that are on fire now or will be hit by a bomb (optionally a hypothetical one). */
function dangerCells(
  state: GameState,
  extra?: { x: number; y: number; range: number },
): Set<number> {
  const danger = new Set<number>();
  for (const f of state.flames) danger.add(idx(state.width, f.x, f.y));
  const bombs = state.bombs.map((b) => ({ x: b.x, y: b.y, range: b.range }));
  if (extra) bombs.push(extra);
  for (const b of bombs) {
    danger.add(idx(state.width, b.x, b.y));
    for (const dir of DIR_LIST) {
      const [dx, dy] = DIRS[dir];
      for (let i = 1; i <= b.range; i++) {
        const x = b.x + dx * i;
        const y = b.y + dy * i;
        if (!inBounds(state, x, y) || state.tiles[idx(state.width, x, y)] !== Tile.Empty) break;
        danger.add(idx(state.width, x, y));
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
  const seen = new Set<number>([idx(state.width, sx, sy)]);
  const queue: Array<{ x: number; y: number; first: Dir | null }> = [{ x: sx, y: sy, first: null }];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.first && goal(cur.x, cur.y)) return cur.first;
    for (const dir of DIR_LIST) {
      const [dx, dy] = DIRS[dir];
      const x = cur.x + dx;
      const y = cur.y + dy;
      if (!inBounds(state, x, y) || seen.has(idx(state.width, x, y)) || !canEnter(x, y)) continue;
      seen.add(idx(state.width, x, y));
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
    if (!inBounds(state, nx, ny)) continue;
    if (state.tiles[idx(state.width, nx, ny)] === Tile.Block) return true;
    if (state.players.some((p) => p.alive && p.id !== id && cellOf(p.x) === nx && cellOf(p.y) === ny)) return true;
  }
  return false;
}

/**
 * Turns a desired cell-to-cell direction into a real input: the bot first
 * lines itself up with the lane centre so it doesn't scrape along walls.
 */
function aligned(offX: number, offY: number, dir: Dir | null): Dir | null {
  if (!dir) return null;
  const horizontal = dir === 'left' || dir === 'right';
  const across = horizontal ? offY : offX;
  if (Math.abs(across) > ALIGN) {
    if (horizontal) return across > 0 ? 'up' : 'down';
    return across > 0 ? 'left' : 'right';
  }
  return dir;
}

/** Simple, deterministic bot: flee danger, bomb when safe to do so, otherwise hunt blocks/enemies. */
export function botInput(state: GameState, id: number): Input {
  const me = state.players[id];
  if (!me || !me.alive || state.over) return NO_INPUT;

  const cx = cellOf(me.x);
  const cy = cellOf(me.y);
  const offX = me.x - (cx * UNIT + UNIT / 2);
  const offY = me.y - (cy * UNIT + UNIT / 2);

  const danger = dangerCells(state);
  const walkable = (x: number, y: number) => isWalkable(state, x, y);
  const noFlame = (x: number, y: number) =>
    walkable(x, y) && !state.flames.some((f) => f.x === x && f.y === y);

  if (danger.has(idx(state.width, cx, cy))) {
    const dir = firstStep(state, cx, cy, (x, y) => !danger.has(idx(state.width, x, y)), noFlame);
    return { dir: aligned(offX, offY, dir), bomb: false };
  }

  const owned = state.bombs.filter((b) => b.owner === id).length;
  if (owned < me.maxBombs && hasTarget(state, id, cx, cy)) {
    const after = dangerCells(state, { x: cx, y: cy, range: me.range });
    const escape = firstStep(state, cx, cy, (x, y) => !after.has(idx(state.width, x, y)), walkable);
    if (escape) return { dir: null, bomb: true };
  }

  const safeWalkable = (x: number, y: number) => walkable(x, y) && !danger.has(idx(state.width, x, y));
  const dir = firstStep(state, cx, cy, (x, y) => hasTarget(state, id, x, y), safeWalkable);
  return { dir: aligned(offX, offY, dir), bomb: false };
}

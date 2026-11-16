import { BLOCK_DENSITY, GRID_H, GRID_W, SPAWNS } from './constants';
import { nextRandom } from './rng';
import { Tile } from './types';

/** Returns the tiles plus the advanced rng state. */
export function generateTiles(seed: number): { tiles: number[]; rng: number } {
  const tiles: number[] = new Array(GRID_W * GRID_H).fill(Tile.Empty);
  let rng = seed >>> 0;

  // Keep the 3 cells around every spawn free so players can't be trapped.
  const safe = new Set<number>();
  for (const [sx, sy] of SPAWNS) {
    safe.add(sy * GRID_W + sx);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      safe.add((sy + dy) * GRID_W + (sx + dx));
    }
  }

  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const i = y * GRID_W + x;
      const border = x === 0 || y === 0 || x === GRID_W - 1 || y === GRID_H - 1;
      const pillar = x % 2 === 0 && y % 2 === 0;
      if (border || pillar) {
        tiles[i] = Tile.Wall;
      } else if (!safe.has(i)) {
        let r: number;
        [r, rng] = nextRandom(rng);
        if (r < BLOCK_DENSITY) tiles[i] = Tile.Block;
      }
    }
  }
  return { tiles, rng };
}

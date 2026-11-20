import { BLOCK_DENSITY, spawnsFor } from './constants';
import { nextRandom } from './rng';
import { Tile } from './types';

/** Returns the tiles plus the advanced rng state. `playerCount` decides which spawns are kept clear. */
export function generateTiles(
  seed: number,
  width: number,
  height: number,
  playerCount: number,
): { tiles: number[]; rng: number } {
  const tiles: number[] = new Array(width * height).fill(Tile.Empty);
  let rng = seed >>> 0;

  // Keep the spawn cell and its two open neighbours free so nobody starts trapped.
  const safe = new Set<number>();
  for (const [sx, sy] of spawnsFor(width, height).slice(0, playerCount)) {
    safe.add(sy * width + sx);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      safe.add((sy + dy) * width + (sx + dx));
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const border = x === 0 || y === 0 || x === width - 1 || y === height - 1;
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

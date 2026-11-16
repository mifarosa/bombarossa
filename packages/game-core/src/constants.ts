export const TICK_RATE = 20; // simulation ticks per second
export const GRID_W = 13;
export const GRID_H = 11;

export const BOMB_TIMER = 3 * TICK_RATE; // 3 seconds
export const FLAME_TTL = Math.round(0.5 * TICK_RATE); // 0.5 seconds

export const START_BOMBS = 1;
export const START_RANGE = 2;
export const START_MOVE_DELAY = 4; // ticks per cell (5 cells/s)
export const MIN_MOVE_DELAY = 2;
export const MAX_BOMBS = 6;
export const MAX_RANGE = 8;

export const POWERUP_CHANCE = 0.3;
export const BLOCK_DENSITY = 0.7;

export const SPAWNS: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [GRID_W - 2, GRID_H - 2],
  [GRID_W - 2, 1],
  [1, GRID_H - 2],
];

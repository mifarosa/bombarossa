/** Simulation ticks per second (server and clients all run the same rate). */
export const TICK_RATE = 30;

/** Fixed-point: sub-units per grid cell. All positions are integers in these units. */
export const UNIT = 1000;
/** Half the width/height of a player's collision box (box = 0.68 of a cell). */
export const HALF = 340;

export const BOMB_TIMER = 3 * TICK_RATE; // 3 seconds
export const FLAME_TTL = Math.round(0.5 * TICK_RATE); // 0.5 seconds

export const START_BOMBS = 1;
export const START_RANGE = 2;
/** Movement speed in sub-units per tick (170 = 5.1 cells per second at 30 Hz). */
export const BASE_SPEED = 170;
export const SPEED_STEP = 25;
export const MAX_SPEED = 280;
export const MAX_BOMBS = 6;
export const MAX_RANGE = 8;

export const POWERUP_CHANCE = 0.3;
export const BLOCK_DENSITY = 0.7;

export const MAX_PLAYERS = 6;

export interface MapSize {
  width: number;
  height: number;
}

/** Up to 4 players fit the classic 13x11 arena; 5-6 players get a larger 15x13 one. */
export function mapSizeFor(playerCount: number): MapSize {
  return playerCount <= 4 ? { width: 13, height: 11 } : { width: 15, height: 13 };
}

/** Spawn cells in assignment order: opposite corners first, then the other two, then top/bottom middle. */
export function spawnsFor(width: number, height: number): Array<[number, number]> {
  const mid = (width - 1) / 2;
  return [
    [1, 1],
    [width - 2, height - 2],
    [width - 2, 1],
    [1, height - 2],
    [mid, 1],
    [mid, height - 2],
  ];
}

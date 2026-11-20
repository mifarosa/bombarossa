export type Dir = 'up' | 'down' | 'left' | 'right';

export const Tile = { Empty: 0, Wall: 1, Block: 2 } as const;
export type TileType = (typeof Tile)[keyof typeof Tile];

export type PowerUpKind = 'bomb' | 'range' | 'speed';

export interface Player {
  id: number;
  /** Center of the player's box in sub-units (UNIT per cell). */
  x: number;
  y: number;
  alive: boolean;
  maxBombs: number;
  range: number;
  /** Sub-units moved per tick while a direction is held. */
  speed: number;
  facing: Dir;
  /** True if the player actually moved during the last tick (for animation). */
  moving: boolean;
}

export interface Bomb {
  id: number;
  owner: number;
  /** Cell coordinates. */
  x: number;
  y: number;
  timer: number;
  range: number;
  /** Players who may still walk through this bomb (they were standing on it when it was placed). */
  pass: number[];
}

export interface Flame {
  x: number;
  y: number;
  ttl: number;
}

export interface PowerUp {
  x: number;
  y: number;
  kind: PowerUpKind;
}

/** Plain JSON-serializable state. */
export interface GameState {
  tick: number;
  width: number;
  height: number;
  tiles: number[]; // flat, row-major, values of Tile
  players: Player[];
  bombs: Bomb[];
  flames: Flame[];
  powerUps: PowerUp[];
  rng: number;
  nextBombId: number;
  over: boolean;
  winner: number | null; // player id, or null for a draw / not over
}

export interface Input {
  dir: Dir | null;
  bomb: boolean;
}

export const NO_INPUT: Input = { dir: null, bomb: false };

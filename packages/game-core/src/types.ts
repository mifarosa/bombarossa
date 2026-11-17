export type Dir = 'up' | 'down' | 'left' | 'right';

export const Tile = { Empty: 0, Wall: 1, Block: 2 } as const;
export type TileType = (typeof Tile)[keyof typeof Tile];

export type PowerUpKind = 'bomb' | 'range' | 'speed';

export interface Player {
  id: number;
  x: number;
  y: number;
  alive: boolean;
  maxBombs: number;
  range: number;
  moveDelay: number; // ticks needed between two moves
  cooldown: number; // ticks left until the next move is allowed
  facing: Dir;
}

export interface Bomb {
  id: number;
  owner: number;
  x: number;
  y: number;
  timer: number;
  range: number;
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

/** Plain JSON-serializable state so it can be sent over the network as-is. */
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

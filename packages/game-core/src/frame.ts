import { Dir, PowerUpKind } from './types';

export interface RenderPlayer {
  id: number;
  /** Position in cells (float), centre of the player. */
  x: number;
  y: number;
  alive: boolean;
  facing: Dir;
  moving: boolean;
  name: string;
}

export interface RenderBomb {
  id: number;
  x: number;
  y: number;
  /** Ticks until it explodes (can be fractional for predicted bombs). */
  timer: number;
  predicted?: boolean;
}

export interface RenderFlame {
  x: number;
  y: number;
  ttl: number;
}

export interface RenderPowerUp {
  x: number;
  y: number;
  kind: PowerUpKind;
}

/** Everything a renderer needs to draw one frame. */
export interface RenderFrame {
  tick: number;
  width: number;
  height: number;
  tiles: number[];
  /** Increases whenever `tiles` changed so renderers can re-cache the static layer. */
  tilesVersion: number;
  players: RenderPlayer[];
  bombs: RenderBomb[];
  flames: RenderFlame[];
  powerUps: RenderPowerUp[];
  over: boolean;
  winner: number | null;
  you: number;
  /** Local wall-clock time in ms, for animations. */
  timeMs: number;
}

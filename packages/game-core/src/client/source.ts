import type { GameEvent } from '../events';
import type { RenderFrame } from '../frame';
import type { Dir } from '../types';

/** What the UI talks to, whether the match is local (vs bots) or online. */
export interface GameSource {
  readonly you: number;
  /** Advance the simulation / networking up to wall-clock `nowMs`. Call every animation frame. */
  update(nowMs: number): void;
  getFrame(nowMs: number): RenderFrame | null;
  setDir(dir: Dir | null): void;
  pressBomb(): void;
  /** Sound/effect events since the last call. */
  drainEvents(): GameEvent[];
}

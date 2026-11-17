import { Dir, GameState } from './types';

/** Messages sent by clients. */
export type ClientMessage =
  | { t: 'join'; name?: string }
  | { t: 'input'; dir: Dir | null; bomb: boolean };

/** Messages sent by the server. */
export type ServerMessage =
  | { t: 'welcome'; playerId: number; roomId: string }
  | { t: 'lobby'; humans: number; startsInMs: number }
  | { t: 'state'; state: GameState }
  | { t: 'error'; message: string };

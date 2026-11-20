import { Dir } from './types';
import { Snapshot } from './snapshot';

export const MAX_NAME_LENGTH = 12;
export const CODE_LENGTH = 4;

/** Messages sent by clients. */
export type ClientMessage =
  | { t: 'quick'; name: string }
  | { t: 'create'; name: string }
  | { t: 'join'; code: string; name: string }
  | { t: 'bots'; on: boolean }
  | { t: 'start' }
  | { t: 'rematch' }
  | { t: 'leave' }
  | { t: 'rejoin'; token: string }
  | { t: 'input'; seq: number; dir: Dir | null; bomb: boolean }
  | { t: 'ping'; c: number };

export interface LobbyPlayer {
  name: string;
  connected: boolean;
}

export type ErrorCode =
  | 'no_room'
  | 'room_full'
  | 'started'
  | 'need_players'
  | 'not_host'
  | 'bad_token'
  | 'rate_limited'
  | 'busy';

export interface PlayerInfo {
  name: string;
  bot: boolean;
}

/** Messages sent by the server. */
export type ServerMessage =
  | {
      t: 'lobby';
      code: string;
      quick: boolean;
      you: number;
      host: boolean;
      token: string;
      players: LobbyPlayer[];
      bots: boolean;
      max: number;
      /** Quick match only: ms until the match starts anyway. */
      startsInMs: number | null;
    }
  | {
      t: 'start';
      you: number;
      token: string;
      code: string;
      width: number;
      height: number;
      tiles: number[];
      players: PlayerInfo[];
      snap: Snapshot;
    }
  | ({ t: 'snap' } & Snapshot)
  | { t: 'error'; code: ErrorCode; message: string }
  | { t: 'pong'; c: number };

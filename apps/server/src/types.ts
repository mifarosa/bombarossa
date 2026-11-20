import type { WebSocket } from 'ws';
import type { Dir } from '@bombarossa/game-core';
import type { Room } from './room.js';

export interface PendingInput {
  seq: number;
  dir: Dir | null;
  bomb: boolean;
}

/** A human seat in a room. Survives reconnects (identified by `token`). */
export interface Slot {
  name: string;
  token: string;
  conn: Conn | null;
  queue: PendingInput[];
  lastDir: Dir | null;
  /** Ticks in a row that we had to reuse `lastDir` because no fresh input arrived. */
  staleTicks: number;
  /** Highest input sequence number applied to the simulation. */
  ack: number;
  disconnectedAt: number | null;
}

export interface Conn {
  id: number;
  ws: WebSocket;
  ip: string;
  room: Room | null;
  slot: Slot | null;
  bucketTokens: number;
  bucketAt: number;
  /** Consecutive ms spent over the rate limit. */
  limitedSince: number | null;
}

export interface ServerOptions {
  port: number;
  host?: string;
  /** Quick-match lobby waits this long for more players before filling with bots. */
  quickLobbyMs?: number;
  maxRooms?: number;
  maxConnsPerIp?: number;
  /** Disconnected players are replaced by a bot after this long. */
  botTakeoverMs?: number;
  /** Trust X-Forwarded-For (set when running behind Caddy/nginx). */
  trustProxy?: boolean;
  log?: (msg: string) => void;
}

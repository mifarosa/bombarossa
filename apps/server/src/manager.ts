import { ServerMessage } from '@bombarossa/game-core';
import { randomCode } from './names.js';
import { Room, RoomDeps } from './room.js';
import type { Conn, Slot } from './types.js';

export interface ManagerOptions {
  now: () => number;
  quickLobbyMs: number;
  botTakeoverMs: number;
  maxRooms: number;
}

/** Owns all rooms: creation, lookup by code, quick match, token → seat index, and the tick loop hook. */
export class RoomManager {
  readonly rooms = new Map<string, Room>();
  private quickRoom: Room | null = null;
  private tokens = new Map<string, { room: Room; slot: Slot }>();
  private readonly deps: RoomDeps;

  constructor(private readonly opts: ManagerOptions) {
    this.deps = {
      now: opts.now,
      quickLobbyMs: opts.quickLobbyMs,
      botTakeoverMs: opts.botTakeoverMs,
      onTokenIssued: (token, room, slot) => this.tokens.set(token, { room, slot }),
      onTokenRevoked: (token) => {
        this.tokens.delete(token);
      },
    };
  }

  get playerCount(): number {
    let n = 0;
    for (const r of this.rooms.values()) n += r.connectedCount;
    return n;
  }

  /** Creates a private room. Returns null if the server is at capacity. */
  createRoom(): Room | null {
    if (this.rooms.size >= this.opts.maxRooms) return null;
    let code = randomCode();
    for (let i = 0; this.rooms.has(code) && i < 50; i++) code = randomCode();
    if (this.rooms.has(code)) return null;
    const room = new Room(code, false, this.deps);
    this.rooms.set(code, room);
    return room;
  }

  find(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  /** An open quick-match lobby, creating one when needed. Null if at capacity. */
  quickMatchRoom(): Room | null {
    if (this.quickRoom && this.quickRoom.joinable && this.rooms.has(this.quickRoom.code)) return this.quickRoom;
    if (this.rooms.size >= this.opts.maxRooms) return null;
    let code = randomCode();
    for (let i = 0; this.rooms.has(code) && i < 50; i++) code = randomCode();
    const room = new Room(code, true, this.deps);
    this.rooms.set(code, room);
    this.quickRoom = room;
    return room;
  }

  byToken(token: string): { room: Room; slot: Slot } | undefined {
    return this.tokens.get(token);
  }

  /** 30 Hz: advance every running match. */
  tick(): void {
    for (const room of this.rooms.values()) room.tick();
  }

  /** 1 Hz: countdowns, cleanup. */
  housekeeping(): void {
    for (const [code, room] of this.rooms) {
      if (room.housekeeping() === 'close') {
        room.dispose();
        this.rooms.delete(code);
        if (this.quickRoom === room) this.quickRoom = null;
      }
    }
  }

  closeAll(): void {
    for (const room of this.rooms.values()) room.dispose();
    this.rooms.clear();
    this.quickRoom = null;
  }

  static error(code: Extract<ServerMessage, { t: 'error' }>['code'], message: string): string {
    return JSON.stringify({ t: 'error', code, message } satisfies ServerMessage);
  }
}

export type { Conn };

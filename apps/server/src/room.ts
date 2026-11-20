import { randomBytes } from 'node:crypto';
import {
  GameState,
  Input,
  MAX_PLAYERS,
  NO_INPUT,
  PlayerInfo,
  ServerMessage,
  TICK_RATE,
  botInput,
  createGame,
  destroyedBlocks,
  makeSnapshot,
  step,
} from '@bombarossa/game-core';
import type { Conn, PendingInput, Slot } from './types.js';

export const SNAPSHOT_EVERY = 2; // ticks: 15 snapshots per second at 30 Hz
const QUICK_MAX = 4;
const MAX_QUEUE = 12;
const TRIM_QUEUE_TO = 2;
/** Reuse the last held direction for at most this many ticks when inputs are late. */
const MAX_STALE_TICKS = 6;
const LOBBY_IDLE_MS = 15 * 60_000;
const OVER_IDLE_MS = 5 * 60_000;
const ALL_GONE_MS = 60_000;

export type Phase = 'lobby' | 'playing' | 'over';

export interface RoomDeps {
  now: () => number;
  quickLobbyMs: number;
  botTakeoverMs: number;
  onTokenIssued: (token: string, room: Room, slot: Slot) => void;
  onTokenRevoked: (token: string) => void;
}

export class Room {
  phase: Phase = 'lobby';
  slots: Slot[] = [];
  botsOn: boolean;
  game: GameState | null = null;
  names: PlayerInfo[] = [];
  private tilesBefore: number[] = [];
  private startDeadline: number | null = null;
  private lastLobbyBroadcast = 0;
  private lastActivity: number;
  private overAt = 0;

  constructor(
    readonly code: string,
    readonly quick: boolean,
    private readonly deps: RoomDeps,
  ) {
    this.botsOn = quick;
    this.lastActivity = deps.now();
  }

  get max(): number {
    return this.quick ? QUICK_MAX : MAX_PLAYERS;
  }

  get joinable(): boolean {
    return this.phase === 'lobby' && this.slots.length < this.max;
  }

  get connectedCount(): number {
    return this.slots.filter((s) => s.conn).length;
  }

  // ---- membership -------------------------------------------------------

  /** Adds a player to the lobby. Caller checks `joinable`. */
  addPlayer(conn: Conn, name: string): Slot {
    const slot: Slot = {
      name,
      token: randomBytes(16).toString('hex'),
      conn,
      queue: [],
      lastDir: null,
      staleTicks: 0,
      ack: 0,
      disconnectedAt: null,
    };
    this.slots.push(slot);
    conn.room = this;
    conn.slot = slot;
    this.deps.onTokenIssued(slot.token, this, slot);
    this.touch();
    if (this.quick) {
      if (this.startDeadline === null) this.startDeadline = this.deps.now() + this.deps.quickLobbyMs;
      if (this.slots.length >= QUICK_MAX) this.startGame();
    }
    this.broadcastLobby();
    return slot;
  }

  /** Player pressed "leave" (or closed the app in the lobby). */
  removePlayer(slot: Slot): void {
    const i = this.slots.indexOf(slot);
    if (i < 0) return;
    if (slot.conn) {
      slot.conn.room = null;
      slot.conn.slot = null;
      slot.conn = null;
    }
    if (this.phase === 'lobby') {
      this.slots.splice(i, 1);
      this.deps.onTokenRevoked(slot.token);
      this.broadcastLobby();
    } else {
      // Mid-match: keep the seat (player ids must stay stable); a bot takes over.
      slot.disconnectedAt = this.deps.now() - this.deps.botTakeoverMs;
      this.deps.onTokenRevoked(slot.token);
    }
    this.touch();
  }

  /** The socket dropped. In the lobby the seat is freed, in a match it is kept for a rejoin. */
  disconnect(conn: Conn): void {
    const slot = conn.slot;
    conn.room = null;
    conn.slot = null;
    if (!slot) return;
    slot.conn = null;
    if (this.phase === 'lobby') {
      const i = this.slots.indexOf(slot);
      if (i >= 0) this.slots.splice(i, 1);
      this.deps.onTokenRevoked(slot.token);
      this.broadcastLobby();
    } else {
      slot.disconnectedAt = this.deps.now();
      slot.queue.length = 0;
      slot.lastDir = null;
    }
  }

  /** A returning player with their token. */
  reattach(slot: Slot, conn: Conn): void {
    if (slot.conn && slot.conn !== conn) {
      slot.conn.room = null;
      slot.conn.slot = null;
      slot.conn.ws.close();
    }
    slot.conn = conn;
    slot.disconnectedAt = null;
    conn.room = this;
    conn.slot = slot;
    this.touch();
    if (this.phase === 'lobby') this.broadcastLobby();
    else this.sendStart(slot);
  }

  // ---- host commands ----------------------------------------------------

  isHost(slot: Slot): boolean {
    return this.slots[0] === slot;
  }

  setBots(on: boolean): void {
    if (this.phase !== 'lobby' || this.quick) return;
    this.botsOn = on;
    this.broadcastLobby();
  }

  /** Returns an error code if the match cannot start. */
  start(): 'need_players' | 'started' | null {
    if (this.phase !== 'lobby') return 'started';
    if (!this.botsOn && this.slots.length < 2) return 'need_players';
    this.startGame();
    return null;
  }

  rematch(): boolean {
    if (this.phase !== 'over') return false;
    this.slots = this.slots.filter((s) => {
      if (s.conn) return true;
      this.deps.onTokenRevoked(s.token);
      return false;
    });
    for (const s of this.slots) {
      s.queue.length = 0;
      s.ack = 0;
      s.lastDir = null;
    }
    this.game = null;
    this.phase = 'lobby';
    this.startDeadline = this.quick ? this.deps.now() + this.deps.quickLobbyMs : null;
    this.touch();
    this.broadcastLobby();
    return true;
  }

  // ---- input ------------------------------------------------------------

  pushInput(slot: Slot, input: PendingInput): void {
    if (this.phase !== 'playing') return;
    const last = slot.queue[slot.queue.length - 1];
    if (last && input.seq <= last.seq) return; // stale or duplicate
    slot.queue.push(input);
    if (slot.queue.length > MAX_QUEUE) slot.queue.splice(0, slot.queue.length - MAX_QUEUE);
  }

  // ---- simulation -------------------------------------------------------

  private startGame(): void {
    const humans = this.slots.length;
    const total = Math.min(MAX_PLAYERS, this.botsOn ? Math.max(humans, 4) : humans);
    const seed = randomBytes(4).readUInt32LE(0);
    this.game = createGame(seed, total);
    this.tilesBefore = this.game.tiles.slice();
    let bots = 0;
    this.names = this.game.players.map((_, i) =>
      i < humans ? { name: this.slots[i].name, bot: false } : { name: `Bot ${++bots}`, bot: true },
    );
    this.phase = 'playing';
    this.startDeadline = null;
    for (const s of this.slots) {
      s.queue.length = 0;
      s.ack = 0;
      s.lastDir = null;
      s.staleTicks = 0;
    }
    this.touch();
    for (const s of this.slots) this.sendStart(s);
  }

  tick(): void {
    const game = this.game;
    if (this.phase !== 'playing' || !game) return;
    const now = this.deps.now();
    const inputs: Record<number, Input> = {};

    for (const p of game.players) {
      const slot = this.slots[p.id];
      if (!slot) {
        inputs[p.id] = botInput(game, p.id);
        continue;
      }
      if (!slot.conn) {
        const gone = slot.disconnectedAt === null ? Infinity : now - slot.disconnectedAt;
        inputs[p.id] = gone >= this.deps.botTakeoverMs ? botInput(game, p.id) : NO_INPUT;
        continue;
      }
      if (slot.queue.length > MAX_QUEUE / 4) {
        // Backlog (burst after a lag spike): skip ahead to keep latency bounded.
        slot.queue.splice(0, slot.queue.length - TRIM_QUEUE_TO);
      }
      const next = slot.queue.shift();
      if (next) {
        slot.ack = next.seq;
        slot.lastDir = next.dir;
        slot.staleTicks = 0;
        inputs[p.id] = { dir: next.dir, bomb: next.bomb };
      } else if (slot.lastDir && slot.staleTicks < MAX_STALE_TICKS) {
        slot.staleTicks++;
        inputs[p.id] = { dir: slot.lastDir, bomb: false };
      } else {
        inputs[p.id] = NO_INPUT;
      }
    }

    step(game, inputs);

    if (game.tick % SNAPSHOT_EVERY === 0 || game.over) this.broadcastSnapshot();
    if (game.over) {
      this.phase = 'over';
      this.overAt = now;
    }
  }

  private buildSnapshot() {
    const game = this.game!;
    const destroyed = destroyedBlocks(this.tilesBefore, game.tiles);
    if (destroyed.length > 0) this.tilesBefore = game.tiles.slice();
    const acks: Record<number, number> = {};
    this.slots.forEach((s, i) => (acks[i] = s.ack));
    return makeSnapshot(game, destroyed, acks);
  }

  private broadcastSnapshot(): void {
    const data = JSON.stringify({ t: 'snap', ...this.buildSnapshot() });
    for (const s of this.slots) this.sendRaw(s, data);
  }

  private sendStart(slot: Slot): void {
    const game = this.game;
    if (!game) return;
    const you = this.slots.indexOf(slot);
    // A full state for a (re)joining client: tiles as they are *now*, empty "destroyed" list.
    const snap = makeSnapshot(game, [], Object.fromEntries(this.slots.map((s, i) => [i, s.ack])));
    this.send(slot, {
      t: 'start',
      you,
      token: slot.token,
      code: this.code,
      width: game.width,
      height: game.height,
      tiles: game.tiles,
      players: this.names,
      snap,
    });
  }

  // ---- lobby ------------------------------------------------------------

  broadcastLobby(): void {
    if (this.phase !== 'lobby') return;
    const now = this.deps.now();
    this.lastLobbyBroadcast = now;
    const players = this.slots.map((s) => ({ name: s.name, connected: !!s.conn }));
    const startsInMs = this.startDeadline === null ? null : Math.max(0, this.startDeadline - now);
    this.slots.forEach((slot, i) => {
      this.send(slot, {
        t: 'lobby',
        code: this.code,
        quick: this.quick,
        you: i,
        host: i === 0,
        token: slot.token,
        players,
        bots: this.botsOn,
        max: this.max,
        startsInMs,
      });
    });
  }

  // ---- housekeeping -----------------------------------------------------

  /** Once per second: quick-match countdown, lobby refresh, and whether the room can be dropped. */
  housekeeping(): 'keep' | 'close' {
    const now = this.deps.now();
    if (this.phase === 'lobby') {
      if (this.slots.length === 0) return 'close';
      if (this.quick && this.startDeadline !== null && now >= this.startDeadline) this.startGame();
      else if (this.quick && now - this.lastLobbyBroadcast >= 1000) this.broadcastLobby();
      if (now - this.lastActivity > LOBBY_IDLE_MS) return 'close';
    } else if (this.phase === 'playing') {
      const anyoneHere = this.slots.some(
        (s) => s.conn || (s.disconnectedAt !== null && now - s.disconnectedAt < ALL_GONE_MS),
      );
      if (!anyoneHere) return 'close';
    } else if (this.phase === 'over') {
      if (this.connectedCount === 0 || now - this.overAt > OVER_IDLE_MS) return 'close';
    }
    return 'keep';
  }

  /** Called when the room is removed: free tokens and close sockets. */
  dispose(): void {
    for (const s of this.slots) {
      this.deps.onTokenRevoked(s.token);
      if (s.conn) {
        s.conn.room = null;
        s.conn.slot = null;
        s.conn.ws.close();
        s.conn = null;
      }
    }
    this.slots = [];
  }

  private touch(): void {
    this.lastActivity = this.deps.now();
  }

  private send(slot: Slot, msg: ServerMessage): void {
    this.sendRaw(slot, JSON.stringify(msg));
  }

  private sendRaw(slot: Slot, data: string): void {
    const ws = slot.conn?.ws;
    if (ws && ws.readyState === 1) ws.send(data);
  }
}

export const TICK_MS = 1000 / TICK_RATE;

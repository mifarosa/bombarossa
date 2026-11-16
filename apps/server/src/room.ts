import type { WebSocket } from 'ws';
import {
  GameState,
  Input,
  NO_INPUT,
  ServerMessage,
  SPAWNS,
  TICK_RATE,
  botInput,
  createGame,
  step,
} from '@bombarossa/game-core';

const LOBBY_MS = 8000; // wait this long for more players, then fill with bots
const MAX_PLAYERS = SPAWNS.length;
const CLOSE_AFTER_OVER_MS = 5000;

interface Slot {
  socket: WebSocket;
  playerId: number;
  dir: Input['dir'];
  bombPending: boolean;
}

export class Room {
  readonly id: string;
  private slots: Slot[] = [];
  private state: GameState | null = null;
  private timer: NodeJS.Timeout | null = null;
  private lobbyTimer: NodeJS.Timeout | null = null;
  private lobbyDeadline = 0;
  private closed = false;

  constructor(id: string, private onClose: (room: Room) => void) {
    this.id = id;
  }

  get joinable(): boolean {
    return !this.state && !this.closed && this.slots.length < MAX_PLAYERS;
  }

  join(socket: WebSocket): Slot {
    const slot: Slot = { socket, playerId: this.slots.length, dir: null, bombPending: false };
    this.slots.push(slot);
    this.send(slot, { t: 'welcome', playerId: slot.playerId, roomId: this.id });

    if (this.slots.length === 1) {
      this.lobbyDeadline = Date.now() + LOBBY_MS;
      this.lobbyTimer = setTimeout(() => this.start(), LOBBY_MS);
    }
    if (this.slots.length === MAX_PLAYERS) this.start();
    else this.broadcastLobby();
    return slot;
  }

  setInput(socket: WebSocket, dir: Input['dir'], bomb: boolean): void {
    const slot = this.slots.find((s) => s.socket === socket);
    if (!slot) return;
    slot.dir = dir;
    if (bomb) slot.bombPending = true;
  }

  leave(socket: WebSocket): void {
    const i = this.slots.findIndex((s) => s.socket === socket);
    if (i < 0) return;
    const slot = this.slots[i];
    if (this.state) {
      // Keep the slot (player id stays valid) but stop input; the avatar idles.
      slot.dir = null;
      slot.bombPending = false;
      slot.socket = null as unknown as WebSocket;
    } else {
      this.slots.splice(i, 1);
      this.slots.forEach((s, n) => (s.playerId = n));
      this.slots.forEach((s) => this.send(s, { t: 'welcome', playerId: s.playerId, roomId: this.id }));
      this.broadcastLobby();
    }
    if (this.slots.every((s) => !s.socket)) this.close();
  }

  private start(): void {
    if (this.state || this.closed) return;
    if (this.lobbyTimer) clearTimeout(this.lobbyTimer);
    this.state = createGame((Math.random() * 2 ** 32) >>> 0, MAX_PLAYERS);
    this.timer = setInterval(() => this.tick(), 1000 / TICK_RATE);
  }

  private tick(): void {
    const state = this.state!;
    const inputs: Record<number, Input> = {};
    for (const p of state.players) {
      const slot = this.slots.find((s) => s.playerId === p.id);
      if (slot && slot.socket) {
        inputs[p.id] = { dir: slot.dir, bomb: slot.bombPending };
        slot.bombPending = false;
      } else if (slot) {
        inputs[p.id] = NO_INPUT; // disconnected human
      } else {
        inputs[p.id] = botInput(state, p.id); // empty slot -> bot
      }
    }
    step(state, inputs);
    this.broadcast({ t: 'state', state });

    if (state.over) {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      setTimeout(() => this.close(), CLOSE_AFTER_OVER_MS);
    }
  }

  private broadcastLobby(): void {
    if (this.state) return;
    const startsInMs = Math.max(0, this.lobbyDeadline - Date.now());
    this.broadcast({ t: 'lobby', humans: this.slots.length, startsInMs });
  }

  private broadcast(msg: ServerMessage): void {
    const data = JSON.stringify(msg);
    for (const s of this.slots) if (s.socket && s.socket.readyState === 1) s.socket.send(data);
  }

  private send(slot: Slot, msg: ServerMessage): void {
    if (slot.socket && slot.socket.readyState === 1) slot.socket.send(JSON.stringify(msg));
  }

  private close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    if (this.lobbyTimer) clearTimeout(this.lobbyTimer);
    for (const s of this.slots) s.socket?.close();
    this.onClose(this);
  }
}

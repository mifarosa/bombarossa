import { BOMB_TIMER, TICK_RATE, UNIT } from '../constants';
import { GameEvent, diffEvents } from '../events';
import { RenderFrame } from '../frame';
import { bombAt, cellOf, cloneState } from '../game';
import { Predictor } from '../prediction';
import { ClientMessage, ErrorCode, PlayerInfo, ServerMessage } from '../protocol';
import { applySnapshot } from '../snapshot';
import { Dir, GameState, Player } from '../types';
import type { GameSource } from './source';

const TICK_MS = 1000 / TICK_RATE;
/** Remote players are drawn this far in the past so there is always a snapshot pair to interpolate. */
const INTERP_DELAY_MS = 110;
const GHOST_LIFETIME_MS = 700;
const RECONNECT_DELAYS = [500, 1000, 2000, 3000, 5000, 5000, 8000, 8000, 10000, 10000];

export type OnlineStatus = 'connecting' | 'lobby' | 'playing' | 'over' | 'reconnecting' | 'closed' | 'error';

export type JoinMode =
  | { kind: 'quick' }
  | { kind: 'create' }
  | { kind: 'join'; code: string }
  | { kind: 'rejoin'; token: string };

export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((ev?: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev?: unknown) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
}

export interface OnlineOptions {
  url: string;
  name: string;
  mode: JoinMode;
  createSocket?: (url: string) => SocketLike;
  now?: () => number;
}

type LobbyMessage = Extract<ServerMessage, { t: 'lobby' }>;
interface BufferedSnapshot {
  t: number;
  pos: Array<{ x: number; y: number }>;
}

/** Client for an online match: lobby, prediction for the local player, interpolation for the others. */
export class OnlineGame implements GameSource {
  status: OnlineStatus = 'connecting';
  lobby: LobbyMessage | null = null;
  error: { code: ErrorCode | 'network'; message: string } | null = null;
  players: PlayerInfo[] = [];
  you = -1;
  token = '';
  code = '';
  rttMs = 0;

  private ws: SocketLike | null = null;
  private listeners = new Set<() => void>();
  private world: GameState | null = null;
  private predictor: Predictor | null = null;
  private buffer: BufferedSnapshot[] = [];
  private events: GameEvent[] = [];
  private ghosts: Array<{ x: number; y: number; at: number }> = [];
  private dir: Dir | null = null;
  private bombQueued = false;
  private acc = 0;
  private lastNow: number | null = null;
  private corrX = 0;
  private corrY = 0;
  private tilesVersion = 0;
  private lastPing = 0;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private everConnected = false;
  private closedByUser = false;
  private mode: JoinMode;
  private readonly now: () => number;

  constructor(private readonly opts: OnlineOptions) {
    this.mode = opts.mode;
    this.now = opts.now ?? (() => Date.now());
    this.connect();
  }

  // ---- UI subscriptions -------------------------------------------------

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify(): void {
    for (const cb of this.listeners) cb();
  }

  // ---- connection -------------------------------------------------------

  private connect(): void {
    const create = this.opts.createSocket ?? ((u: string) => new WebSocket(u) as unknown as SocketLike);
    let ws: SocketLike;
    try {
      ws = create(this.opts.url);
    } catch {
      this.fail('network', 'Sunucuya bağlanılamadı');
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.everConnected = true;
      this.reconnectAttempt = 0;
      const m = this.mode;
      const name = this.opts.name;
      if (m.kind === 'quick') this.send({ t: 'quick', name });
      else if (m.kind === 'create') this.send({ t: 'create', name });
      else if (m.kind === 'join') this.send({ t: 'join', code: m.code, name });
      else this.send({ t: 'rejoin', token: m.token });
    };
    ws.onmessage = (ev) => {
      try {
        this.handle(JSON.parse(String(ev.data)) as ServerMessage);
      } catch {
        // ignore malformed frames
      }
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.onClosed();
    };
  }

  private onClosed(): void {
    if (this.closedByUser || this.status === 'error' || this.status === 'closed') return;
    // After a successful join we can come back with the token (phone locked, network switch…).
    if (this.token && this.reconnectAttempt < RECONNECT_DELAYS.length) {
      this.mode = { kind: 'rejoin', token: this.token };
      this.status = 'reconnecting';
      this.notify();
      const delay = RECONNECT_DELAYS[this.reconnectAttempt++];
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
      return;
    }
    this.fail('network', this.everConnected ? 'Bağlantı koptu' : 'Sunucuya bağlanılamadı');
  }

  private fail(code: ErrorCode | 'network', message: string): void {
    this.error = { code, message };
    this.status = 'error';
    this.notify();
  }

  private send(msg: ClientMessage): void {
    const ws = this.ws;
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  /** Leaves the lobby/match and closes the connection. */
  close(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.send({ t: 'leave' });
    this.ws?.close();
    this.ws = null;
    this.status = 'closed';
  }

  // ---- lobby commands ---------------------------------------------------

  startMatch(): void {
    this.send({ t: 'start' });
  }
  setBots(on: boolean): void {
    this.send({ t: 'bots', on });
  }
  rematch(): void {
    this.send({ t: 'rematch' });
  }

  // ---- server messages --------------------------------------------------

  private handle(msg: ServerMessage): void {
    switch (msg.t) {
      case 'lobby':
        this.lobby = msg;
        this.token = msg.token;
        this.code = msg.code;
        this.you = msg.you;
        this.world = null;
        this.predictor = null;
        this.status = 'lobby';
        this.notify();
        break;
      case 'start':
        this.onStart(msg);
        break;
      case 'snap':
        this.onSnapshot(msg);
        break;
      case 'error':
        this.error = { code: msg.code, message: msg.message };
        // Failing to enter a room is fatal; other errors (e.g. not enough players) are shown in place.
        if (this.status === 'connecting' || this.status === 'reconnecting') this.status = 'error';
        this.notify();
        break;
      case 'pong':
        this.rttMs = this.now() - msg.c;
        break;
    }
  }

  private onStart(msg: Extract<ServerMessage, { t: 'start' }>): void {
    this.you = msg.you;
    this.token = msg.token;
    this.code = msg.code;
    this.players = msg.players;
    const world: GameState = {
      tick: 0,
      width: msg.width,
      height: msg.height,
      tiles: msg.tiles.slice(),
      players: msg.players.map<Player>((_, id) => ({
        id,
        x: 0,
        y: 0,
        alive: true,
        maxBombs: 1,
        range: 2,
        speed: 170,
        facing: 'down',
        moving: false,
      })),
      bombs: [],
      flames: [],
      powerUps: [],
      rng: 0,
      nextBombId: 0,
      over: false,
      winner: null,
    };
    applySnapshot(world, msg.snap);
    this.world = world;
    this.predictor = new Predictor(world, this.you);
    this.buffer = [{ t: this.now(), pos: world.players.map((p) => ({ x: p.x, y: p.y })) }];
    this.ghosts = [];
    this.events = [];
    this.corrX = this.corrY = 0;
    this.tilesVersion++;
    this.acc = 0;
    this.lastNow = null;
    this.status = world.over ? 'over' : 'playing';
    this.notify();
  }

  private onSnapshot(snap: Extract<ServerMessage, { t: 'snap' }>): void {
    const world = this.world;
    if (!world || !this.predictor) return;
    const prev = cloneState(world);
    const acks = applySnapshot(world, snap);

    for (const ev of diffEvents(prev, world)) {
      if (ev.type === 'bombPlaced' && ev.owner === this.you) {
        const gi = this.ghosts.findIndex((g) => g.x === ev.x && g.y === ev.y);
        if (gi >= 0) {
          this.ghosts.splice(gi, 1); // we already played the sound for this one
          continue;
        }
      }
      this.events.push(ev);
    }
    if (this.events.length > 200) this.events.splice(0, this.events.length - 200);
    if (snap.d.length > 0) this.tilesVersion++;

    this.buffer.push({ t: this.now(), pos: world.players.map((p) => ({ x: p.x, y: p.y })) });
    if (this.buffer.length > 6) this.buffer.shift();

    const { dx, dy } = this.predictor.reconcile(acks[this.you] ?? 0);
    // Small corrections are smoothed out over a few frames, big ones snap.
    if (Math.abs(dx) > 2 * UNIT || Math.abs(dy) > 2 * UNIT) {
      this.corrX = this.corrY = 0;
    } else {
      this.corrX += dx;
      this.corrY += dy;
    }

    if (world.over && this.status === 'playing') {
      this.status = 'over';
      this.notify();
    }
  }

  // ---- GameSource -------------------------------------------------------

  setDir(dir: Dir | null): void {
    this.dir = dir;
  }

  pressBomb(): void {
    this.bombQueued = true;
  }

  update(nowMs: number): void {
    if (this.lastNow === null) this.lastNow = nowMs;
    const dt = Math.min(nowMs - this.lastNow, 250);
    this.lastNow = nowMs;

    // Visual correction decays quickly.
    const decay = Math.exp(-dt / 90);
    this.corrX *= decay;
    this.corrY *= decay;

    if (nowMs - this.lastPing > 2000 && this.status !== 'lobby') {
      this.lastPing = nowMs;
      this.send({ t: 'ping', c: this.now() });
    }

    if (!this.world || !this.predictor || this.status !== 'playing') return;
    this.acc += dt;
    let n = 0;
    while (this.acc >= TICK_MS && n < 5) {
      this.acc -= TICK_MS;
      this.tickOnce(nowMs);
      n++;
    }
    if (n === 5) this.acc = 0;
    this.ghosts = this.ghosts.filter((g) => nowMs - g.at < GHOST_LIFETIME_MS);
  }

  private tickOnce(nowMs: number): void {
    const world = this.world!;
    const predictor = this.predictor!;
    const me = world.players[this.you];
    if (!me.alive || world.over) return;

    const bomb = this.bombQueued;
    this.bombQueued = false;
    const seq = predictor.next({ dir: this.dir, bomb });
    this.send({ t: 'input', seq, dir: this.dir, bomb });

    if (bomb) {
      const cx = cellOf(predictor.predicted.x);
      const cy = cellOf(predictor.predicted.y);
      const owned = world.bombs.filter((b) => b.owner === this.you).length + this.ghosts.length;
      if (owned < me.maxBombs && !bombAt(world, cx, cy) && !this.ghosts.some((g) => g.x === cx && g.y === cy)) {
        this.ghosts.push({ x: cx, y: cy, at: nowMs });
        this.events.push({ type: 'bombPlaced', x: cx, y: cy, owner: this.you });
      }
    }
  }

  drainEvents(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  getFrame(nowMs: number): RenderFrame | null {
    const world = this.world;
    const predictor = this.predictor;
    if (!world || !predictor) return null;

    const renderT = this.now() - INTERP_DELAY_MS;
    const buf = this.buffer;
    let a = buf[0];
    let b = buf[buf.length - 1];
    for (let i = 0; i < buf.length - 1; i++) {
      if (buf[i].t <= renderT && renderT <= buf[i + 1].t) {
        a = buf[i];
        b = buf[i + 1];
        break;
      }
    }
    const u = b.t === a.t ? 1 : Math.max(0, Math.min(1, (renderT - a.t) / (b.t - a.t)));

    return {
      tick: world.tick,
      width: world.width,
      height: world.height,
      tiles: world.tiles,
      tilesVersion: this.tilesVersion,
      players: world.players.map((p, i) => {
        if (i === this.you) {
          const pr = predictor.predicted;
          return {
            id: p.id,
            x: (pr.x + this.corrX) / UNIT,
            y: (pr.y + this.corrY) / UNIT,
            alive: p.alive,
            facing: pr.facing,
            moving: pr.moving && p.alive,
            name: this.players[i]?.name ?? '',
          };
        }
        const pa = a.pos[i] ?? { x: p.x, y: p.y };
        const pb = b.pos[i] ?? pa;
        return {
          id: p.id,
          x: (pa.x + (pb.x - pa.x) * u) / UNIT,
          y: (pa.y + (pb.y - pa.y) * u) / UNIT,
          alive: p.alive,
          facing: p.facing,
          moving: p.moving,
          name: this.players[i]?.name ?? '',
        };
      }),
      bombs: [
        ...world.bombs.map((bm) => ({ id: bm.id, x: bm.x, y: bm.y, timer: bm.timer })),
        ...this.ghosts.map((g, i) => ({
          id: -1 - i,
          x: g.x,
          y: g.y,
          timer: BOMB_TIMER - (nowMs - g.at) / TICK_MS,
          predicted: true,
        })),
      ],
      flames: world.flames,
      powerUps: world.powerUps,
      over: world.over,
      winner: world.winner,
      you: this.you,
      timeMs: nowMs,
    };
  }
}

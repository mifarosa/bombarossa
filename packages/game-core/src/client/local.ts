import { TICK_RATE, UNIT } from '../constants';
import { GameEvent, diffEvents } from '../events';
import { RenderFrame } from '../frame';
import { botInput } from '../bot';
import { cloneState, createGame, step } from '../game';
import { Dir, GameState, Input } from '../types';
import type { GameSource } from './source';

const TICK_MS = 1000 / TICK_RATE;
const MAX_CATCHUP_TICKS = 5;

export interface LocalOptions {
  seed?: number;
  /** Number of bots; 0 is a sandbox where you are alone and the match never ends. */
  bots: number;
  playerName?: string;
}

/** Single-player: runs the shared engine locally. Player 0 is the human. */
export class LocalGame implements GameSource {
  readonly you = 0;
  readonly state: GameState;
  private prevPos: Array<{ x: number; y: number }>;
  private names: string[];
  private dir: Dir | null = null;
  private bomb = false;
  private acc = 0;
  private lastNow: number | null = null;
  private events: GameEvent[] = [];
  private tilesVersion = 0;

  constructor(opts: LocalOptions) {
    const seed = opts.seed ?? (Math.random() * 2 ** 32) >>> 0;
    this.state = createGame(seed, opts.bots + 1);
    this.prevPos = this.state.players.map((p) => ({ x: p.x, y: p.y }));
    this.names = this.state.players.map((_, i) => (i === 0 ? (opts.playerName ?? 'Sen') : `Bot ${i}`));
  }

  setDir(dir: Dir | null): void {
    this.dir = dir;
  }

  pressBomb(): void {
    this.bomb = true;
  }

  update(nowMs: number): void {
    if (this.lastNow === null) this.lastNow = nowMs;
    this.acc += Math.min(nowMs - this.lastNow, 250);
    this.lastNow = nowMs;
    let n = 0;
    while (this.acc >= TICK_MS && n < MAX_CATCHUP_TICKS) {
      this.acc -= TICK_MS;
      this.tickOnce();
      n++;
    }
    if (n === MAX_CATCHUP_TICKS) this.acc = 0; // far behind: drop time instead of spiralling
  }

  private tickOnce(): void {
    const s = this.state;
    if (s.over) return;
    const before = cloneState(s);
    this.prevPos = s.players.map((p) => ({ x: p.x, y: p.y }));
    const inputs: Record<number, Input> = { 0: { dir: this.dir, bomb: this.bomb } };
    this.bomb = false;
    for (let id = 1; id < s.players.length; id++) inputs[id] = botInput(s, id);
    step(s, inputs);
    const evs = diffEvents(before, s);
    if (evs.some((e) => e.type === 'blockDestroyed')) this.tilesVersion++;
    this.events.push(...evs);
    if (this.events.length > 200) this.events.splice(0, this.events.length - 200);
  }

  drainEvents(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  getFrame(nowMs: number): RenderFrame {
    const s = this.state;
    const alpha = s.over ? 1 : Math.min(1, this.acc / TICK_MS);
    return {
      tick: s.tick,
      width: s.width,
      height: s.height,
      tiles: s.tiles,
      tilesVersion: this.tilesVersion,
      players: s.players.map((p, i) => ({
        id: p.id,
        x: (this.prevPos[i].x + (p.x - this.prevPos[i].x) * alpha) / UNIT,
        y: (this.prevPos[i].y + (p.y - this.prevPos[i].y) * alpha) / UNIT,
        alive: p.alive,
        facing: p.facing,
        moving: p.moving,
        name: this.names[i],
      })),
      bombs: s.bombs.map((b) => ({ id: b.id, x: b.x, y: b.y, timer: b.timer })),
      flames: s.flames,
      powerUps: s.powerUps,
      over: s.over,
      winner: s.winner,
      you: 0,
      timeMs: nowMs,
    };
  }
}

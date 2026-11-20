import { movePlayer } from './game';
import { Dir, GameState, Input, Player } from './types';

const MAX_PENDING = 120;

/**
 * Client-side prediction for the local player. Every client tick the input is
 * applied locally right away (so the game feels instant) and remembered. When
 * a server snapshot arrives it is authoritative: we start from the server's
 * player state, drop the inputs the server has already processed (`ack`) and
 * replay the rest on top.
 */
export class Predictor {
  predicted: Player;
  private pending: Array<{ seq: number; dir: Dir | null }> = [];
  private seq = 0;

  constructor(
    private readonly world: GameState,
    private readonly you: number,
  ) {
    this.predicted = { ...world.players[you] };
  }

  /** Applies one tick of local input. Returns the sequence number to send to the server. */
  next(input: Input): number {
    const seq = ++this.seq;
    if (this.predicted.alive && input.dir) movePlayer(this.world, this.predicted, input.dir);
    else this.predicted.moving = false;
    this.pending.push({ seq, dir: input.dir });
    if (this.pending.length > MAX_PENDING) this.pending.shift();
    return seq;
  }

  /**
   * Call after the world has been updated from a snapshot. Returns how far the
   * visible position jumped (old minus new, in sub-units) so the UI can smooth it.
   */
  reconcile(ack: number): { dx: number; dy: number } {
    const old = { x: this.predicted.x, y: this.predicted.y };
    const authoritative = this.world.players[this.you];
    const p: Player = { ...authoritative };
    this.pending = this.pending.filter((i) => i.seq > ack);
    if (p.alive) {
      for (const i of this.pending) if (i.dir) movePlayer(this.world, p, i.dir);
    }
    // Keep the local facing/moving flags so the animation doesn't flicker.
    p.facing = this.predicted.alive ? this.predicted.facing : p.facing;
    p.moving = this.predicted.moving;
    this.predicted = p;
    return { dx: old.x - p.x, dy: old.y - p.y };
  }
}

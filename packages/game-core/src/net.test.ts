import { describe, expect, it } from 'vitest';
import {
  GameEvent,
  GameState,
  Input,
  LocalGame,
  Predictor,
  Tile,
  TICK_RATE,
  applySnapshot,
  botInput,
  cloneState,
  createGame,
  destroyedBlocks,
  diffEvents,
  makeSnapshot,
  step,
  UNIT,
} from './index';
import { arena } from './test-utils';

describe('snapshot', () => {
  it('round-trips everything that changes during a match', () => {
    const server = createGame(21, 4);
    const client = cloneState(server);
    let tilesBefore = server.tiles.slice();
    for (let i = 0; i < 400; i++) {
      const inputs: Record<number, Input> = {};
      for (const p of server.players) inputs[p.id] = botInput(server, p.id);
      step(server, inputs);
      if (i % 2 === 1) {
        const destroyed = destroyedBlocks(tilesBefore, server.tiles);
        tilesBefore = server.tiles.slice();
        const snap = makeSnapshot(server, destroyed, { 0: i });
        // survive a JSON round-trip like the real network
        const acks = applySnapshot(client, JSON.parse(JSON.stringify(snap)));
        expect(acks[0]).toBe(i);
      }
    }
    expect(client.tiles).toEqual(server.tiles);
    expect(client.players).toEqual(server.players);
    expect(client.flames).toEqual(server.flames);
    expect(client.powerUps).toEqual(server.powerUps);
    expect(client.bombs.map((b) => ({ ...b, pass: [...b.pass].sort() }))).toEqual(
      server.bombs.map((b) => ({ ...b, pass: [...b.pass].sort() })),
    );
  });

  it('is much smaller than the full state', () => {
    const s = createGame(21, 4);
    for (let i = 0; i < 200; i++) {
      const inputs: Record<number, Input> = {};
      for (const p of s.players) inputs[p.id] = botInput(s, p.id);
      step(s, inputs);
    }
    const snap = JSON.stringify(makeSnapshot(s, []));
    expect(snap.length).toBeLessThan(JSON.stringify(s).length / 2);
    expect(snap.length).toBeLessThan(1200);
  });
});

describe('events', () => {
  it('reports bombs, explosions, blocks, pickups and deaths', () => {
    const s = arena(2);
    s.tiles[3 + 5 * s.width] = Tile.Block;
    s.powerUps.push({ x: 6, y: 1, kind: 'range' });
    const all: GameEvent[] = [];
    const tick = (inputs: Record<number, Input> = {}) => {
      const before = cloneState(s);
      step(s, inputs);
      all.push(...diffEvents(before, s));
    };
    // player 0 collects the power-up at (6,1)
    s.players[0].x = 5500;
    s.players[0].y = 1500;
    for (let i = 0; i < 4; i++) tick({ 0: { dir: 'right', bomb: false } });
    // player 1 drops a bomb next to the block and stands in the blast
    s.players[1].x = 4500;
    s.players[1].y = 5500;
    tick({ 1: { dir: null, bomb: true } });
    for (let i = 0; i < 100; i++) tick();
    const types = all.map((e) => e.type);
    expect(types).toContain('powerUpTaken');
    expect(types).toContain('bombPlaced');
    expect(types).toContain('explosion');
    expect(types).toContain('blockDestroyed');
    expect(types).toContain('playerDied');
    expect(types).toContain('gameOver');
  });
});

describe('prediction', () => {
  /** Simulates a server and a predicting client connected by a laggy link. */
  function simulate(opts: { latencyTicks: (t: number) => number; script: (t: number) => Input['dir']; ticks: number }) {
    const server = arena(2);
    const client: GameState = cloneState(server);
    const predictor = new Predictor(client, 0);
    const toServer: Array<{ at: number; seq: number; dir: Input['dir'] }> = [];
    const toClient: Array<{ at: number; snap: ReturnType<typeof makeSnapshot> }> = [];
    const queue: Array<{ seq: number; dir: Input['dir'] }> = [];
    let ack = 0;
    let maxLead = 0;
    let lastDir: Input['dir'] = null;
    let tilesBefore = server.tiles.slice();

    for (let t = 0; t < opts.ticks; t++) {
      // client tick
      const dir = opts.script(t);
      const seq = predictor.next({ dir, bomb: false });
      toServer.push({ at: t + opts.latencyTicks(t), seq, dir });

      // server tick
      while (toServer.length && toServer[0].at <= t) queue.push(toServer.shift()!);
      const inp = queue.shift();
      if (inp) {
        ack = inp.seq;
        lastDir = inp.dir;
      }
      step(server, { 0: { dir: inp ? inp.dir : lastDir, bomb: false } });
      if (t % 2 === 0) {
        const destroyed = destroyedBlocks(tilesBefore, server.tiles);
        tilesBefore = server.tiles.slice();
        toClient.push({ at: t + opts.latencyTicks(t), snap: JSON.parse(JSON.stringify(makeSnapshot(server, destroyed, { 0: ack }))) });
      }

      // client receives snapshots
      while (toClient.length && toClient[0].at <= t) {
        const { snap } = toClient.shift()!;
        const acks = applySnapshot(client, snap);
        predictor.reconcile(acks[0]);
      }
      maxLead = Math.max(maxLead, Math.abs(predictor.predicted.x - server.players[0].x));
    }
    return { server, client, predictor, maxLead };
  }

  it('matches the server exactly once the link has drained (constant latency)', () => {
    const r = simulate({
      latencyTicks: () => 3,
      script: (t) => (t < 40 ? 'right' : t < 60 ? 'down' : t < 90 ? 'left' : null),
      ticks: 140,
    });
    expect(r.predictor.predicted.x).toBe(r.server.players[0].x);
    expect(r.predictor.predicted.y).toBe(r.server.players[0].y);
  });

  it('runs ahead of the server while moving (that is the point of prediction)', () => {
    const r = simulate({ latencyTicks: () => 4, script: () => 'right', ticks: 25 });
    expect(r.maxLead).toBeGreaterThan(3 * UNIT * 0.17);
  });

  it('stays close to the server under jittery latency', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const r = simulate({
      latencyTicks: () => 2 + Math.floor(rnd() * 4),
      script: (t) => (t < 200 ? (Math.floor(t / 25) % 2 === 0 ? 'right' : 'left') : null),
      ticks: 260,
    });
    expect(Math.abs(r.predictor.predicted.x - r.server.players[0].x)).toBeLessThan(UNIT);
    expect(Math.abs(r.predictor.predicted.y - r.server.players[0].y)).toBeLessThan(UNIT);
  });
});

describe('LocalGame', () => {
  it('advances in fixed ticks and interpolates positions between them', () => {
    const g = new LocalGame({ bots: 0, seed: 3 });
    g.setDir('right');
    g.update(1000);
    expect(g.state.tick).toBe(0);
    g.update(1000 + 1000 / TICK_RATE + 10);
    expect(g.state.tick).toBe(1);
    const f = g.getFrame(2000)!;
    const p = g.state.players[0];
    // between the previous position and the current one
    expect(f.players[0].x).toBeGreaterThan(1.5);
    expect(f.players[0].x).toBeLessThanOrEqual(p.x / UNIT);
    expect(f.players[0].name).toBe('Sen');
  });

  it('turns a bomb press into an event and a bomb', () => {
    const g = new LocalGame({ bots: 0, seed: 3 });
    g.update(0);
    g.pressBomb();
    g.update(100);
    expect(g.state.bombs).toHaveLength(1);
    expect(g.drainEvents().some((e) => e.type === 'bombPlaced')).toBe(true);
    expect(g.drainEvents()).toHaveLength(0);
  });

  it('does not spiral when the app was suspended for a long time', () => {
    const g = new LocalGame({ bots: 3, seed: 3 });
    g.update(0);
    g.update(60_000);
    expect(g.state.tick).toBeLessThanOrEqual(10);
  });
});

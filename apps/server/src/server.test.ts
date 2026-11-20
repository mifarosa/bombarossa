import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OnlineGame, UNIT, type JoinMode, type OnlineStatus } from '@bombarossa/game-core';
import { normalizeCode, sanitizeName } from './names.js';
import { startServer, type RunningServer } from './server.js';

let server: RunningServer;
const clients: OnlineGame[] = [];

beforeEach(async () => {
  server = await startServer({ port: 0, host: '127.0.0.1', quickLobbyMs: 400, botTakeoverMs: 300 });
});

afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  await server.close();
});

function connect(mode: JoinMode, name = 'Test'): OnlineGame {
  const g = new OnlineGame({ url: `ws://127.0.0.1:${server.port}`, name, mode });
  clients.push(g);
  return g;
}

async function waitFor(cond: () => boolean, what: string, timeoutMs = 4000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for: ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

const statusIs = (g: OnlineGame, s: OnlineStatus) => () => g.status === s;

/** Drives the client the way the app does: an update call every ~16 ms. */
function pump(games: OnlineGame[]): () => void {
  const timer = setInterval(() => games.forEach((g) => g.update(performance.now())), 16);
  return () => clearInterval(timer);
}

describe('names', () => {
  it('sanitizes player names', () => {
    expect(sanitizeName('  Ali   Veli  ')).toBe('Ali Veli');
    expect(sanitizeName('<script>alert(1)</script>')).toBe('scriptalert1');
    expect(sanitizeName('x'.repeat(50))).toHaveLength(12);
    expect(sanitizeName('')).toBe('Oyuncu');
    expect(sanitizeName(123)).toBe('Oyuncu');
    expect(sanitizeName('Çağrı Şükrü')).toBe('Çağrı Şükrü');
  });

  it('normalizes room codes', () => {
    expect(normalizeCode('abcd')).toBe('ABCD');
    expect(normalizeCode(' a-b c d ')).toBe('ABCD');
    expect(normalizeCode('ABC')).toBeNull();
    expect(normalizeCode('ABCO')).toBeNull(); // O is not used
    expect(normalizeCode(42)).toBeNull();
  });
});

describe('rooms and lobby', () => {
  it('creates a room with a code that a friend can join', async () => {
    const host = connect({ kind: 'create' }, 'Host');
    await waitFor(statusIs(host, 'lobby'), 'host in lobby');
    expect(host.code).toMatch(/^[A-HJ-NP-Z]{4}$/);
    expect(host.lobby?.host).toBe(true);

    const friend = connect({ kind: 'join', code: host.code.toLowerCase() }, 'Friend');
    await waitFor(statusIs(friend, 'lobby'), 'friend in lobby');
    await waitFor(() => host.lobby?.players.length === 2, 'host sees friend');
    expect(friend.lobby?.host).toBe(false);
    expect(host.lobby?.players.map((p) => p.name)).toEqual(['Host', 'Friend']);
  });

  it('rejects unknown codes', async () => {
    const g = connect({ kind: 'join', code: 'ZZZZ' });
    await waitFor(statusIs(g, 'error'), 'error state');
    expect(g.error?.code).toBe('no_room');
  });

  it('rejects joining a full room', async () => {
    const host = connect({ kind: 'create' }, 'P0');
    await waitFor(statusIs(host, 'lobby'), 'host');
    const others: OnlineGame[] = [];
    for (let i = 1; i < 6; i++) {
      const g = connect({ kind: 'join', code: host.code }, `P${i}`);
      others.push(g);
      await waitFor(statusIs(g, 'lobby'), `player ${i}`);
    }
    const seventh = connect({ kind: 'join', code: host.code }, 'P6');
    await waitFor(statusIs(seventh, 'error'), 'seventh rejected');
    expect(seventh.error?.code).toBe('room_full');
  });

  it('needs two players unless bots are on, and only the host may start', async () => {
    const host = connect({ kind: 'create' }, 'Host');
    await waitFor(statusIs(host, 'lobby'), 'host');
    host.startMatch();
    await waitFor(() => host.error?.code === 'need_players', 'need_players error');

    const friend = connect({ kind: 'join', code: host.code }, 'Friend');
    await waitFor(statusIs(friend, 'lobby'), 'friend');
    friend.startMatch();
    await waitFor(() => friend.error?.code === 'not_host', 'not_host error');
    expect(host.status).toBe('lobby');
  });

  it('starts a 2-player match without bots and sends snapshots', async () => {
    const host = connect({ kind: 'create' }, 'Host');
    await waitFor(statusIs(host, 'lobby'), 'host');
    const friend = connect({ kind: 'join', code: host.code }, 'Friend');
    await waitFor(() => host.lobby?.players.length === 2, 'both in lobby');
    host.startMatch();
    await waitFor(statusIs(host, 'playing'), 'host playing');
    await waitFor(statusIs(friend, 'playing'), 'friend playing');
    const stop = pump([host, friend]);
    await new Promise((r) => setTimeout(r, 300));
    stop();
    const f = host.getFrame(performance.now())!;
    expect(f.players).toHaveLength(2);
    expect([f.width, f.height]).toEqual([13, 11]);
    expect(f.tick).toBeGreaterThan(3);
    expect(host.you).toBe(0);
    expect(friend.you).toBe(1);
  });

  it('fills a bot-enabled 6-player room and uses the large arena', async () => {
    const clientsIn: OnlineGame[] = [];
    const host = connect({ kind: 'create' }, 'P0');
    await waitFor(statusIs(host, 'lobby'), 'host');
    clientsIn.push(host);
    for (let i = 1; i < 5; i++) {
      const g = connect({ kind: 'join', code: host.code }, `P${i}`);
      clientsIn.push(g);
      await waitFor(statusIs(g, 'lobby'), `player ${i}`);
    }
    host.startMatch();
    await waitFor(statusIs(host, 'playing'), 'playing');
    const f = host.getFrame(performance.now())!;
    expect(f.players).toHaveLength(5);
    expect([f.width, f.height]).toEqual([15, 13]);
  });

  it('quick match fills the match with bots after the lobby timeout', async () => {
    const a = connect({ kind: 'quick' }, 'A');
    const b = connect({ kind: 'quick' }, 'B');
    await waitFor(statusIs(a, 'lobby'), 'a lobby');
    await waitFor(statusIs(b, 'lobby'), 'b lobby');
    expect(a.code).toBe(b.code);
    await waitFor(statusIs(a, 'playing'), 'a playing');
    await waitFor(statusIs(b, 'playing'), 'b playing');
    expect(a.getFrame(performance.now())!.players).toHaveLength(4);
    expect(a.players.filter((p) => p.bot)).toHaveLength(2);
  });

  it('a started match is no longer joinable', async () => {
    const host = connect({ kind: 'create' }, 'Host');
    await waitFor(statusIs(host, 'lobby'), 'host');
    host.setBots(true);
    await waitFor(() => host.lobby?.bots === true, 'bots enabled');
    host.startMatch();
    await waitFor(statusIs(host, 'playing'), 'playing');
    const late = connect({ kind: 'join', code: host.code }, 'Late');
    await waitFor(statusIs(late, 'error'), 'late rejected');
    expect(late.error?.code).toBe('started');
  });
});

describe('gameplay over the network', () => {
  it('moves the local player instantly (prediction) and stays in sync with the server', async () => {
    const host = connect({ kind: 'create' }, 'Host');
    await waitFor(statusIs(host, 'lobby'), 'host');
    const friend = connect({ kind: 'join', code: host.code }, 'Friend');
    await waitFor(() => host.lobby?.players.length === 2, 'both in lobby');
    host.startMatch();
    await waitFor(statusIs(host, 'playing'), 'playing');
    await waitFor(statusIs(friend, 'playing'), 'friend playing');
    const stop = pump([host, friend]);

    const startX = host.getFrame(performance.now())!.players[0].x;
    host.setDir('right');
    await new Promise((r) => setTimeout(r, 250));
    // predicted position has already advanced, with no wait for the server
    const during = host.getFrame(performance.now())!.players[0].x;
    expect(during).toBeGreaterThan(startX + 0.5);

    host.setDir(null);
    await new Promise((r) => setTimeout(r, 500));
    stop();

    const room = [...server.manager.rooms.values()][0];
    const serverPlayer = room.game!.players[0];
    const clientPlayer = host.getFrame(performance.now())!.players[0];
    expect(Math.abs(clientPlayer.x - serverPlayer.x / UNIT)).toBeLessThan(0.05);
    expect(Math.abs(clientPlayer.y - serverPlayer.y / UNIT)).toBeLessThan(0.05);
    // the other client sees player 0 at the same place (interpolated)
    const seenByFriend = friend.getFrame(performance.now())!.players[0];
    expect(Math.abs(seenByFriend.x - serverPlayer.x / UNIT)).toBeLessThan(0.3);
  });

  it('places a bomb and reports the sound event once', async () => {
    const host = connect({ kind: 'create' }, 'Host');
    await waitFor(statusIs(host, 'lobby'), 'host');
    host.setBots(true);
    await waitFor(() => host.lobby?.bots === true, 'bots');
    host.startMatch();
    await waitFor(statusIs(host, 'playing'), 'playing');
    const stop = pump([host]);
    host.pressBomb();
    await new Promise((r) => setTimeout(r, 400));
    stop();
    const events = host.drainEvents().filter((e) => e.type === 'bombPlaced' && e.owner === 0);
    expect(events).toHaveLength(1);
    const room = [...server.manager.rooms.values()][0];
    expect(room.game!.bombs.some((b) => b.owner === 0)).toBe(true);
    expect(host.getFrame(performance.now())!.bombs.filter((b) => !b.predicted).length).toBeGreaterThan(0);
  });

  it('lets a client reconnect with its token and continue the same match', async () => {
    const host = connect({ kind: 'create' }, 'Host');
    await waitFor(statusIs(host, 'lobby'), 'host');
    host.setBots(true);
    await waitFor(() => host.lobby?.bots === true, 'bots');
    host.startMatch();
    await waitFor(statusIs(host, 'playing'), 'playing');
    const stop = pump([host]);
    const tokenBefore = host.token;

    // simulate a network drop
    (host as unknown as { ws: { close(): void } }).ws.close();
    await waitFor(statusIs(host, 'reconnecting'), 'reconnecting');
    await waitFor(statusIs(host, 'playing'), 'playing again', 6000);
    stop();
    expect(host.token).toBe(tokenBefore);
    expect(host.you).toBe(0);
    expect(server.manager.rooms.size).toBe(1);
  });

  it('survives garbage and floods without crashing', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
    await new Promise((r) => (ws.onopen = r));
    ws.send('not json');
    ws.send('{"t":42}');
    ws.send(JSON.stringify({ t: 'input', seq: 'x', dir: 'sideways', bomb: 1 }));
    for (let i = 0; i < 2000; i++) ws.send(JSON.stringify({ t: 'ping', c: i }));
    await new Promise((r) => setTimeout(r, 200));
    const res = await fetch(`http://127.0.0.1:${server.port}/health`);
    expect((await res.json()).ok).toBe(true);
    ws.close();
  });
});

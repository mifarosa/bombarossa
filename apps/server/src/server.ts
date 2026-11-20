import { createServer, IncomingMessage } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { ClientMessage, ErrorCode, TICK_RATE } from '@bombarossa/game-core';
import { RoomManager } from './manager.js';
import { normalizeCode, sanitizeName } from './names.js';
import type { Conn, ServerOptions } from './types.js';

const MAX_SEQ = 2 ** 31 - 1;
const BUCKET_CAPACITY = 150;
const BUCKET_REFILL_PER_MS = 90 / 1000;
const LIMIT_KICK_MS = 3000;
const DIRS = new Set(['up', 'down', 'left', 'right']);

export interface RunningServer {
  port: number;
  manager: RoomManager;
  close(): Promise<void>;
}

export async function startServer(opts: ServerOptions): Promise<RunningServer> {
  const log = opts.log ?? (() => {});
  const now = () => Date.now();
  const manager = new RoomManager({
    now,
    quickLobbyMs: opts.quickLobbyMs ?? 8000,
    botTakeoverMs: opts.botTakeoverMs ?? 10_000,
    maxRooms: opts.maxRooms ?? 300,
  });
  const maxConnsPerIp = opts.maxConnsPerIp ?? 20;
  const startedAt = now();
  const connsPerIp = new Map<string, number>();
  let nextConnId = 1;

  const http = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: true,
          rooms: manager.rooms.size,
          players: manager.playerCount,
          uptimeSec: Math.round((now() - startedAt) / 1000),
        }),
      );
      return;
    }
    res.writeHead(404).end();
  });

  const wss = new WebSocketServer({ server: http, maxPayload: 1024 });

  function clientIp(req: IncomingMessage): string {
    if (opts.trustProxy) {
      const fwd = req.headers['x-forwarded-for'];
      const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
      if (first) return first;
    }
    return req.socket.remoteAddress ?? 'unknown';
  }

  const sendError = (ws: WebSocket, code: ErrorCode, message: string) => {
    if (ws.readyState === 1) ws.send(RoomManager.error(code, message));
  };

  wss.on('connection', (ws, req) => {
    const ip = clientIp(req);
    const count = (connsPerIp.get(ip) ?? 0) + 1;
    if (count > maxConnsPerIp) {
      sendError(ws, 'busy', 'Too many connections');
      ws.close();
      return;
    }
    connsPerIp.set(ip, count);

    const conn: Conn = {
      id: nextConnId++,
      ws,
      ip,
      room: null,
      slot: null,
      bucketTokens: BUCKET_CAPACITY,
      bucketAt: now(),
      limitedSince: null,
    };

    ws.on('message', (raw) => {
      // Token bucket: ~90 msgs/s sustained (inputs are 30/s) with a burst allowance.
      const t = now();
      conn.bucketTokens = Math.min(BUCKET_CAPACITY, conn.bucketTokens + (t - conn.bucketAt) * BUCKET_REFILL_PER_MS);
      conn.bucketAt = t;
      if (conn.bucketTokens < 1) {
        conn.limitedSince ??= t;
        if (t - conn.limitedSince > LIMIT_KICK_MS) ws.close();
        return;
      }
      conn.bucketTokens -= 1;
      conn.limitedSince = null;

      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object' || typeof (msg as { t?: unknown }).t !== 'string') return;
      handle(conn, msg);
    });

    ws.on('close', () => {
      connsPerIp.set(ip, Math.max(0, (connsPerIp.get(ip) ?? 1) - 1));
      conn.room?.disconnect(conn);
    });
    ws.on('error', () => ws.terminate());
  });

  function handle(conn: Conn, msg: ClientMessage): void {
    const ws = conn.ws;
    switch (msg.t) {
      case 'quick':
      case 'create':
      case 'join': {
        if (conn.room) return sendError(ws, 'busy', 'Already in a room');
        const name = sanitizeName(msg.name);
        let room;
        if (msg.t === 'quick') {
          room = manager.quickMatchRoom();
        } else if (msg.t === 'create') {
          room = manager.createRoom();
        } else {
          const code = normalizeCode(msg.code);
          room = code ? manager.find(code) : undefined;
          if (!room) return sendError(ws, 'no_room', 'Oda bulunamadı');
          if (room.phase !== 'lobby') return sendError(ws, 'started', 'Oyun zaten başladı');
          if (!room.joinable) return sendError(ws, 'room_full', 'Oda dolu');
        }
        if (!room) return sendError(ws, 'busy', 'Sunucu dolu, biraz sonra dene');
        room.addPlayer(conn, name);
        log(`conn ${conn.id} joined ${room.code}`);
        return;
      }
      case 'rejoin': {
        const found = typeof msg.token === 'string' ? manager.byToken(msg.token) : undefined;
        if (!found) return sendError(ws, 'bad_token', 'Oturum bulunamadı');
        found.room.reattach(found.slot, conn);
        return;
      }
      case 'leave': {
        if (conn.room && conn.slot) conn.room.removePlayer(conn.slot);
        return;
      }
      case 'bots': {
        const { room, slot } = conn;
        if (!room || !slot) return;
        if (!room.isHost(slot)) return sendError(ws, 'not_host', 'Sadece oda sahibi');
        room.setBots(msg.on === true);
        return;
      }
      case 'start': {
        const { room, slot } = conn;
        if (!room || !slot) return;
        if (room.quick) return;
        if (!room.isHost(slot)) return sendError(ws, 'not_host', 'Sadece oda sahibi başlatabilir');
        const err = room.start();
        if (err === 'need_players') sendError(ws, 'need_players', 'En az 2 oyuncu gerekli (ya da botları aç)');
        else if (err) sendError(ws, err, 'Oyun zaten başladı');
        return;
      }
      case 'rematch': {
        const { room, slot } = conn;
        if (!room || !slot) return;
        if (!room.isHost(slot)) return sendError(ws, 'not_host', 'Sadece oda sahibi');
        room.rematch();
        return;
      }
      case 'input': {
        const { room, slot } = conn;
        if (!room || !slot) return;
        const { seq, dir, bomb } = msg;
        if (!Number.isInteger(seq) || seq < 0 || seq > MAX_SEQ) return;
        if (dir !== null && !DIRS.has(dir as string)) return;
        room.pushInput(slot, { seq, dir, bomb: bomb === true });
        return;
      }
      case 'ping': {
        if (ws.readyState === 1 && typeof msg.c === 'number') ws.send(JSON.stringify({ t: 'pong', c: msg.c }));
        return;
      }
    }
  }

  // One drift-corrected loop drives every room.
  const tickMs = 1000 / TICK_RATE;
  let next = performance.now() + tickMs;
  let ticks = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const loop = () => {
    if (stopped) return;
    const t = performance.now();
    let guard = 0;
    while (t >= next && guard++ < 5) {
      try {
        manager.tick();
        if (++ticks % TICK_RATE === 0) manager.housekeeping();
      } catch (err) {
        log(`tick error: ${err instanceof Error ? err.stack : String(err)}`);
      }
      next += tickMs;
    }
    if (guard >= 5) next = t + tickMs; // we fell far behind; don't try to catch up
    timer = setTimeout(loop, Math.max(0, next - performance.now()));
  };
  timer = setTimeout(loop, tickMs);

  await new Promise<void>((resolve) => http.listen(opts.port, opts.host, resolve));
  const address = http.address();
  const port = typeof address === 'object' && address ? address.port : opts.port;
  log(`bombarossa server listening on :${port}`);

  return {
    port,
    manager,
    async close() {
      stopped = true;
      if (timer) clearTimeout(timer);
      manager.closeAll();
      for (const c of wss.clients) c.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}

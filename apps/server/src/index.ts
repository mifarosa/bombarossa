import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMessage } from '@bombarossa/game-core';
import { Room } from './room.js';

const PORT = Number(process.env.PORT ?? 8080);

const rooms = new Set<Room>();
const roomOf = new WeakMap<WebSocket, Room>();
let nextRoomId = 1;

function findOrCreateRoom(): Room {
  for (const r of rooms) if (r.joinable) return r;
  const room = new Room(String(nextRoomId++), (r) => rooms.delete(r));
  rooms.add(room);
  return room;
}

// Plain HTTP endpoint so hosting platforms / uptime checks have something to hit.
const http = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ server: http, maxPayload: 1024 });

wss.on('connection', (socket) => {
  socket.on('message', (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.t === 'join') {
      if (roomOf.has(socket)) return;
      const room = findOrCreateRoom();
      roomOf.set(socket, room);
      room.join(socket);
    } else if (msg.t === 'input') {
      const dirs = [null, 'up', 'down', 'left', 'right'];
      if (!dirs.includes(msg.dir as string | null)) return;
      roomOf.get(socket)?.setInput(socket, msg.dir, msg.bomb === true);
    }
  });
  socket.on('close', () => roomOf.get(socket)?.leave(socket));
  socket.on('error', () => socket.terminate());
});

http.listen(PORT, () => console.log(`bombarossa server listening on :${PORT}`));

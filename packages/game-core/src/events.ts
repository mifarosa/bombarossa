import { cellOf } from './game';
import { GameState, PowerUpKind, Tile } from './types';

export type GameEvent =
  | { type: 'bombPlaced'; x: number; y: number; owner: number }
  | { type: 'explosion'; x: number; y: number }
  | { type: 'blockDestroyed'; x: number; y: number }
  | { type: 'powerUpTaken'; playerId: number; kind: PowerUpKind; x: number; y: number }
  | { type: 'playerDied'; playerId: number; x: number; y: number }
  | { type: 'gameOver'; winner: number | null };

/** Derives sound/effect events by comparing two consecutive states (same on server snapshots and local play). */
export function diffEvents(prev: GameState, next: GameState): GameEvent[] {
  const events: GameEvent[] = [];

  const prevBombs = new Map(prev.bombs.map((b) => [b.id, b]));
  const nextBombs = new Set(next.bombs.map((b) => b.id));
  for (const b of next.bombs) {
    if (!prevBombs.has(b.id)) events.push({ type: 'bombPlaced', x: b.x, y: b.y, owner: b.owner });
  }
  for (const b of prev.bombs) {
    if (!nextBombs.has(b.id)) events.push({ type: 'explosion', x: b.x, y: b.y });
  }

  for (let i = 0; i < prev.tiles.length; i++) {
    if (prev.tiles[i] === Tile.Block && next.tiles[i] !== Tile.Block) {
      events.push({ type: 'blockDestroyed', x: i % next.width, y: Math.floor(i / next.width) });
    }
  }

  for (const u of prev.powerUps) {
    const stillThere = next.powerUps.some((n) => n.x === u.x && n.y === u.y);
    if (stillThere) continue;
    const taker = next.players.find((p) => p.alive && cellOf(p.x) === u.x && cellOf(p.y) === u.y);
    if (taker) events.push({ type: 'powerUpTaken', playerId: taker.id, kind: u.kind, x: u.x, y: u.y });
  }

  for (const p of next.players) {
    const before = prev.players[p.id];
    if (before && before.alive && !p.alive) {
      events.push({ type: 'playerDied', playerId: p.id, x: cellOf(p.x), y: cellOf(p.y) });
    }
  }

  if (!prev.over && next.over) events.push({ type: 'gameOver', winner: next.winner });
  return events;
}

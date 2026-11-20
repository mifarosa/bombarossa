import { GameState, Tile, createGame } from './index';

/** Empty arena (walls on the border only) to test mechanics in isolation. */
export function arena(playerCount = 2): GameState {
  const s = createGame(1, playerCount);
  s.tiles = s.tiles.map((_, i) => {
    const x = i % s.width;
    const y = Math.floor(i / s.width);
    const border = x === 0 || y === 0 || x === s.width - 1 || y === s.height - 1;
    return border ? Tile.Wall : Tile.Empty;
  });
  return s;
}


import { BOMB_TIMER, FLAME_TTL, Tile, type Dir, type PowerUpKind, type RenderFrame } from '@bombarossa/game-core';
import { darken, lighten } from './color';
import type { Painter } from './painter';
import type { DrawOptions, Theme } from './theme';

/** Retro look: every cell is a 12x12 grid of chunky pixels, flat colours, no smoothing tricks. */
const PLAYER_COLORS = ['#3ba7ff', '#ff4d6d', '#51d36b', '#ffd43b', '#b77cff', '#ff922b'];
const N = 12; // pixels per cell edge

const FLOOR_A = '#3f8f4f';
const FLOOR_B = '#3a8649';
const FLOOR_SHADOW = '#2b6a38';

/** Pixel-snapped rectangle in cell-local pixel units. */
function px(p: Painter, ox: number, oy: number, u: number, x: number, y: number, w: number, h: number, color: string): void {
  const x0 = Math.round(ox + x * u);
  const y0 = Math.round(oy + y * u);
  const x1 = Math.round(ox + (x + w) * u);
  const y1 = Math.round(oy + (y + h) * u);
  p.rect(x0, y0, x1 - x0, y1 - y0, color);
}

/** Draws an ASCII sprite; '.' is transparent and `pal` maps the other characters to colours. */
function sprite(
  p: Painter,
  ox: number,
  oy: number,
  u: number,
  rows: string[],
  pal: Record<string, string>,
  flipX = false,
): void {
  for (let y = 0; y < rows.length; y++) {
    const row = flipX ? [...rows[y]].reverse().join('') : rows[y];
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let run = 1;
      while (x + run < row.length && row[x + run] === ch) run++;
      if (ch !== '.' && pal[ch]) px(p, ox, oy, u, x, y, run, 1, pal[ch]);
      x += run;
    }
  }
}

function drawStatic(p: Painter, f: RenderFrame, o: DrawOptions): void {
  const c = o.cell;
  const u = c / N;
  const { width: w, height: h, tiles } = f;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && tiles[y * w + x] !== Tile.Empty;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = tiles[y * w + x];
      const ox = x * c;
      const oy = y * c;
      if (t === Tile.Empty) {
        px(p, ox, oy, u, 0, 0, N, N, (x + y) % 2 === 0 ? FLOOR_A : FLOOR_B);
        if (solid(x, y - 1)) px(p, ox, oy, u, 0, 0, N, 3, FLOOR_SHADOW);
        if (solid(x - 1, y)) px(p, ox, oy, u, 0, solid(x, y - 1) ? 3 : 0, 2, N, FLOOR_SHADOW);
      } else if (t === Tile.Wall) {
        px(p, ox, oy, u, 0, 0, N, N, '#8a93b3');
        px(p, ox, oy, u, 0, 0, N, 1, '#c3cae0');
        px(p, ox, oy, u, 0, 0, 1, N, '#c3cae0');
        px(p, ox, oy, u, 0, N - 1, N, 1, '#4d5578');
        px(p, ox, oy, u, N - 1, 0, 1, N, '#4d5578');
        px(p, ox, oy, u, 1, 1, N - 2, 1, '#a9b2cf');
        for (const [rx, ry] of [[2, 2], [8, 2], [2, 8], [8, 8]]) px(p, ox, oy, u, rx, ry, 2, 2, '#5f6890');
      } else {
        // brick block
        px(p, ox, oy, u, 0, 0, N, N, '#6e2a14'); // mortar
        const bands: Array<[number, number[]]> = [
          [0, [0, 6]],
          [4, [3, 9]],
          [8, [0, 6]],
        ];
        for (const [by, starts] of bands) {
          for (const sx of starts) {
            const bx = sx % N;
            const bw = 5;
            const width = Math.min(bw, N - bx);
            px(p, ox, oy, u, bx, by, width, 3, '#c0562e');
            px(p, ox, oy, u, bx, by, width, 1, '#e07a4a');
          }
        }
        // wrap the offset row so brick edges meet the cell edge
        px(p, ox, oy, u, 0, 4, 2, 3, '#c0562e');
        px(p, ox, oy, u, 0, 4, 2, 1, '#e07a4a');
      }
    }
  }
}

const BOMB_PAL = { k: '#15161c', g: '#6b7080', w: '#ffffff', c: '#4b4f5c' };
const BOMB_ROWS = [
  '............',
  '.....cc.....',
  '.....cc.....',
  '....kkkk....',
  '...kkkkkk...',
  '..kwwkkkkk..',
  '..kwgkkkkk..',
  '..kkkkkkkk..',
  '..kkkkkkkk..',
  '...kkkkkk...',
  '....kkkk....',
  '............',
];
const BOMB_ROWS_BIG = [
  '.....cc.....',
  '....kkkk....',
  '...kkkkkk...',
  '..kwwkkkkk..',
  '.kkwgkkkkkk.',
  '.kkkkkkkkkk.',
  '.kkkkkkkkkk.',
  '.kkkkkkkkkk.',
  '.kkkkkkkkkk.',
  '..kkkkkkkk..',
  '...kkkkkk...',
  '....kkkk....',
];

function drawBomb(p: Painter, x: number, y: number, timer: number, t: number, o: DrawOptions): void {
  const c = o.cell;
  const u = c / N;
  const ox = x * c;
  const oy = y * c;
  const elapsed = 1 - Math.max(0, Math.min(1, timer / BOMB_TIMER));
  const period = 520 - 380 * elapsed * elapsed;
  const big = Math.floor(t / period) % 2 === 0;
  const hot = timer < 24 && Math.floor(t / 100) % 2 === 0;
  const pal = hot ? { ...BOMB_PAL, k: '#7a1e1e' } : BOMB_PAL;
  px(p, ox, oy, u, 2, 10, 8, 2, FLOOR_SHADOW);
  sprite(p, ox, oy, u, big ? BOMB_ROWS_BIG : BOMB_ROWS, pal);
  // spark
  const spark = Math.floor(t / 90) % 2 === 0 ? '#ffe066' : '#ff922b';
  px(p, ox, oy, u, 7, 0, 2, 2, spark);
}

const ICONS: Record<PowerUpKind, { bg: string; fg: string; rows: string[] }> = {
  bomb: {
    bg: '#1c7ed6',
    fg: '#ffffff',
    rows: ['....f...', '...ff...', '..kkkk..', '.kkkkkk.', '.kkkkkk.', '.kkkkkk.', '..kkkk..', '........'],
  },
  range: {
    bg: '#e03131',
    fg: '#ffd43b',
    rows: ['...f....', '..ff....', '.fff..f.', '.ffff.ff', '.ffffff.', '.ffrrff.', '..frrf..', '...ff...'],
  },
  speed: {
    bg: '#f59f00',
    fg: '#2b1b00',
    rows: ['....ff..', '...ff...', '..ff....', '.ffffff.', '....ff..', '...ff...', '..ff....', '.f......'],
  },
};

function drawPowerUp(p: Painter, x: number, y: number, kind: PowerUpKind, t: number, o: DrawOptions): void {
  const c = o.cell;
  const u = c / N;
  const ox = x * c;
  const oy = y * c + (Math.floor(t / 300) % 2 === 0 ? 0 : -Math.round(u));
  const icon = ICONS[kind];
  px(p, ox, oy, u, 1, 1, N - 2, N - 2, '#ffffff');
  px(p, ox, oy, u, 2, 2, N - 4, N - 4, icon.bg);
  sprite(p, ox + 2 * u, oy + 2 * u, u, icon.rows, { f: icon.fg, k: '#10131a', r: icon.bg });
}

function drawFlame(p: Painter, x: number, y: number, ttl: number, t: number, o: DrawOptions): void {
  const c = o.cell;
  const u = c / N;
  const ox = x * c;
  const oy = y * c;
  const prog = 1 - ttl / FLAME_TTL;
  const inset = prog < 0.2 ? 2 : prog > 0.75 ? 2 : 0;
  const alt = Math.floor(t / 80) % 2 === 0;
  px(p, ox, oy, u, inset, inset, N - inset * 2, N - inset * 2, '#e8590c');
  px(p, ox, oy, u, inset + 1, inset + 1, N - inset * 2 - 2, N - inset * 2 - 2, '#ff922b');
  px(p, ox, oy, u, 3, 3, 6, 6, '#ffd43b');
  px(p, ox, oy, u, 4, 4, 4, 4, '#fff3bf');
  if (alt) {
    px(p, ox, oy, u, 1, 1, 2, 2, '#ffd43b');
    px(p, ox, oy, u, 9, 9, 2, 2, '#ffd43b');
  } else {
    px(p, ox, oy, u, 9, 1, 2, 2, '#ffd43b');
    px(p, ox, oy, u, 1, 9, 2, 2, '#ffd43b');
  }
}

// Little helmeted hero, 12x12. h/H = helmet (player colour), d = suit, s = skin, e = eye, b = boots.
const HERO_DOWN = [
  '...kkkkkk...',
  '..kHHhhhhk..',
  '.kHhhhhhhhk.',
  '.khhhhhhhhk.',
  '.kssssssssk.',
  '.ksesssseskk',
  '.kssssssssk.',
  '..kssssssk..',
  '..kddddddk..',
  '.kdddhhdddk.',
  '..kddddddk..',
  '..kb....bk..',
];
const HERO_SIDE = [
  '...kkkkkk...',
  '..kHHhhhhk..',
  '.kHhhhhhhhk.',
  '.khhhhhhhhk.',
  '.kssssssssk.',
  '.kessessssk.',
  '.kssssssssk.',
  '..kssssssk..',
  '..kddddddk..',
  '.kdddhhdddk.',
  '..kddddddk..',
  '..kb....bk..',
];
const HERO_UP = [
  '...kkkkkk...',
  '..kHHhhhhk..',
  '.kHhhhhhhhk.',
  '.khhhhhhhhk.',
  '.khhhhhhhhk.',
  '.khhhhhhhhk.',
  '.khhhhhhhhk.',
  '..khhhhhhk..',
  '..kddddddk..',
  '.kdddddddk..',
  '..kddddddk..',
  '..kb....bk..',
];
const FEET_B = '...kb..bk...';

function drawPlayer(
  p: Painter,
  color: string,
  x: number,
  y: number,
  facing: Dir,
  moving: boolean,
  isYou: boolean,
  t: number,
  o: DrawOptions,
): void {
  const c = o.cell;
  const u = c / N;
  const ox = Math.round(x * c - c / 2);
  const oy = Math.round(y * c - c / 2);
  const step = moving && Math.floor(t / 110) % 2 === 1;
  const base = facing === 'up' ? HERO_UP : facing === 'down' ? HERO_DOWN : HERO_SIDE;
  const rows = base.slice();
  if (step) rows[11] = FEET_B;
  const pal = {
    k: '#14121f',
    h: color,
    H: lighten(color, 0.45),
    d: darken(color, 0.3),
    s: '#ffd8b0',
    e: '#14121f',
    b: '#3a2a55',
  };
  px(p, ox, oy, u, 2, 11, 8, 1, '#00000040');
  sprite(p, ox, oy - (moving && step ? Math.round(u) : 0), u, rows, pal, facing === 'right');
  if (isYou) {
    const hop = Math.floor(t / 250) % 2 === 0 ? 0 : 1;
    px(p, ox, oy, u, 4, -2 + hop, 4, 1, '#ffffff');
    px(p, ox, oy, u, 5, -1 + hop, 2, 1, '#ffffff');
  }
}

function drawDynamic(p: Painter, f: RenderFrame, o: DrawOptions): void {
  const t = f.timeMs;
  for (const up of f.powerUps) drawPowerUp(p, up.x, up.y, up.kind, t, o);
  for (const b of f.bombs) drawBomb(p, b.x, b.y, b.timer, t, o);
  for (const fl of f.flames) drawFlame(p, fl.x, fl.y, fl.ttl, t, o);
  const order = f.players.filter((pl) => pl.alive).sort((a, b) => a.y - b.y);
  for (const pl of order) {
    drawPlayer(p, PLAYER_COLORS[pl.id % PLAYER_COLORS.length], pl.x, pl.y, pl.facing, pl.moving, pl.id === f.you, t, o);
  }
}

export const classicTheme: Theme = {
  id: 'classic',
  label: 'Klasik',
  ui: {
    bg: '#0b1d2a',
    panel: '#12354a',
    panelBorder: '#2b6a8a',
    text: '#f1f5f9',
    muted: '#8fb3c7',
    accent: '#ffd43b',
    accentText: '#1a1300',
    danger: '#ff6b6b',
  },
  playerColors: PLAYER_COLORS,
  particleShape: 'square',
  drawStatic,
  drawDynamic,
};

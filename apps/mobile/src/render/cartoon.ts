import { BOMB_TIMER, FLAME_TTL, Tile, type Dir, type PowerUpKind, type RenderFrame } from '@bombarossa/game-core';
import { darken, lighten } from './color';
import type { Painter } from './painter';
import type { DrawOptions, Theme } from './theme';

const PLAYER_COLORS = ['#4fc3f7', '#ff6b81', '#7bed9f', '#ffd166', '#c792ea', '#ff9f43'];
const POWERUP_COLORS: Record<PowerUpKind, string> = { bomb: '#3b82f6', range: '#ef4444', speed: '#f5b301' };

const FLOOR_A = '#c9ecc9';
const FLOOR_B = '#bce4bd';

function drawStatic(p: Painter, f: RenderFrame, o: DrawOptions): void {
  const c = o.cell;
  const fancy = o.quality > 0;
  const { width: w, height: h, tiles } = f;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && tiles[y * w + x] !== Tile.Empty;

  // floor
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      p.rect(x * c, y * c, c, c, (x + y) % 2 === 0 ? FLOOR_A : FLOOR_B);
    }
  }

  // soft shadows cast onto the floor by walls and blocks
  if (fancy) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (tiles[y * w + x] !== Tile.Empty) continue;
        if (solid(x, y - 1)) p.rect(x * c, y * c, c, c * 0.2, { color: '#1b4d2e', alpha: 0.2 });
        if (solid(x - 1, y)) p.rect(x * c, y * c, c * 0.1, c, { color: '#1b4d2e', alpha: 0.12 });
      }
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = tiles[y * w + x];
      const px = x * c;
      const py = y * c;
      if (t === Tile.Wall) {
        const m = c * 0.03;
        const s = c - m * 2;
        if (fancy) {
          p.rrect(px + m, py + m, s, s, c * 0.14, {
            linear: { x0: 0, y0: py, x1: 0, y1: py + c, c0: '#9a90bf', c1: '#6a628f' },
          });
          p.rrect(px + c * 0.12, py + c * 0.1, c * 0.76, c * 0.16, c * 0.08, { color: '#ffffff', alpha: 0.25 });
          p.strokeRRect(px + m, py + m, s, s, c * 0.14, c * 0.05, '#4d4670');
        } else {
          p.rect(px, py, c, c, '#756d9b');
        }
      } else if (t === Tile.Block) {
        const m = c * 0.05;
        const s = c - m * 2;
        if (fancy) {
          p.rrect(px + m, py + m, s, s, c * 0.12, {
            linear: { x0: 0, y0: py, x1: 0, y1: py + c, c0: '#f6c07a', c1: '#d98a3d' },
          });
          // planks
          p.line(px + c * 0.12, py + c * 0.36, px + c * 0.88, py + c * 0.36, c * 0.045, '#9c5a1f', 0.45);
          p.line(px + c * 0.12, py + c * 0.64, px + c * 0.88, py + c * 0.64, c * 0.045, '#9c5a1f', 0.45);
          for (const [nx, ny] of [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]) {
            p.circle(px + c * nx, py + c * ny, c * 0.04, { color: '#8a4d17', alpha: 0.8 });
          }
          p.rrect(px + c * 0.14, py + c * 0.1, c * 0.5, c * 0.1, c * 0.05, { color: '#ffffff', alpha: 0.3 });
          p.strokeRRect(px + m, py + m, s, s, c * 0.12, c * 0.055, '#9c5a1f');
        } else {
          p.rect(px + m, py + m, s, s, '#e0963f');
        }
      }
    }
  }
}

function drawBomb(p: Painter, x: number, y: number, timer: number, t: number, o: DrawOptions): void {
  const c = o.cell;
  const cx = (x + 0.5) * c;
  const cy = (y + 0.5) * c;
  const elapsed = 1 - Math.max(0, Math.min(1, timer / BOMB_TIMER));
  const freq = 2.5 + 9 * elapsed * elapsed; // beats faster as it is about to blow
  const pulse = 1 + 0.07 * Math.sin((2 * Math.PI * freq * t) / 1000);
  const hot = timer < 24 && Math.floor(t / 110) % 2 === 0;

  p.save();
  p.translate(cx, cy);
  if (o.quality > 0) p.oval(0, c * 0.3, c * 0.3, c * 0.09, { color: '#000000', alpha: 0.25 });
  const r = c * 0.34 * pulse;
  if (o.quality > 1) {
    p.circle(0, 0, r, {
      radial: { cx: -c * 0.1, cy: -c * 0.12, r: c * 0.5, c0: hot ? '#a33' : '#6b7080', c1: hot ? '#400' : '#0c0d12' },
    });
    p.circle(-c * 0.12, -c * 0.14, c * 0.07, { color: '#ffffff', alpha: 0.55 });
  } else {
    p.circle(0, 0, r, hot ? '#7a1e1e' : '#15161c');
  }
  p.rrect(-c * 0.09, -r - c * 0.04, c * 0.18, c * 0.1, c * 0.03, '#4b4f5c');
  p.line(0, -r - c * 0.02, c * 0.12, -r - c * 0.16, c * 0.045, '#8a5a2b');
  // spark
  const flick = 0.75 + 0.25 * Math.sin(t / 45);
  p.circle(c * 0.12, -r - c * 0.17, c * 0.1 * flick, { color: '#ff9f1a', alpha: 0.55 });
  p.circle(c * 0.12, -r - c * 0.17, c * 0.055 * flick, '#ffe066');
  p.restore();
}

function drawPowerUp(p: Painter, x: number, y: number, kind: PowerUpKind, t: number, o: DrawOptions): void {
  const c = o.cell;
  const bob = Math.sin(t / 260 + x * 1.7 + y) * c * 0.04;
  const base = POWERUP_COLORS[kind];
  p.save();
  p.translate((x + 0.5) * c, (y + 0.5) * c + bob);
  if (o.quality > 0) {
    p.oval(0, c * 0.34 - bob, c * 0.22, c * 0.06, { color: '#000000', alpha: 0.2 });
    p.circle(0, 0, c * 0.4, { color: base, alpha: 0.25 });
  }
  p.circle(0, 0, c * 0.31, o.quality > 1 ? { linear: { x0: 0, y0: -c * 0.3, x1: 0, y1: c * 0.3, c0: lighten(base, 0.25), c1: darken(base, 0.15) } } : base);
  p.strokeCircle(0, 0, c * 0.31, c * 0.045, '#ffffff', 0.9);
  const white = '#ffffff';
  if (kind === 'bomb') {
    p.circle(0, c * 0.03, c * 0.12, white);
    p.line(c * 0.05, -c * 0.07, c * 0.12, -c * 0.14, c * 0.04, white);
  } else if (kind === 'range') {
    p.polygon(
      [0, -0.22, 0.13, -0.02, 0.09, 0.2, -0.09, 0.2, -0.13, -0.02].map((v) => v * c),
      white,
    );
    p.polygon([0, -0.02, 0.06, 0.1, 0, 0.18, -0.06, 0.1].map((v) => v * c), base);
  } else {
    p.polygon(
      [-0.04, -0.22, 0.12, -0.22, 0.03, -0.03, 0.13, -0.03, -0.08, 0.23, -0.02, 0.03, -0.13, 0.03].map((v) => v * c),
      white,
    );
  }
  p.restore();
}

function drawFlames(p: Painter, f: RenderFrame, o: DrawOptions): void {
  if (f.flames.length === 0) return;
  const c = o.cell;
  const t = f.timeMs;
  const has = new Set(f.flames.map((fl) => fl.y * f.width + fl.x));
  const layers: Array<[number, string]> = [
    [0.96, '#ff6a1a'],
    [0.7, '#ffa726'],
    [0.4, '#fff2a8'],
  ];
  for (const [size, color] of layers) {
    for (const fl of f.flames) {
      const prog = 1 - fl.ttl / FLAME_TTL;
      const s = prog < 0.2 ? 0.55 + 0.45 * (prog / 0.2) : prog > 0.7 ? 0.5 + 0.5 * ((1 - prog) / 0.3) : 1;
      const flick = o.quality > 0 ? 0.95 + 0.05 * Math.sin(t / 40 + fl.x * 3 + fl.y * 5) : 1;
      const a = c * size * s * flick;
      const cx = (fl.x + 0.5) * c;
      const cy = (fl.y + 0.5) * c;
      p.rrect(cx - a / 2, cy - a / 2, a, a, a * 0.32, color);
      // bridge to neighbouring flame cells so a blast reads as one shape
      if (has.has(fl.y * f.width + fl.x - 1)) p.rect(cx - c / 2, cy - a / 2, c / 2, a, color);
      if (has.has(fl.y * f.width + fl.x + 1)) p.rect(cx, cy - a / 2, c / 2, a, color);
      if (has.has((fl.y - 1) * f.width + fl.x)) p.rect(cx - a / 2, cy - c / 2, a, c / 2, color);
      if (has.has((fl.y + 1) * f.width + fl.x)) p.rect(cx - a / 2, cy, a, c / 2, color);
    }
  }
}

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
  const fancy = o.quality > 0;
  const cx = x * c;
  const cy = y * c;
  const outline = darken(color, 0.4);
  const stride = moving ? Math.sin(t / 75) : 0;
  const bob = moving ? -Math.abs(stride) * c * 0.06 : Math.sin(t / 500 + x) * c * 0.012;

  if (fancy) p.oval(cx, cy + c * 0.34, c * 0.27, c * 0.09, { color: '#000000', alpha: 0.28 });

  p.save();
  p.translate(cx, cy + bob);
  const squash = moving ? 1 + 0.05 * stride : 1;
  p.scale(1 / squash, squash);

  // feet
  const foot = darken(color, 0.25);
  p.oval(-c * 0.13, c * 0.29 + stride * c * 0.03, c * 0.11, c * 0.075, foot);
  p.oval(c * 0.13, c * 0.29 - stride * c * 0.03, c * 0.11, c * 0.075, foot);

  // body
  const r = c * 0.33;
  p.circle(0, 0, r, fancy ? { linear: { x0: 0, y0: -r, x1: 0, y1: r, c0: lighten(color, 0.3), c1: color } } : color);
  p.strokeCircle(0, 0, r, c * 0.045, outline);
  if (fancy) p.oval(-c * 0.11, -c * 0.15, c * 0.12, c * 0.07, { color: '#ffffff', alpha: 0.3 });

  // antenna
  if (fancy) {
    p.line(0, -r + c * 0.02, 0, -r - c * 0.1, c * 0.05, outline);
    p.circle(0, -r - c * 0.12, c * 0.065, lighten(color, 0.5));
  }

  // face
  if (facing !== 'up') {
    const dx = facing === 'left' ? -1 : facing === 'right' ? 1 : 0;
    const eyes = dx === 0 ? [-0.11, 0.11] : [dx * 0.04, dx * 0.22];
    for (const e of eyes) {
      p.oval(e * c, -c * 0.03, c * 0.085, c * 0.105, '#ffffff');
      p.circle(e * c + dx * c * 0.03, -c * 0.01, c * 0.045, '#1b1b2f');
    }
    if (fancy && dx === 0) {
      p.circle(-c * 0.21, c * 0.09, c * 0.045, { color: '#ff5d7a', alpha: 0.35 });
      p.circle(c * 0.21, c * 0.09, c * 0.045, { color: '#ff5d7a', alpha: 0.35 });
    }
    p.oval(dx * c * 0.12, c * 0.14, c * 0.06, c * 0.03, '#1b1b2f');
  } else if (fancy) {
    p.oval(0, -c * 0.02, c * 0.16, c * 0.07, { color: '#ffffff', alpha: 0.15 });
  }
  p.restore();

  if (isYou) {
    const hop = Math.sin(t / 180) * c * 0.04;
    p.polygon([-0.1, -0.7, 0.1, -0.7, 0, -0.56].map((v, i) => (i % 2 === 0 ? cx + v * c : cy + v * c + hop)), '#ffffff');
  }
}

function drawDynamic(p: Painter, f: RenderFrame, o: DrawOptions): void {
  const t = f.timeMs;
  for (const u of f.powerUps) drawPowerUp(p, u.x, u.y, u.kind, t, o);
  for (const b of f.bombs) drawBomb(p, b.x, b.y, b.timer, t, o);
  drawFlames(p, f, o);
  const order = f.players.filter((pl) => pl.alive).sort((a, b) => a.y - b.y);
  for (const pl of order) {
    drawPlayer(p, PLAYER_COLORS[pl.id % PLAYER_COLORS.length], pl.x, pl.y, pl.facing, pl.moving, pl.id === f.you, t, o);
  }
}

export const cartoonTheme: Theme = {
  id: 'cartoon',
  label: 'Çizgi Film',
  ui: {
    bg: '#2a2250',
    panel: '#3a3170',
    panelBorder: '#5a4fa0',
    text: '#ffffff',
    muted: '#b7b0e0',
    accent: '#ff7a59',
    accentText: '#ffffff',
    danger: '#ff5d7a',
  },
  playerColors: PLAYER_COLORS,
  particleShape: 'round',
  drawStatic,
  drawDynamic,
};

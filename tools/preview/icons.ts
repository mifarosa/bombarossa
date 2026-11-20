/**
 * Icon concepts drawn with the preview rasteriser.
 *   npx tsx tools/preview/icons.ts <outDir>
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Painter } from '../../apps/mobile/src/render/painter';
import { RasterPainter } from './raster';

const S = 1024;

function star(p: Painter, cx: number, cy: number, r1: number, r2: number, n: number, fill: string, rot = 0): void {
  const pts: number[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (Math.PI * i) / n - Math.PI / 2;
    const r = i % 2 === 0 ? r1 : r2;
    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  p.polygon(pts, fill);
}

/** A: cute bomb with a face and a lit fuse, on purple. */
function bombFace(p: Painter): void {
  p.rect(0, 0, S, S, { linear: { x0: 0, y0: 0, x1: 0, y1: S, c0: '#6a4be0', c1: '#2a2250' } });
  p.circle(512, 560, 470, { radial: { cx: 512, cy: 560, r: 470, c0: '#ffffff', c1: '#ffffff00' }, alpha: 0.18 });
  // shadow
  p.oval(512, 880, 250, 46, { color: '#000000', alpha: 0.3 });
  // body
  p.circle(512, 560, 285, { radial: { cx: 410, cy: 440, r: 520, c0: '#6c7388', c1: '#0c0d14' } });
  p.oval(400, 420, 84, 52, { color: '#ffffff', alpha: 0.28 });
  // cap
  p.rrect(440, 232, 144, 86, 26, '#4b4f5c');
  p.rrect(452, 242, 120, 24, 12, { color: '#ffffff', alpha: 0.2 });
  // fuse
  p.line(512, 236, 560, 176, 26, '#c08a4b');
  p.line(560, 176, 640, 150, 26, '#c08a4b');
  // spark
  p.circle(660, 142, 96, { color: '#ff9f1a', alpha: 0.4 });
  star(p, 660, 142, 78, 30, 8, '#ffb020', 0.2);
  star(p, 660, 142, 46, 18, 8, '#fff1a8', 0.6);
  for (const [x, y, r] of [[770, 80, 14], [740, 230, 10], [560, 90, 12]]) p.circle(x, y, r, '#ffe066');
  // face
  p.oval(430, 560, 62, 82, '#ffffff');
  p.oval(594, 560, 62, 82, '#ffffff');
  p.circle(444, 580, 34, '#1b1b2f');
  p.circle(608, 580, 34, '#1b1b2f');
  p.circle(456, 566, 11, '#ffffff');
  p.circle(620, 566, 11, '#ffffff');
  p.oval(512, 712, 62, 34, '#ff6b81');
  p.oval(512, 700, 62, 24, '#0c0d14');
  p.circle(346, 676, 34, { color: '#ff5d7a', alpha: 0.45 });
  p.circle(678, 676, 34, { color: '#ff5d7a', alpha: 0.45 });
}

/** B: the game's little hero holding a bomb, on mint. */
function hero(p: Painter): void {
  p.rect(0, 0, S, S, { linear: { x0: 0, y0: 0, x1: 0, y1: S, c0: '#8be8cb', c1: '#2bb394' } });
  for (let i = 0; i < 6; i++) {
    p.rect(-100 + i * 220, 0, 90, S, { color: '#ffffff', alpha: 0.07 });
  }
  p.oval(480, 900, 300, 50, { color: '#000000', alpha: 0.22 });
  // feet
  p.oval(380, 836, 96, 60, '#2aa0cf');
  p.oval(580, 836, 96, 60, '#2aa0cf');
  // body
  const body = { linear: { x0: 0, y0: 230, x1: 0, y1: 830, c0: '#8bdcff', c1: '#3bb8ee' } };
  p.circle(480, 540, 300, body);
  p.strokeCircle(480, 540, 300, 30, '#1f7fa8');
  p.oval(380, 400, 104, 56, { color: '#ffffff', alpha: 0.35 });
  // antenna
  p.line(480, 250, 480, 150, 32, '#1f7fa8');
  p.circle(480, 120, 52, '#d6f3ff');
  // eyes
  p.oval(385, 520, 78, 100, '#ffffff');
  p.oval(575, 520, 78, 100, '#ffffff');
  p.circle(392, 545, 42, '#1b1b2f');
  p.circle(582, 545, 42, '#1b1b2f');
  p.circle(404, 528, 13, '#ffffff');
  p.circle(594, 528, 13, '#ffffff');
  p.circle(300, 650, 38, { color: '#ff5d7a', alpha: 0.4 });
  p.circle(660, 650, 38, { color: '#ff5d7a', alpha: 0.4 });
  p.oval(480, 668, 48, 26, '#1b1b2f');
  // bomb in front, bottom right
  p.circle(760, 760, 150, { radial: { cx: 710, cy: 700, r: 260, c0: '#6c7388', c1: '#0c0d14' } });
  p.oval(710, 705, 44, 28, { color: '#ffffff', alpha: 0.3 });
  p.rrect(722, 596, 76, 44, 14, '#4b4f5c');
  p.line(760, 600, 800, 556, 16, '#c08a4b');
  p.circle(812, 540, 56, { color: '#ff9f1a', alpha: 0.4 });
  star(p, 812, 540, 44, 17, 8, '#ffb020');
  star(p, 812, 540, 26, 10, 8, '#fff1a8', 0.5);
}

/** C: pixel-art bomb on a brick wall. */
function pixel(p: Painter): void {
  p.rect(0, 0, S, S, '#0b1d2a');
  const u = 64;
  const rows = [
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
  const pal: Record<string, string> = { k: '#1a1b24', g: '#7b8196', w: '#ffffff', c: '#59606f' };
  // glow tiles behind
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    p.rect(x * u, y * u, u, u, (x + y) % 2 === 0 ? '#12354a' : '#0f2d40');
  }
  const ox = (S - 12 * u) / 2;
  const oy = 120;
  p.rect(ox + 2 * u, oy + 10 * u + 10, 8 * u, 2 * u, '#00000055');
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch !== '.') p.rect(ox + x * u, oy + y * u, u + 1, u + 1, pal[ch]);
  }));
  // spark + fuse pixels
  p.rect(ox + 7 * u, oy - u, 2 * u, 2 * u, '#ffd43b');
  p.rect(ox + 9 * u, oy - 2 * u, u, u, '#ff922b');
  p.rect(ox + 6 * u, oy, u, u, '#59606f');
  // brick floor
  for (let r = 0; r < 3; r++) {
    for (let x = -1; x < 9; x++) {
      const bx = (x + (r % 2 ? 0.5 : 0)) * 128;
      const by = 832 + r * 64;
      p.rect(bx, by, 124, 60, '#c0562e');
      p.rect(bx, by, 124, 12, '#e07a4a');
    }
  }
  p.rect(0, 826, S, 6, '#6e2a14');
}

const out = process.argv[2] ?? 'icons-out';
mkdirSync(out, { recursive: true });
const concepts: Array<[string, (p: Painter) => void]> = [
  ['a-bomb-face', bombFace],
  ['b-hero', hero],
  ['c-pixel', pixel],
];
const sheet = new RasterPainter(1536, 512, 2);
sheet.clear('#101018');
concepts.forEach(([, draw], i) => {
  sheet.save();
  sheet.translate(i * 512, 0);
  sheet.scale(0.5, 0.5);
  draw(sheet);
  sheet.restore();
});
sheet.save_png(join(out, 'icon-concepts.png'));
console.log('wrote', join(out, 'icon-concepts.png'));

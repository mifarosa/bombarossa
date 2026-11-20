/**
 * Generates the app icon set (iOS icon, Android adaptive layers, splash) from code.
 *   npx tsx tools/preview/icons.ts <assetsDir> [previewDir]
 * Writes icon.png, android-icon-{foreground,background,monochrome}.png, splash-icon.png and favicon.png
 * into <assetsDir>, and (optionally) a verification sheet into [previewDir].
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Painter } from '../../apps/mobile/src/render/painter';
import { RasterPainter } from './raster';

const S = 1024;
const PURPLE_TOP = '#6a4be0';
const PURPLE_BOTTOM = '#2a2250';

function star(p: Painter, cx: number, cy: number, r1: number, r2: number, n: number, fill: string, rot = 0): void {
  const pts: number[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (Math.PI * i) / n - Math.PI / 2;
    const r = i % 2 === 0 ? r1 : r2;
    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  p.polygon(pts, fill);
}

function background(p: Painter): void {
  p.rect(0, 0, S, S, { linear: { x0: 0, y0: 0, x1: 0, y1: S, c0: PURPLE_TOP, c1: PURPLE_BOTTOM } });
  p.circle(512, 560, 470, { radial: { cx: 512, cy: 560, r: 470, c0: '#ffffff', c1: '#ffffff00' }, alpha: 0.18 });
}

/** The cute bomb with a lit fuse. Designed in a 1024 box, bomb centred around (512, 560). */
function bomb(p: Painter, withShadow = true): void {
  if (withShadow) p.oval(512, 880, 250, 46, { color: '#000000', alpha: 0.3 });
  p.circle(512, 560, 285, { radial: { cx: 410, cy: 440, r: 520, c0: '#6c7388', c1: '#0c0d14' } });
  p.oval(400, 420, 84, 52, { color: '#ffffff', alpha: 0.28 });
  p.rrect(440, 232, 144, 86, 26, '#4b4f5c');
  p.rrect(452, 242, 120, 24, 12, { color: '#ffffff', alpha: 0.2 });
  p.line(512, 236, 560, 176, 26, '#c08a4b');
  p.line(560, 176, 640, 150, 26, '#c08a4b');
  p.circle(660, 142, 96, { color: '#ff9f1a', alpha: 0.4 });
  star(p, 660, 142, 78, 30, 8, '#ffb020', 0.2);
  star(p, 660, 142, 46, 18, 8, '#fff1a8', 0.6);
  for (const [x, y, r] of [[770, 80, 14], [740, 230, 10], [560, 90, 12]]) p.circle(x, y, r, '#ffe066');
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

/** Single-colour silhouette for Android's themed (monochrome) icons. Face features are cut out. */
function mono(p: RasterPainter): void {
  const w = '#ffffff';
  p.circle(512, 560, 285, w);
  p.rrect(440, 232, 144, 86, 26, w);
  p.line(512, 236, 560, 176, 26, w);
  p.line(560, 176, 640, 150, 26, w);
  star(p, 660, 142, 78, 30, 8, w, 0.2);
  p.erase = true;
  p.oval(430, 560, 62, 82, w);
  p.oval(594, 560, 62, 82, w);
  p.oval(512, 706, 62, 30, w);
  p.erase = false;
  p.circle(444, 580, 34, w);
  p.circle(608, 580, 34, w);
}

/** Fits the bomb inside Android's adaptive-icon safe zone (a circle ~66% of the canvas). */
function inSafeZone(p: Painter, draw: () => void, scale = 0.74): void {
  p.save();
  p.translate(512, 512);
  p.scale(scale, scale);
  p.translate(-505, -500);
  draw();
  p.restore();
}

function render(size: number, draw: (p: RasterPainter) => void, transparent: boolean, ss = 2): RasterPainter {
  const p = new RasterPainter(size, size, ss);
  p.clear(transparent ? '#00000000' : '#000000');
  p.scale(size / S, size / S);
  draw(p);
  return p;
}

const assetsDir = process.argv[2];
const previewDir = process.argv[3];

if (assetsDir) {
  mkdirSync(assetsDir, { recursive: true });
  const opaqueIcon = (p: RasterPainter) => {
    background(p);
    bomb(p);
  };
  render(S, opaqueIcon, false).save_png(join(assetsDir, 'icon.png'));
  render(S, background, false).save_png(join(assetsDir, 'android-icon-background.png'));
  render(S, (p) => inSafeZone(p, () => bomb(p)), true).save_png(join(assetsDir, 'android-icon-foreground.png'), true);
  render(S, (p) => inSafeZone(p, () => mono(p)), true).save_png(join(assetsDir, 'android-icon-monochrome.png'), true);
  render(S, (p) => inSafeZone(p, () => bomb(p, false), 0.95), true).save_png(join(assetsDir, 'splash-icon.png'), true);
  render(48, opaqueIcon, false, 3).save_png(join(assetsDir, 'favicon.png'));
  console.log('wrote icon set to', assetsDir);
}

if (previewDir) {
  mkdirSync(previewDir, { recursive: true });
  // Verification sheet: iOS icon, Android round + themed, and small sizes as seen on a home screen.
  const sheet = new RasterPainter(1220, 330, 2);
  sheet.clear('#1b1b26');
  // Every tile is drawn on its own canvas (so masks can't bleed into neighbours) and then copied in.
  const place = (x: number, size: number, draw: (p: RasterPainter) => void) => {
    const tile = render(size, draw, false, 2);
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const i = (py * size + px) * 4;
        const o = ((30 + py) * 1220 + (x + px)) * 4;
        for (let k = 0; k < 3; k++) sheet.data[o + k] = tile.data[i + k];
      }
    }
  };
  place(20, 270, (p) => {
    background(p);
    bomb(p);
  });
  // Android adaptive icon in a circular mask, with the safe-zone ring
  place(320, 270, (p) => {
    background(p);
    inSafeZone(p, () => bomb(p));
    p.strokeCircle(512, 512, 341 + 400, 800, '#1b1b26');
    p.strokeCircle(512, 512, 341, 4, '#ffffff', 0.35);
  });
  // themed icon: tinted monochrome
  place(620, 270, (p) => {
    p.circle(512, 512, 341, '#c9c0ff');
    inSafeZone(p, () => {
      const w = new RasterPainter(S, S, 2);
      w.clear('#00000000');
      mono(w);
      // draw the alpha mask as dark ink on the light disc
      for (let y = 0; y < S; y += 2) {
        for (let x = 0; x < S; x += 2) {
          const a = w.data[(y * S + x) * 4 + 3];
          if (a > 0.5) p.rect(x, y, 2, 2, '#2a2250');
        }
      }
    });
    p.strokeCircle(512, 512, 341 + 400, 800, '#1b1b26');
  });
  // small sizes
  const small = (x: number, y: number, size: number) => {
    const p = render(size, (q) => {
      background(q);
      bomb(q);
    }, false, 3);
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const i = (py * size + px) * 4;
        const c = `#${[0, 1, 2].map((k) => Math.round(p.data[i + k]).toString(16).padStart(2, '0')).join('')}`;
        sheet.rect(x + px, y + py, 1, 1, c);
      }
    }
  };
  small(940, 30, 120);
  small(1080, 30, 60);
  small(1080, 110, 40);
  small(940, 170, 29);
  sheet.save_png(join(previewDir, 'icon-set.png'));
  console.log('wrote', join(previewDir, 'icon-set.png'));
}

if (!assetsDir && !previewDir) console.log('usage: tsx tools/preview/icons.ts <assetsDir> [previewDir]');

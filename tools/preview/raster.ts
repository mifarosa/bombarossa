import { deflateSync, crc32 } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import type { Fill, FillStyle, Painter } from '../../apps/mobile/src/render/painter';

type Mat = [number, number, number, number, number, number]; // x' = a*x + c*y + e ; y' = b*x + d*y + f
const IDENT: Mat = [1, 0, 0, 1, 0, 0];

function mul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function inv(m: Mat): Mat {
  const det = m[0] * m[3] - m[1] * m[2];
  const a = m[3] / det;
  const b = -m[1] / det;
  const c = -m[2] / det;
  const d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

type RGBA = [number, number, number, number];

function parseColor(hex: string): RGBA {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
    h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
  ];
}

const mixc = (a: RGBA, b: RGBA, t: number): RGBA => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
  a[3] + (b[3] - a[3]) * t,
];

/** A tiny anti-aliased software rasteriser that implements the Painter interface. For previews only. */
export class RasterPainter implements Painter {
  readonly data: Float32Array;
  private m: Mat = IDENT;
  private stack: Mat[] = [];
  constructor(
    readonly width: number,
    readonly height: number,
    private readonly ss = 3,
  ) {
    this.data = new Float32Array(width * height * 3);
  }

  clear(color: string): void {
    const [r, g, b] = parseColor(color);
    for (let i = 0; i < this.width * this.height; i++) {
      this.data[i * 3] = r;
      this.data[i * 3 + 1] = g;
      this.data[i * 3 + 2] = b;
    }
  }

  save(): void {
    this.stack.push(this.m);
  }
  restore(): void {
    this.m = this.stack.pop() ?? IDENT;
  }
  translate(x: number, y: number): void {
    this.m = mul(this.m, [1, 0, 0, 1, x, y]);
  }
  scale(sx: number, sy: number): void {
    this.m = mul(this.m, [sx, 0, 0, sy, 0, 0]);
  }
  rotate(deg: number): void {
    const r = (deg * Math.PI) / 180;
    this.m = mul(this.m, [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]);
  }

  private draw(
    bounds: [number, number, number, number],
    inside: (x: number, y: number) => boolean,
    colorAt: (x: number, y: number) => RGBA,
    alpha = 1,
  ): void {
    const [x0, y0, x1, y1] = bounds;
    const corners = [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ].map(([x, y]) => [this.m[0] * x + this.m[2] * y + this.m[4], this.m[1] * x + this.m[3] * y + this.m[5]]);
    const minX = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[0]))));
    const maxX = Math.min(this.width - 1, Math.ceil(Math.max(...corners.map((c) => c[0]))));
    const minY = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[1]))));
    const maxY = Math.min(this.height - 1, Math.ceil(Math.max(...corners.map((c) => c[1]))));
    const im = inv(this.m);
    const ss = this.ss;
    const total = ss * ss;
    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        let hit = 0;
        for (let sy = 0; sy < ss; sy++) {
          for (let sx = 0; sx < ss; sx++) {
            const dx = px + (sx + 0.5) / ss;
            const dy = py + (sy + 0.5) / ss;
            const lx = im[0] * dx + im[2] * dy + im[4];
            const ly = im[1] * dx + im[3] * dy + im[5];
            if (inside(lx, ly)) hit++;
          }
        }
        if (hit === 0) continue;
        const cx = px + 0.5;
        const cy = py + 0.5;
        const lx = im[0] * cx + im[2] * cy + im[4];
        const ly = im[1] * cx + im[3] * cy + im[5];
        const col = colorAt(lx, ly);
        const a = (hit / total) * col[3] * alpha;
        const i = (py * this.width + px) * 3;
        this.data[i] += (col[0] - this.data[i]) * a;
        this.data[i + 1] += (col[1] - this.data[i + 1]) * a;
        this.data[i + 2] += (col[2] - this.data[i + 2]) * a;
      }
    }
  }

  private colorFn(fill: Fill): { at: (x: number, y: number) => RGBA; alpha: number } {
    const f: FillStyle = typeof fill === 'string' ? { color: fill } : fill;
    const alpha = f.alpha ?? 1;
    if (f.linear) {
      const g = f.linear;
      const c0 = parseColor(g.c0);
      const c1 = parseColor(g.c1);
      const dx = g.x1 - g.x0;
      const dy = g.y1 - g.y0;
      const len2 = dx * dx + dy * dy || 1;
      return {
        alpha,
        at: (x, y) => mixc(c0, c1, Math.max(0, Math.min(1, ((x - g.x0) * dx + (y - g.y0) * dy) / len2))),
      };
    }
    if (f.radial) {
      const g = f.radial;
      const c0 = parseColor(g.c0);
      const c1 = parseColor(g.c1);
      return {
        alpha,
        at: (x, y) => mixc(c0, c1, Math.max(0, Math.min(1, Math.hypot(x - g.cx, y - g.cy) / g.r))),
      };
    }
    const c = parseColor(f.color ?? '#000000');
    return { alpha, at: () => c };
  }

  rect(x: number, y: number, w: number, h: number, fill: Fill): void {
    const { at, alpha } = this.colorFn(fill);
    this.draw([x, y, x + w, y + h], (lx, ly) => lx >= x && lx < x + w && ly >= y && ly < y + h, at, alpha);
  }

  private sdRound(lx: number, ly: number, x: number, y: number, w: number, h: number, r: number): number {
    const hx = w / 2;
    const hy = h / 2;
    const rr = Math.min(r, hx, hy);
    const qx = Math.abs(lx - (x + hx)) - (hx - rr);
    const qy = Math.abs(ly - (y + hy)) - (hy - rr);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr;
  }

  rrect(x: number, y: number, w: number, h: number, r: number, fill: Fill): void {
    const { at, alpha } = this.colorFn(fill);
    this.draw([x, y, x + w, y + h], (lx, ly) => this.sdRound(lx, ly, x, y, w, h, r) <= 0, at, alpha);
  }

  circle(cx: number, cy: number, r: number, fill: Fill): void {
    this.oval(cx, cy, r, r, fill);
  }

  oval(cx: number, cy: number, rx: number, ry: number, fill: Fill): void {
    const { at, alpha } = this.colorFn(fill);
    this.draw(
      [cx - rx, cy - ry, cx + rx, cy + ry],
      (lx, ly) => ((lx - cx) / rx) ** 2 + ((ly - cy) / ry) ** 2 <= 1,
      at,
      alpha,
    );
  }

  polygon(points: number[], fill: Fill): void {
    const { at, alpha } = this.colorFn(fill);
    const xs = points.filter((_, i) => i % 2 === 0);
    const ys = points.filter((_, i) => i % 2 === 1);
    const n = xs.length;
    this.draw(
      [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
      (lx, ly) => {
        let inside = false;
        for (let i = 0, j = n - 1; i < n; j = i++) {
          if (ys[i] > ly !== ys[j] > ly && lx < ((xs[j] - xs[i]) * (ly - ys[i])) / (ys[j] - ys[i]) + xs[i]) inside = !inside;
        }
        return inside;
      },
      at,
      alpha,
    );
  }

  strokeCircle(cx: number, cy: number, r: number, width: number, color: string, alpha = 1): void {
    const c = parseColor(color);
    const hw = width / 2;
    this.draw(
      [cx - r - hw, cy - r - hw, cx + r + hw, cy + r + hw],
      (lx, ly) => Math.abs(Math.hypot(lx - cx, ly - cy) - r) <= hw,
      () => c,
      alpha,
    );
  }

  strokeRRect(x: number, y: number, w: number, h: number, r: number, width: number, color: string, alpha = 1): void {
    const c = parseColor(color);
    const hw = width / 2;
    this.draw(
      [x - hw, y - hw, x + w + hw, y + h + hw],
      (lx, ly) => Math.abs(this.sdRound(lx, ly, x, y, w, h, r)) <= hw,
      () => c,
      alpha,
    );
  }

  line(x0: number, y0: number, x1: number, y1: number, width: number, color: string, alpha = 1): void {
    const c = parseColor(color);
    const hw = width / 2;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy || 1;
    this.draw(
      [Math.min(x0, x1) - hw, Math.min(y0, y1) - hw, Math.max(x0, x1) + hw, Math.max(y0, y1) + hw],
      (lx, ly) => {
        const t = Math.max(0, Math.min(1, ((lx - x0) * dx + (ly - y0) * dy) / len2));
        return Math.hypot(lx - (x0 + dx * t), ly - (y0 + dy * t)) <= hw;
      },
      () => c,
      alpha,
    );
  }

  toPng(): Buffer {
    const { width, height } = this;
    const raw = Buffer.alloc((width * 3 + 1) * height);
    for (let y = 0; y < height; y++) {
      raw[y * (width * 3 + 1)] = 0;
      for (let x = 0; x < width * 3; x++) {
        raw[y * (width * 3 + 1) + 1 + x] = Math.max(0, Math.min(255, Math.round(this.data[y * width * 3 + x])));
      }
    }
    const chunk = (type: string, body: Buffer) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(body.length);
      const typeBuf = Buffer.from(type, 'ascii');
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, body])) >>> 0);
      return Buffer.concat([len, typeBuf, body, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 2; // truecolour
    return Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }

  save_png(path: string): void {
    writeFileSync(path, this.toPng());
  }
}

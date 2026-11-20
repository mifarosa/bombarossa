import { PaintStyle, Skia, StrokeCap, TileMode, type SkCanvas, type SkPaint } from '@shopify/react-native-skia';
import { normalizeFill, type Fill, type Painter } from './painter';

// Paints are cached by their full description. Themes draw gradient entities
// around a translated origin so the same gradient is reused for every entity.
const paintCache = new Map<string, SkPaint>();
const MAX_CACHE = 600;

function remember(key: string, make: () => SkPaint): SkPaint {
  let paint = paintCache.get(key);
  if (!paint) {
    if (paintCache.size > MAX_CACHE) paintCache.clear();
    paint = make();
    paintCache.set(key, paint);
  }
  return paint;
}

function fillPaint(fill: Fill): SkPaint {
  const f = normalizeFill(fill);
  const alpha = f.alpha ?? 1;
  let key: string;
  if (f.linear) {
    const g = f.linear;
    key = `L${g.x0},${g.y0},${g.x1},${g.y1},${g.c0},${g.c1}|${alpha}`;
  } else if (f.radial) {
    const g = f.radial;
    key = `R${g.cx},${g.cy},${g.r},${g.c0},${g.c1}|${alpha}`;
  } else {
    key = `C${f.color}|${alpha}`;
  }
  return remember(key, () => {
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    if (f.linear) {
      const g = f.linear;
      paint.setShader(
        Skia.Shader.MakeLinearGradient(
          { x: g.x0, y: g.y0 },
          { x: g.x1, y: g.y1 },
          [Skia.Color(g.c0), Skia.Color(g.c1)],
          null,
          TileMode.Clamp,
        ),
      );
    } else if (f.radial) {
      const g = f.radial;
      paint.setShader(
        Skia.Shader.MakeRadialGradient({ x: g.cx, y: g.cy }, g.r, [Skia.Color(g.c0), Skia.Color(g.c1)], null, TileMode.Clamp),
      );
    } else {
      paint.setColor(Skia.Color(f.color ?? '#000000'));
    }
    if (alpha !== 1) paint.setAlphaf(alpha);
    return paint;
  });
}

function strokePaint(color: string, width: number, alpha: number): SkPaint {
  return remember(`S${color}|${width}|${alpha}`, () => {
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    paint.setStyle(PaintStyle.Stroke);
    paint.setStrokeWidth(width);
    paint.setStrokeCap(StrokeCap.Round);
    paint.setColor(Skia.Color(color));
    if (alpha !== 1) paint.setAlphaf(alpha);
    return paint;
  });
}

/** Painter backed by a Skia canvas (the picture recorder's canvas on the phone). */
export class SkiaPainter implements Painter {
  constructor(private readonly canvas: SkCanvas) {}

  save(): void {
    this.canvas.save();
  }
  restore(): void {
    this.canvas.restore();
  }
  translate(x: number, y: number): void {
    this.canvas.translate(x, y);
  }
  scale(sx: number, sy: number): void {
    this.canvas.scale(sx, sy);
  }
  rotate(deg: number): void {
    this.canvas.rotate(deg, 0, 0);
  }

  rect(x: number, y: number, w: number, h: number, fill: Fill): void {
    this.canvas.drawRect(Skia.XYWHRect(x, y, w, h), fillPaint(fill));
  }
  rrect(x: number, y: number, w: number, h: number, r: number, fill: Fill): void {
    this.canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(x, y, w, h), r, r), fillPaint(fill));
  }
  circle(cx: number, cy: number, r: number, fill: Fill): void {
    this.canvas.drawCircle(cx, cy, r, fillPaint(fill));
  }
  oval(cx: number, cy: number, rx: number, ry: number, fill: Fill): void {
    this.canvas.drawOval(Skia.XYWHRect(cx - rx, cy - ry, rx * 2, ry * 2), fillPaint(fill));
  }
  polygon(points: number[], fill: Fill): void {
    if (points.length < 6) return;
    const builder = Skia.PathBuilder.Make();
    builder.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) builder.lineTo(points[i], points[i + 1]);
    builder.close();
    this.canvas.drawPath(builder.detach(), fillPaint(fill));
  }
  strokeCircle(cx: number, cy: number, r: number, width: number, color: string, alpha = 1): void {
    this.canvas.drawCircle(cx, cy, r, strokePaint(color, width, alpha));
  }
  strokeRRect(x: number, y: number, w: number, h: number, r: number, width: number, color: string, alpha = 1): void {
    this.canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(x, y, w, h), r, r), strokePaint(color, width, alpha));
  }
  line(x0: number, y0: number, x1: number, y1: number, width: number, color: string, alpha = 1): void {
    this.canvas.drawLine(x0, y0, x1, y1, strokePaint(color, width, alpha));
  }
}

/**
 * Minimal 2D drawing interface the themes draw against. On the phone it is
 * backed by Skia; in tools/preview it is backed by a tiny software rasteriser,
 * so themes can be checked visually without a device.
 */
export interface LinearGradient {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  c0: string;
  c1: string;
}

export interface RadialGradient {
  cx: number;
  cy: number;
  r: number;
  c0: string;
  c1: string;
}

export interface FillStyle {
  /** '#rrggbb' or '#rrggbbaa'. */
  color?: string;
  alpha?: number;
  linear?: LinearGradient;
  radial?: RadialGradient;
}

export type Fill = string | FillStyle;

export interface Painter {
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(sx: number, sy: number): void;
  /** Rotates around the current origin, in degrees. */
  rotate(deg: number): void;

  rect(x: number, y: number, w: number, h: number, fill: Fill): void;
  rrect(x: number, y: number, w: number, h: number, r: number, fill: Fill): void;
  circle(cx: number, cy: number, r: number, fill: Fill): void;
  oval(cx: number, cy: number, rx: number, ry: number, fill: Fill): void;
  /** Flat [x0, y0, x1, y1, ...] list. */
  polygon(points: number[], fill: Fill): void;

  strokeCircle(cx: number, cy: number, r: number, width: number, color: string, alpha?: number): void;
  strokeRRect(x: number, y: number, w: number, h: number, r: number, width: number, color: string, alpha?: number): void;
  line(x0: number, y0: number, x1: number, y1: number, width: number, color: string, alpha?: number): void;
}

export function normalizeFill(fill: Fill): FillStyle {
  return typeof fill === 'string' ? { color: fill } : fill;
}

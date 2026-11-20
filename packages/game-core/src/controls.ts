import { Dir } from './types';

export interface JoystickConfig {
  /** Distance from the stick origin (px) below which no direction is reported. */
  deadzone: number;
  /** The other axis must beat the current one by this factor before we switch, so the stick doesn't flicker on diagonals. */
  hysteresis: number;
}

export const DEFAULT_JOYSTICK: JoystickConfig = { deadzone: 14, hysteresis: 1.3 };

/** Maps a stick vector (screen px, y grows downward) to one of four directions, with hysteresis. */
export function dirFromVector(
  dx: number,
  dy: number,
  prev: Dir | null,
  cfg: JoystickConfig = DEFAULT_JOYSTICK,
): Dir | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < cfg.deadzone) return null;

  const horizontal = (): Dir => (dx > 0 ? 'right' : 'left');
  const vertical = (): Dir => (dy > 0 ? 'down' : 'up');

  if (prev === 'left' || prev === 'right') {
    // Stay horizontal unless vertical clearly wins.
    return ay > ax * cfg.hysteresis ? vertical() : horizontal();
  }
  if (prev === 'up' || prev === 'down') {
    return ax > ay * cfg.hysteresis ? horizontal() : vertical();
  }
  return ax >= ay ? horizontal() : vertical();
}

/**
 * A floating stick: it appears where the thumb lands and follows the thumb if
 * it is dragged far away, so the player never runs out of stick.
 */
export class FloatingStick {
  originX = 0;
  originY = 0;
  x = 0;
  y = 0;
  dir: Dir | null = null;

  constructor(
    private readonly radius = 56,
    private readonly cfg: JoystickConfig = DEFAULT_JOYSTICK,
  ) {}

  begin(x: number, y: number): void {
    this.originX = this.x = x;
    this.originY = this.y = y;
    this.dir = null;
  }

  move(x: number, y: number): Dir | null {
    this.x = x;
    this.y = y;
    const dx = x - this.originX;
    const dy = y - this.originY;
    const dist = Math.hypot(dx, dy);
    const follow = this.radius * 1.5;
    if (dist > follow) {
      // Drag the base along so it stays within reach of the thumb.
      const k = (dist - follow) / dist;
      this.originX += dx * k;
      this.originY += dy * k;
    }
    this.dir = dirFromVector(x - this.originX, y - this.originY, this.dir, this.cfg);
    return this.dir;
  }

  end(): void {
    this.dir = null;
  }

  /** Knob offset from the base, clamped to the stick radius (for drawing). */
  knob(): { x: number; y: number } {
    const dx = this.x - this.originX;
    const dy = this.y - this.originY;
    const d = Math.hypot(dx, dy);
    if (d <= this.radius || d === 0) return { x: dx, y: dy };
    return { x: (dx / d) * this.radius, y: (dy / d) * this.radius };
  }
}
